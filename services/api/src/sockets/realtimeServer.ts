import { Server as HttpServer } from "node:http";

import { Server } from "socket.io";
import { z } from "zod";

import { locationRepository } from "../modules/locations/location.repository.js";
import { LocationActor, locationActors } from "../shared/types/domain.js";
import { verifyAccessToken } from "../shared/utils/token.js";
import { socketEvents } from "./events.js";
import { registerVolunteerSocket, unregisterVolunteerSocket } from "./volunteerPresence.js";

let io: Server | null = null;

type EventName = string | readonly string[];

const locationUpdatePayloadSchema = z.object({
  caseId: z.string().uuid().optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  heading: z.number().min(0).max(360).optional(),
  speedKmh: z.number().min(0).max(320).optional(),
  etaMinutes: z.number().int().min(0).max(180).optional(),
  actorType: z.enum(locationActors).optional(),
  ambulanceId: z.string().uuid().optional()
});

const callStatePayloadSchema = z.object({
  emergencyId: z.string().uuid(),
  at: z.string().trim().min(4).max(64).optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

const normalizeEvents = (events: EventName): string[] =>
  (Array.isArray(events) ? [...events] : [events]).filter(Boolean);

const emitToRooms = (rooms: string[], events: EventName, payload: unknown): void => {
  const allEvents = normalizeEvents(events);

  for (const room of rooms) {
    for (const eventName of allEvents) {
      io?.to(room).emit(eventName, payload);
    }
  }
};

const toActorType = (role: string): LocationActor => {
  if (role === "VOLUNTEER") {
    return "VOLUNTEER";
  }

  if (role === "AMBULANCE_CREW") {
    return "AMBULANCE";
  }

  return role === "CITIZEN" ? "CITIZEN" : "DISPATCHER";
};

const emitToDispatchRoles = (events: EventName, payload: unknown): void => {
  emitToRooms(["role:DISPATCHER", "role:ADMIN"], events, payload);
};

const emitToCase = (caseId: string, events: EventName, payload: unknown): void => {
  emitToRooms([`case:${caseId}`], events, payload);
};

const emitToCaseAndDispatch = (caseId: string, events: EventName, payload: unknown): void => {
  emitToCase(caseId, events, payload);
  emitToDispatchRoles(events, payload);
};

const emergencyCreatedEvents = [socketEvents.emergencyCreated, socketEvents.emergencyCreatedV2] as const;
const volunteerRequestedEvents = [socketEvents.volunteerAssigned, socketEvents.volunteerRequestedV2] as const;
const volunteerAcceptedEvents = [socketEvents.volunteerResponded, socketEvents.volunteerAcceptedV2] as const;
const locationChangedEvents = [socketEvents.locationChanged, socketEvents.locationUpdateV2] as const;
const statusChangedEvents = [socketEvents.statusChanged, socketEvents.statusChangedV2] as const;

const emitCallLifecycle = (
  eventName: typeof socketEvents.callStarted | typeof socketEvents.callConnected | typeof socketEvents.callEnded,
  emergencyId: string,
  payload: Record<string, unknown>
) => {
  const eventPayload: Record<string, unknown> = {
    emergencyId,
    caseId: emergencyId,
    at: new Date().toISOString(),
    ...payload
  };

  emitToCaseAndDispatch(emergencyId, eventName, eventPayload);

  const userId = typeof eventPayload["userId"] === "string" ? (eventPayload["userId"] as string) : null;
  if (userId) {
    emitToRooms([`user:${userId}`], eventName, eventPayload);
  }
};

export const attachRealtimeServer = (server: HttpServer): void => {
  io = new Server(server, {
    cors: {
      origin: true,
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Authorization", "Content-Type", "Accept", "Origin", "X-Requested-With"]
    }
  });

  io.on("connection", (socket) => {
    const handshakeToken =
      typeof socket.handshake.auth.token === "string"
        ? socket.handshake.auth.token
        : typeof socket.handshake.headers.authorization === "string" &&
            socket.handshake.headers.authorization.startsWith("Bearer ")
          ? socket.handshake.headers.authorization.slice("Bearer ".length)
          : null;

    if (!handshakeToken) {
      socket.emit(socketEvents.serverError, {
        message: "Socket authentication token is required"
      });
      socket.disconnect(true);
      return;
    }

    try {
      const auth = verifyAccessToken(handshakeToken);
      socket.join(`user:${auth.userId}`);
      socket.join(`role:${auth.role}`);

      if (auth.role === "VOLUNTEER") {
        registerVolunteerSocket(auth.userId);
        socket.once("disconnect", () => {
          unregisterVolunteerSocket(auth.userId);
        });
      }

      if (auth.role === "DISPATCHER" || auth.role === "ADMIN") {
        socket.join("dispatch:center");
      }

      socket.emit(socketEvents.connectionReady, {
        userId: auth.userId,
        role: auth.role,
        at: new Date().toISOString()
      });

      socket.on(socketEvents.dashboardJoin, () => {
        if (auth.role === "DISPATCHER" || auth.role === "ADMIN") {
          socket.join("dispatch:center");
        }
      });

      socket.on(socketEvents.caseJoin, (caseId: string) => {
        socket.join(`case:${caseId}`);
      });

      socket.on(socketEvents.caseLeave, (caseId: string) => {
        socket.leave(`case:${caseId}`);
      });

      socket.on(socketEvents.newRequest, (payload: unknown) => {
        console.log("[socket] new_request received from citizen", auth.userId);
        emitToDispatchRoles(socketEvents.newRequest, payload);
        emitToRooms(["role:VOLUNTEER"], socketEvents.newRequest, payload);
      });

      const handleCallStateEvent = (
        eventName: typeof socketEvents.callStarted | typeof socketEvents.callConnected | typeof socketEvents.callEnded,
        input: unknown
      ) => {
        try {
          const payload = callStatePayloadSchema.parse(input);
          socket.join(`case:${payload.emergencyId}`);

          emitCallLifecycle(eventName, payload.emergencyId, {
            userId: auth.userId,
            role: auth.role,
            at: payload.at,
            metadata: payload.metadata ?? {}
          });
        } catch {
          socket.emit(socketEvents.serverError, {
            message: "Invalid call lifecycle payload"
          });
        }
      };

      socket.on(socketEvents.callStarted, (input: unknown) => {
        handleCallStateEvent(socketEvents.callStarted, input);
      });

      socket.on(socketEvents.callConnected, (input: unknown) => {
        handleCallStateEvent(socketEvents.callConnected, input);
      });

      socket.on(socketEvents.callEnded, (input: unknown) => {
        handleCallStateEvent(socketEvents.callEnded, input);
      });

      const handleLocationUpdate = async (input: unknown): Promise<void> => {
        try {
          const payload = locationUpdatePayloadSchema.parse(input);
          const actorType = payload.actorType ?? toActorType(auth.role);

          const location = await locationRepository.createLocationUpdate({
            caseId: payload.caseId,
            actorType,
            actorUserId: auth.userId,
            ambulanceId: payload.ambulanceId,
            latitude: payload.latitude,
            longitude: payload.longitude,
            heading: payload.heading,
            speedKmh: payload.speedKmh,
            etaMinutes: payload.etaMinutes
          });

          if (actorType === "VOLUNTEER") {
            await locationRepository.updateVolunteerCoordinate(auth.userId, payload.latitude, payload.longitude);
          }

          if (actorType === "AMBULANCE" && payload.ambulanceId) {
            await locationRepository.updateAmbulanceCoordinate(
              payload.ambulanceId,
              payload.latitude,
              payload.longitude
            );
          }

          const locationPayload = {
            id: location.id,
            caseId: location.case_id,
            actorType: location.actor_type,
            actorUserId: location.actor_user_id,
            ambulanceId: location.ambulance_id,
            latitude: Number(location.latitude),
            longitude: Number(location.longitude),
            heading: location.heading ? Number(location.heading) : null,
            speedKmh: location.speed_kmh ? Number(location.speed_kmh) : null,
            etaMinutes: location.eta_minutes,
            recordedAt: location.recorded_at
          };

          if (location.case_id) {
            emitToCaseAndDispatch(location.case_id, locationChangedEvents, {
              caseId: location.case_id,
              location: locationPayload
            });
          }
        } catch {
          socket.emit(socketEvents.serverError, {
            message: "Invalid location update payload"
          });
        }
      };

      socket.on(socketEvents.locationUpdate, (input: unknown) => {
        void handleLocationUpdate(input);
      });

      socket.on(socketEvents.locationUpdateV2, (input: unknown) => {
        void handleLocationUpdate(input);
      });
    } catch {
      socket.emit(socketEvents.serverError, {
        message: "Invalid socket authentication token"
      });
      socket.disconnect(true);
    }
  });
};

export const emitEmergencyCreated = (payload: unknown): void => {
  console.log("[socket] broadcasting new emergency request");
  emitToDispatchRoles(emergencyCreatedEvents, payload);
  emitToDispatchRoles(socketEvents.newRequest, payload);
  emitToRooms(["role:VOLUNTEER"], emergencyCreatedEvents, payload);
  emitToRooms(["role:VOLUNTEER"], socketEvents.newRequest, payload);

  const reportingUserId =
    typeof payload === "object" && payload && "reportingUserId" in payload
      ? (payload as { reportingUserId?: string }).reportingUserId
      : null;

  if (reportingUserId) {
    emitToRooms([`user:${reportingUserId}`], emergencyCreatedEvents, payload);
  }
};

export const emitEmergencyUpdate = (caseId: string, payload: unknown): void => {
  emitToCaseAndDispatch(caseId, socketEvents.emergencyUpdate, payload);
  emitToRooms(["role:VOLUNTEER"], socketEvents.emergencyUpdate, payload);
};

export const emitStatusChanged = (caseId: string, payload: unknown): void => {
  emitToCaseAndDispatch(caseId, statusChangedEvents, payload);
};

export const emitAmbulanceAssigned = (caseId: string, payload: unknown): void => {
  emitToCaseAndDispatch(caseId, [socketEvents.ambulanceAssigned, socketEvents.ambulanceUpdateV2], payload);
};

export const emitAmbulanceUpdate = (caseId: string, payload: unknown): void => {
  emitToCaseAndDispatch(caseId, socketEvents.ambulanceUpdateV2, payload);
};

export const emitVolunteerAssigned = (caseId: string, payload: unknown): void => {
  emitToCaseAndDispatch(caseId, volunteerRequestedEvents, payload);
  emitToRooms(["role:VOLUNTEER"], volunteerRequestedEvents, payload);
};

export const emitVolunteerResponse = (caseId: string, payload: unknown): void => {
  emitToCaseAndDispatch(caseId, socketEvents.volunteerResponded, payload);

  const assignmentStatus =
    typeof payload === "object" && payload && "assignment" in payload
      ? (payload as { assignment?: { status?: string } }).assignment?.status
      : null;

  if (assignmentStatus === "ACCEPTED") {
    emitToCaseAndDispatch(caseId, volunteerAcceptedEvents, payload);
  }
};

export const emitVolunteerAvailabilityChanged = (payload: unknown): void => {
  emitToDispatchRoles(socketEvents.volunteerAvailabilityChanged, payload);
  emitToRooms(["role:VOLUNTEER"], socketEvents.volunteerAvailabilityChanged, payload);
};

export const emitCaseClosed = (caseId: string, payload: unknown): void => {
  emitToCaseAndDispatch(caseId, [socketEvents.caseClosed, socketEvents.statusChangedV2], payload);
};

export const emitLocationUpdated = (caseId: string, payload: unknown): void => {
  emitToCaseAndDispatch(caseId, locationChangedEvents, payload);
};

export const emitMessageCreated = (caseId: string, payload: unknown): void => {
  emitToCaseAndDispatch(caseId, socketEvents.messageCreated, payload);
};

export const emitCallStarted = (emergencyId: string, payload: Record<string, unknown> = {}): void => {
  emitCallLifecycle(socketEvents.callStarted, emergencyId, payload);
};

export const emitCallConnected = (emergencyId: string, payload: Record<string, unknown> = {}): void => {
  emitCallLifecycle(socketEvents.callConnected, emergencyId, payload);
};

export const emitCallEnded = (emergencyId: string, payload: Record<string, unknown> = {}): void => {
  emitCallLifecycle(socketEvents.callEnded, emergencyId, payload);
};

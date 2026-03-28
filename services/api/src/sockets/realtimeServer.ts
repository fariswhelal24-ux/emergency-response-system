import { Server as HttpServer } from "node:http";

import { Server } from "socket.io";
import { z } from "zod";

import { env } from "../config/env";
import { locationRepository } from "../modules/locations/location.repository";
import { LocationActor, locationActors } from "../shared/types/domain";
import { verifyAccessToken } from "../shared/utils/token";
import { socketEvents } from "./events";

let io: Server | null = null;

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

const toActorType = (role: string): LocationActor => {
  if (role === "VOLUNTEER") {
    return "VOLUNTEER";
  }

  if (role === "AMBULANCE_CREW") {
    return "AMBULANCE";
  }

  return role === "CITIZEN" ? "CITIZEN" : "DISPATCHER";
};

const emitToDispatchRoles = (event: string, payload: unknown): void => {
  io?.to("role:DISPATCHER").emit(event, payload);
  io?.to("role:ADMIN").emit(event, payload);
};

const emitToCase = (caseId: string, event: string, payload: unknown): void => {
  io?.to(`case:${caseId}`).emit(event, payload);
};

const emitToCaseAndDispatch = (caseId: string, event: string, payload: unknown): void => {
  emitToCase(caseId, event, payload);
  emitToDispatchRoles(event, payload);
};

export const attachRealtimeServer = (server: HttpServer): void => {
  io = new Server(server, {
    cors: {
      origin: env.clientOrigins,
      credentials: true
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

      socket.on(socketEvents.locationUpdate, async (input: unknown) => {
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
            emitToCaseAndDispatch(location.case_id, socketEvents.locationChanged, {
              caseId: location.case_id,
              location: locationPayload
            });
          }
        } catch {
          socket.emit(socketEvents.serverError, {
            message: "Invalid location update payload"
          });
        }
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
  emitToDispatchRoles(socketEvents.emergencyCreated, payload);
  io?.to("role:VOLUNTEER").emit(socketEvents.emergencyCreated, payload);
};

export const emitEmergencyUpdate = (caseId: string, payload: unknown): void => {
  emitToCaseAndDispatch(caseId, socketEvents.emergencyUpdate, payload);
};

export const emitStatusChanged = (caseId: string, payload: unknown): void => {
  emitToCaseAndDispatch(caseId, socketEvents.statusChanged, payload);
};

export const emitAmbulanceAssigned = (caseId: string, payload: unknown): void => {
  emitToCaseAndDispatch(caseId, socketEvents.ambulanceAssigned, payload);
};

export const emitVolunteerAssigned = (caseId: string, payload: unknown): void => {
  emitToCaseAndDispatch(caseId, socketEvents.volunteerAssigned, payload);
  io?.to("role:VOLUNTEER").emit(socketEvents.volunteerAssigned, payload);
};

export const emitVolunteerResponse = (caseId: string, payload: unknown): void => {
  emitToCaseAndDispatch(caseId, socketEvents.volunteerResponded, payload);
};

export const emitCaseClosed = (caseId: string, payload: unknown): void => {
  emitToCaseAndDispatch(caseId, socketEvents.caseClosed, payload);
};

export const emitLocationUpdated = (caseId: string, payload: unknown): void => {
  emitToCaseAndDispatch(caseId, socketEvents.locationChanged, payload);
};

export const emitMessageCreated = (caseId: string, payload: unknown): void => {
  emitToCaseAndDispatch(caseId, socketEvents.messageCreated, payload);
};

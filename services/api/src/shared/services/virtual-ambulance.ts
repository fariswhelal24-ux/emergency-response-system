import { locationRepository } from "../../modules/locations/location.repository";
import { emitAmbulanceUpdate, emitLocationUpdated, emitStatusChanged } from "../../sockets/realtimeServer";
import { GeoPoint, buildLinearRoute, getDistance } from "../utils/geo";

type VirtualAmbulanceStatus = "moving" | "arrived";

export type VirtualAmbulanceSnapshot = {
  id: string;
  caseId: string;
  latitude: number;
  longitude: number;
  status: VirtualAmbulanceStatus;
  speedKmh: number;
  etaMinutes: number;
  route: GeoPoint[];
  lastUpdatedAt: string;
};

type RunningVirtualAmbulance = {
  timer: NodeJS.Timeout;
  snapshot: VirtualAmbulanceSnapshot;
  target: GeoPoint;
};

const AMBULANCE_ID = "virtual_ambulance";
const MOVE_TICK_MS = 4000;
const DEFAULT_SPEED_KMH = 45;
const ARRIVAL_THRESHOLD_KM = 0.08;

const runningByCase = new Map<string, RunningVirtualAmbulance>();

const randomOffset = (): number => (Math.random() - 0.5) * 0.018;

const estimateEtaMinutes = (distanceKm: number): number => {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
    return 0;
  }

  return Math.max(1, Math.ceil((distanceKm / DEFAULT_SPEED_KMH) * 60));
};

export function createVirtualAmbulance(
  userLocation: GeoPoint
): Pick<VirtualAmbulanceSnapshot, "id" | "latitude" | "longitude" | "status"> {
  return {
    id: AMBULANCE_ID,
    latitude: Number((userLocation.latitude + randomOffset()).toFixed(7)),
    longitude: Number((userLocation.longitude + randomOffset()).toFixed(7)),
    status: "moving"
  };
}

const emitSnapshot = async (snapshot: VirtualAmbulanceSnapshot): Promise<void> => {
  const locationPayload = {
    caseId: snapshot.caseId,
    location: {
      actorType: "AMBULANCE",
      ambulanceId: snapshot.id,
      latitude: snapshot.latitude,
      longitude: snapshot.longitude,
      speedKmh: snapshot.speedKmh,
      etaMinutes: snapshot.etaMinutes,
      recordedAt: snapshot.lastUpdatedAt
    }
  };

  emitLocationUpdated(snapshot.caseId, locationPayload);
  emitAmbulanceUpdate(snapshot.caseId, {
    caseId: snapshot.caseId,
    ambulance: {
      id: snapshot.id,
      latitude: snapshot.latitude,
      longitude: snapshot.longitude,
      status: snapshot.status,
      speedKmh: snapshot.speedKmh,
      etaMinutes: snapshot.etaMinutes,
      updatedAt: snapshot.lastUpdatedAt
    },
    route: snapshot.route
  });

  await locationRepository.createLocationUpdate({
    caseId: snapshot.caseId,
    actorType: "AMBULANCE",
    latitude: snapshot.latitude,
    longitude: snapshot.longitude,
    speedKmh: snapshot.speedKmh,
    etaMinutes: snapshot.etaMinutes
  });
};

const moveTowardTarget = (current: GeoPoint, target: GeoPoint): GeoPoint => {
  const distanceKm = getDistance(current.latitude, current.longitude, target.latitude, target.longitude);
  if (!Number.isFinite(distanceKm) || distanceKm <= ARRIVAL_THRESHOLD_KM) {
    return target;
  }

  // Move faster when far, slower when near.
  const ratio = Math.min(0.3, Math.max(0.12, 0.6 / distanceKm));
  return {
    latitude: Number((current.latitude + (target.latitude - current.latitude) * ratio).toFixed(7)),
    longitude: Number((current.longitude + (target.longitude - current.longitude) * ratio).toFixed(7))
  };
};

export const virtualAmbulanceService = {
  startForEmergency: async (input: { caseId: string; userLocation: GeoPoint }): Promise<VirtualAmbulanceSnapshot> => {
    const existing = runningByCase.get(input.caseId);
    if (existing) {
      clearInterval(existing.timer);
      runningByCase.delete(input.caseId);
    }

    const started = createVirtualAmbulance(input.userLocation);
    const initialDistance = getDistance(
      started.latitude,
      started.longitude,
      input.userLocation.latitude,
      input.userLocation.longitude
    );
    const initialRoute = buildLinearRoute(
      {
        latitude: started.latitude,
        longitude: started.longitude
      },
      input.userLocation,
      20
    );

    const snapshot: VirtualAmbulanceSnapshot = {
      id: started.id,
      caseId: input.caseId,
      latitude: started.latitude,
      longitude: started.longitude,
      status: started.status,
      speedKmh: DEFAULT_SPEED_KMH,
      etaMinutes: estimateEtaMinutes(initialDistance),
      route: initialRoute,
      lastUpdatedAt: new Date().toISOString()
    };

    await emitSnapshot(snapshot);
    emitStatusChanged(input.caseId, {
      caseId: input.caseId,
      status: "AMBULANCE_EN_ROUTE",
      source: "virtual_ambulance",
      updatedAt: snapshot.lastUpdatedAt
    });

    const timer = setInterval(() => {
      const running = runningByCase.get(input.caseId);
      if (!running) {
        return;
      }

      void (async () => {
        const currentDistance = getDistance(
          running.snapshot.latitude,
          running.snapshot.longitude,
          running.target.latitude,
          running.target.longitude
        );

        if (currentDistance <= ARRIVAL_THRESHOLD_KM) {
          running.snapshot.latitude = running.target.latitude;
          running.snapshot.longitude = running.target.longitude;
          running.snapshot.status = "arrived";
          running.snapshot.etaMinutes = 0;
          running.snapshot.route = buildLinearRoute(
            {
              latitude: running.snapshot.latitude,
              longitude: running.snapshot.longitude
            },
            running.target,
            2
          );
          running.snapshot.lastUpdatedAt = new Date().toISOString();
          await emitSnapshot(running.snapshot);

          emitStatusChanged(input.caseId, {
            caseId: input.caseId,
            status: "ON_SCENE",
            source: "virtual_ambulance",
            updatedAt: running.snapshot.lastUpdatedAt
          });

          clearInterval(running.timer);
          runningByCase.delete(input.caseId);
          return;
        }

        const next = moveTowardTarget(
          {
            latitude: running.snapshot.latitude,
            longitude: running.snapshot.longitude
          },
          running.target
        );

        const remainingDistance = getDistance(
          next.latitude,
          next.longitude,
          running.target.latitude,
          running.target.longitude
        );

        running.snapshot.latitude = next.latitude;
        running.snapshot.longitude = next.longitude;
        running.snapshot.status = "moving";
        running.snapshot.etaMinutes = estimateEtaMinutes(remainingDistance);
        running.snapshot.route = buildLinearRoute(next, running.target, 20);
        running.snapshot.lastUpdatedAt = new Date().toISOString();

        await emitSnapshot(running.snapshot);
      })().catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Unknown virtual ambulance error";
        console.error(`[virtual-ambulance] ${input.caseId}: ${message}`);
      });
    }, MOVE_TICK_MS);

    runningByCase.set(input.caseId, {
      timer,
      snapshot,
      target: input.userLocation
    });

    return snapshot;
  },

  stopForCase: (caseId: string): void => {
    const running = runningByCase.get(caseId);
    if (!running) {
      return;
    }

    clearInterval(running.timer);
    runningByCase.delete(caseId);
  },

  getSnapshot: (caseId: string): VirtualAmbulanceSnapshot | null => {
    return runningByCase.get(caseId)?.snapshot ?? null;
  }
};

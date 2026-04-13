/**
 * Tracks VOLUNTEER socket.io connections so dispatch can show who has the app connected right now.
 * Reference-counted per userId (multiple devices / reconnects).
 */
const connectionCountByUserId = new Map<string, number>();

export const registerVolunteerSocket = (userId: string): void => {
  const next = (connectionCountByUserId.get(userId) ?? 0) + 1;
  connectionCountByUserId.set(userId, next);
};

export const unregisterVolunteerSocket = (userId: string): void => {
  const current = connectionCountByUserId.get(userId) ?? 0;
  if (current <= 1) {
    connectionCountByUserId.delete(userId);
    return;
  }
  connectionCountByUserId.set(userId, current - 1);
};

export const isVolunteerAppConnected = (userId: string): boolean =>
  (connectionCountByUserId.get(userId) ?? 0) > 0;

/** For diagnostics / admin */
export const volunteerPresenceDebugSnapshot = (): { userId: string; sockets: number }[] =>
  [...connectionCountByUserId.entries()].map(([userId, sockets]) => ({ userId, sockets }));

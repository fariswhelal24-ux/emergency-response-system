export const socketEvents = {
  connectionReady: "connection:ready",
  serverError: "server:error",

  caseJoin: "case:join",
  caseLeave: "case:leave",
  dashboardJoin: "dashboard:join",

  locationUpdate: "location:update",

  emergencyCreated: "emergency:created",
  emergencyUpdate: "emergency:update",
  statusChanged: "emergency:status-changed",
  ambulanceAssigned: "emergency:ambulance-assigned",
  volunteerAssigned: "emergency:volunteer-assigned",
  volunteerResponded: "emergency:volunteer-responded",
  caseClosed: "emergency:closed",

  locationChanged: "emergency:location-changed",
  messageCreated: "message:created"
} as const;

export const socketEvents = {
  connectionReady: "connection:ready",
  serverError: "server:error",

  caseJoin: "case:join",
  caseLeave: "case:leave",
  dashboardJoin: "dashboard:join",

  locationUpdate: "location:update",
  locationUpdateV2: "location_update",

  emergencyCreated: "emergency:created",
  emergencyCreatedV2: "emergency_created",
  emergencyUpdate: "emergency:update",
  statusChanged: "emergency:status-changed",
  statusChangedV2: "status_changed",
  ambulanceAssigned: "emergency:ambulance-assigned",
  ambulanceUpdateV2: "ambulance_update",
  volunteerAssigned: "emergency:volunteer-assigned",
  volunteerRequestedV2: "volunteer_requested",
  volunteerResponded: "emergency:volunteer-responded",
  volunteerAcceptedV2: "volunteer_accepted",
  volunteerAvailabilityChanged: "volunteer_availability_changed",
  caseClosed: "emergency:closed",
  callStarted: "call_started",
  callConnected: "call_connected",
  callEnded: "call_ended",

  locationChanged: "emergency:location-changed",
  messageCreated: "message:created"
} as const;

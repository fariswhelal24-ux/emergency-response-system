export const userRoles = ["CITIZEN", "VOLUNTEER", "DISPATCHER", "AMBULANCE_CREW", "ADMIN"] as const;
export type UserRole = (typeof userRoles)[number];

export const casePriorities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type CasePriority = (typeof casePriorities)[number];

export const caseStatuses = [
  "NEW",
  "ANALYZING",
  "VOLUNTEERS_NOTIFIED",
  "VOLUNTEER_ACCEPTED",
  "VOLUNTEER_EN_ROUTE",
  "AMBULANCE_ASSIGNED",
  "AMBULANCE_EN_ROUTE",
  "ON_SCENE",
  "FIRST_AID_GUIDANCE",
  "STABILIZED",
  "CLOSED",
  "CANCELLED"
] as const;
export type CaseStatus = (typeof caseStatuses)[number];

export const volunteerAssignmentStatuses = ["PENDING", "ACCEPTED", "DECLINED", "ARRIVED", "COMPLETED"] as const;
export type VolunteerAssignmentStatus = (typeof volunteerAssignmentStatuses)[number];

export const ambulanceAssignmentStatuses = ["PENDING", "ASSIGNED", "EN_ROUTE", "ARRIVED", "COMPLETED"] as const;
export type AmbulanceAssignmentStatus = (typeof ambulanceAssignmentStatuses)[number];

export const volunteerAvailabilities = ["AVAILABLE", "OFF_DUTY", "BUSY"] as const;
export type VolunteerAvailability = (typeof volunteerAvailabilities)[number];

export const locationActors = ["CITIZEN", "VOLUNTEER", "AMBULANCE", "DISPATCHER"] as const;
export type LocationActor = (typeof locationActors)[number];

export const messageTypes = ["CHAT", "SYSTEM", "STATUS_UPDATE"] as const;
export type MessageType = (typeof messageTypes)[number];

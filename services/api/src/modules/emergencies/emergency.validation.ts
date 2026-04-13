import { z } from "zod";

import { casePriorities, caseStatuses } from "../../shared/types/domain";

export const createEmergencySchema = z.object({
  emergencyType: z.string().trim().min(2).max(140),
  priority: z.enum(casePriorities).default("MEDIUM"),
  callerUserId: z.string().uuid().optional(),
  callerName: z.string().trim().min(2).max(120).optional(),
  callerPhone: z.string().trim().min(4).max(32).optional(),
  voiceDescription: z.string().trim().min(2).max(2000).optional(),
  transcriptionText: z.string().trim().min(2).max(2000).optional(),
  aiAnalysis: z.string().trim().max(2000).optional(),
  possibleCondition: z.string().trim().max(240).optional(),
  riskLevel: z.string().trim().max(120).optional(),
  address: z.string().trim().min(4).max(300),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  etaMinutes: z.number().int().min(1).max(180).optional(),
  ambulanceEtaMinutes: z.number().int().min(1).max(180).optional(),
  volunteerEtaMinutes: z.number().int().min(1).max(180).optional()
});

export const initEmergencyCallSchema = z.object({
  userId: z.string().uuid().optional(),
  location: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    address: z.string().trim().min(2).max(300).optional()
  }),
  callType: z.string().trim().min(2).max(120).optional()
});

export const emergencyCallStateSchema = z.object({
  emergencyId: z.string().uuid(),
  at: z.string().trim().min(4).max(64).optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

export const emergencyListQuerySchema = z.object({
  status: z.enum(caseStatuses).optional(),
  priority: z.enum(casePriorities).optional(),
  search: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0)
});

export const updateEmergencyStatusSchema = z.object({
  status: z.enum(caseStatuses),
  note: z.string().trim().max(400).optional()
});

export const updateEmergencyDetailsSchema = z.object({
  emergencyType: z.string().trim().min(2).max(140).optional(),
  priority: z.enum(casePriorities).optional(),
  voiceDescription: z.string().trim().min(2).max(2000).optional(),
  transcriptionText: z.string().trim().min(2).max(2000).optional(),
  aiAnalysis: z.string().trim().max(2000).optional(),
  possibleCondition: z.string().trim().max(240).optional(),
  riskLevel: z.string().trim().max(120).optional(),
  address: z.string().trim().min(4).max(300).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  etaMinutes: z.number().int().min(1).max(180).optional(),
  ambulanceEtaMinutes: z.number().int().min(1).max(180).optional(),
  volunteerEtaMinutes: z.number().int().min(1).max(180).optional()
});

export const assignAmbulanceSchema = z.object({
  ambulanceId: z.string().uuid().optional(),
  etaMinutes: z.number().int().min(1).max(180).optional(),
  distanceKm: z.number().min(0).max(100).optional()
});

export const assignVolunteerSchema = z.object({
  volunteerId: z.string().uuid(),
  etaMinutes: z.number().int().min(1).max(180).optional(),
  distanceKm: z.number().min(0).max(100).optional()
});

export const volunteerResponseSchema = z.object({
  assignmentId: z.string().uuid().optional(),
  accepted: z.boolean(),
  etaMinutes: z.number().int().min(1).max(180).optional()
});

export const sendEmergencyUpdateSchema = z.object({
  updateType: z.string().trim().min(2).max(80),
  message: z.string().trim().min(2).max(2000),
  payload: z.record(z.string(), z.unknown()).optional()
});

export const closeIncidentSchema = z.object({
  totalResponseSeconds: z.number().int().min(0).optional(),
  ambulanceArrivalSeconds: z.number().int().min(0).optional(),
  volunteerArrivalSeconds: z.number().int().min(0).optional(),
  interventions: z.string().trim().max(4000).optional(),
  notes: z.string().trim().max(4000).optional(),
  finalOutcome: z.string().trim().min(2).max(300),
  resolvedStatus: z.string().trim().max(120).optional()
});

export type CreateEmergencyInput = z.infer<typeof createEmergencySchema>;
export type InitEmergencyCallInput = z.infer<typeof initEmergencyCallSchema>;
export type EmergencyCallStateInput = z.infer<typeof emergencyCallStateSchema>;
export type EmergencyListQueryInput = z.infer<typeof emergencyListQuerySchema>;
export type UpdateEmergencyStatusInput = z.infer<typeof updateEmergencyStatusSchema>;
export type UpdateEmergencyDetailsInput = z.infer<typeof updateEmergencyDetailsSchema>;
export type AssignAmbulanceInput = z.infer<typeof assignAmbulanceSchema>;
export type AssignVolunteerInput = z.infer<typeof assignVolunteerSchema>;
export type VolunteerResponseInput = z.infer<typeof volunteerResponseSchema>;
export type SendEmergencyUpdateInput = z.infer<typeof sendEmergencyUpdateSchema>;
export type CloseIncidentInput = z.infer<typeof closeIncidentSchema>;

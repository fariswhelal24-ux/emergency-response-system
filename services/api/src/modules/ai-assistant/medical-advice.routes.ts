/**
 * Enhanced Medical Chat Routes
 * Advanced bilingual medical guidance endpoints
 */

import { Router, Request, Response } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { enhancedMedicalChatController } from "./enhanced-medical-chat.controller.js";

export const medicalAdviceRoutes = Router();

interface AuthRequest extends Request {
  user?: { id: string; email: string };
}

/**
 * POST /api/v1/medical-advice
 * Get comprehensive bilingual medical advice
 * Body: { message: string, conversationId?: string, userAge?: number }
 */
medicalAdviceRoutes.post(
  "/",
  authenticate as any,
  async (req: AuthRequest, res: Response) => {
    await enhancedMedicalChatController.getMedicalAdvice(req, res);
  }
);

/**
 * POST /api/v1/medical-advice/clarify
 * Request clarification with specific medical information
 * Body: { message: string, clinicalData?: {...}, conversationId?: string }
 */
medicalAdviceRoutes.post(
  "/clarify",
  authenticate as any,
  async (req: AuthRequest, res: Response) => {
    await enhancedMedicalChatController.clarifySituation(req, res);
  }
);

/**
 * POST /api/v1/medical-advice/emergency-inquiry
 * Special handling for potential emergency situations
 * Body: { message: string, symptoms?: string[], duration?: string, severity?: string, conversationId?: string }
 */
medicalAdviceRoutes.post(
  "/emergency-inquiry",
  authenticate as any,
  async (req: AuthRequest, res: Response) => {
    await enhancedMedicalChatController.handleEmergencyInquiry(req, res);
  }
);

/**
 * GET /api/v1/medical-advice/resources?condition=fever&language=en
 * Get medical resources for a specific condition
 */
medicalAdviceRoutes.get(
  "/resources",
  authenticate as any,
  async (req: AuthRequest, res: Response) => {
    await enhancedMedicalChatController.getMedicalResources(req, res);
  }
);

/**
 * POST /api/v1/medical-advice/symptoms-checker
 * Symptom checker for initial assessment
 * Body: { symptoms: string[], language?: "ar" | "en" }
 */
medicalAdviceRoutes.post(
  "/symptoms-checker",
  authenticate as any,
  async (req: AuthRequest, res: Response) => {
    await enhancedMedicalChatController.checkSymptoms(req, res);
  }
);

export default medicalAdviceRoutes;

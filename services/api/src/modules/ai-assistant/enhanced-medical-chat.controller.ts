/**
 * Enhanced Medical Chat Controller
 * Integrates with Bilingual Medical Advisor for comprehensive medical guidance
 */

import { Request, Response } from "express";
import BilinguMedicalAdvisor, { MedicalAdvice } from "../../shared/services/bilingual-medical-advisor.js";
import ConversationMemoryService from "../../shared/services/conversation-memory.js";
import AIAssistantService from "../../shared/services/ai-assistant.js";

const triageResponseFields = (advice: MedicalAdvice) => ({
  type: advice.triage.type,
  emergency: advice.triage.emergency,
  severity: advice.triage.severity,
  decisionSummary: advice.triage.decisionSummary,
  response: advice.response
});

const buildResilientAdvice = async (
  message: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  userAge?: number
): Promise<MedicalAdvice> => {
  try {
    return await BilinguMedicalAdvisor.getMedicalAdvice(message, history, userAge);
  } catch (error) {
    console.error("Enhanced advisor primary flow failed, using fallback AI assistant:", error);
    const fallback = await AIAssistantService.getResponseFromMessages([
      ...history.slice(-30),
      { role: "user", content: message }
    ]);

    return {
      response: fallback.response,
      followUpQuestions: fallback.followUpQuestions,
      resources: [],
      context: {
        symptoms: fallback.analysis.entities.symptoms,
        duration: undefined,
        severity: undefined,
        age: userAge,
        relevantHistory: [],
        currentMedications: fallback.analysis.entities.medicines,
        allergies: []
      },
      isEmergency: fallback.isEmergency,
      confidence: fallback.analysis.confidence,
      language: fallback.responseLanguage,
      triage: fallback.triage
    };
  }
};

export const enhancedMedicalChatController = {
  /**
   * POST /api/v1/ai/medical-advice
   * Get comprehensive bilingual medical advice
   */
  async getMedicalAdvice(req: Request, res: Response): Promise<void> {
    try {
      const { message, conversationId, userAge } = req.body;
      const userId = req.authUser?.userId;

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      if (!message || typeof message !== "string" || message.trim().length === 0) {
        res.status(400).json({ error: "Message is required" });
        return;
      }

      const parsedUserAge =
        typeof userAge === "number" ? userAge : typeof userAge === "string" ? Number.parseInt(userAge, 10) : undefined;

      // Get conversation history if provided
      let history: Array<{ role: "user" | "assistant"; content: string }> = [];
      if (conversationId) {
        const messages = await ConversationMemoryService.getConversationHistory(userId, 10, conversationId);
        history = messages.map((msg) => ({
          role: msg.role as "user" | "assistant",
          content: msg.content
        }));
      }

      // Get medical advice
      const advice: MedicalAdvice = await buildResilientAdvice(message.trim(), history, parsedUserAge);

      try {
        // Save user message
        await ConversationMemoryService.saveMessage(userId, "user", message.trim(), {
          language: advice.language,
          intent: advice.isEmergency ? "emergency" : "medical_question",
          isEmergency: advice.isEmergency,
          conversationId
        });

        // Save assistant response
        await ConversationMemoryService.saveMessage(userId, "assistant", advice.response, {
          language: advice.language,
          intent: advice.isEmergency ? "emergency" : "guidance",
          isEmergency: advice.isEmergency,
          conversationId
        });

        // Update conversation if it exists
        if (conversationId) {
          await ConversationMemoryService.updateConversation(conversationId, message.trim());
        }
      } catch (memoryError) {
        console.error("Medical advice memory persistence failed; returning live response anyway:", memoryError);
      }

      // Format response for display
      const formattedAdvice = BilinguMedicalAdvisor.formatAdviceForDisplay(advice);

      res.json({
        success: true,
        data: {
          ...triageResponseFields(advice),
          advice: formattedAdvice,
          fullAdvice: advice,
          isEmergency: advice.isEmergency,
          language: advice.language,
          confidence: advice.confidence,
          followUpQuestions: advice.followUpQuestions,
          resources: advice.resources,
          context: advice.context
        }
      });
    } catch (error) {
      console.error("Error in getMedicalAdvice:", error);
      res.status(500).json({ error: "Failed to process medical request" });
    }
  },

  /**
   * POST /api/v1/ai/medical-advice/clarify
   * Request clarification with specific medical information
   */
  async clarifySituation(req: Request, res: Response): Promise<void> {
    try {
      const { message, clinicalData, conversationId } = req.body;
      const userId = req.authUser?.userId;

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      // Combine message with clinical data for better context
      let enhancedMessage = message;

      if (clinicalData) {
        const parts: string[] = [];

        if (clinicalData.age) parts.push(`Age: ${clinicalData.age}`);
        if (clinicalData.duration) parts.push(`Duration: ${clinicalData.duration}`);
        if (clinicalData.severity) parts.push(`Severity: ${clinicalData.severity}`);
        if (clinicalData.medications?.length) parts.push(`Medications: ${clinicalData.medications.join(", ")}`);
        if (clinicalData.allergies?.length) parts.push(`Allergies: ${clinicalData.allergies.join(", ")}`);

        if (parts.length > 0) {
          enhancedMessage = `Context: ${parts.join(" | ")}. ${message}`;
        }
      }

      // Get history and advice
      let history: Array<{ role: "user" | "assistant"; content: string }> = [];
      if (conversationId) {
        const messages = await ConversationMemoryService.getConversationHistory(userId, 15, conversationId);
        history = messages.map((msg) => ({
          role: msg.role as "user" | "assistant",
          content: msg.content
        }));
      }

      const advice: MedicalAdvice = await buildResilientAdvice(enhancedMessage, history, clinicalData?.age);

      try {
        // Save messages
        await ConversationMemoryService.saveMessage(userId, "user", message, {
          language: advice.language,
          intent: "medical_clarification",
          isEmergency: advice.isEmergency,
          conversationId
        });

        await ConversationMemoryService.saveMessage(userId, "assistant", advice.response, {
          language: advice.language,
          intent: "detailed_guidance",
          isEmergency: advice.isEmergency,
          conversationId
        });

        if (conversationId) {
          await ConversationMemoryService.updateConversation(conversationId, message);
        }
      } catch (memoryError) {
        console.error("Clarify situation memory persistence failed; returning live response anyway:", memoryError);
      }

      const formattedAdvice = BilinguMedicalAdvisor.formatAdviceForDisplay(advice);

      res.json({
        success: true,
        data: {
          ...triageResponseFields(advice),
          advice: formattedAdvice,
          fullAdvice: advice,
          isEmergency: advice.isEmergency,
          language: advice.language,
          context: advice.context,
          followUpQuestions: advice.followUpQuestions,
          resources: advice.resources
        }
      });
    } catch (error) {
      console.error("Error in clarifySituation:", error);
      res.status(500).json({ error: "Failed to clarify situation" });
    }
  },

  /**
   * POST /api/v1/ai/medical-advice/emergency-inquiry
   * Special handling for potential emergency situations
   */
  async handleEmergencyInquiry(req: Request, res: Response): Promise<void> {
    try {
      const { message, symptoms, duration, severity, conversationId } = req.body;
      const userId = req.authUser?.userId;

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      // Build urgent message
      const urgentMessage = `URGENT: ${message}. Symptoms: ${symptoms?.join(", ") || "not specified"}`;

      let history: Array<{ role: "user" | "assistant"; content: string }> = [];
      if (conversationId) {
        const messages = await ConversationMemoryService.getConversationHistory(userId, 20, conversationId);
        history = messages.map((msg) => ({
          role: msg.role as "user" | "assistant",
          content: msg.content
        }));
      }

      const advice: MedicalAdvice = await buildResilientAdvice(urgentMessage, history);

      try {
        // Save messages with emergency flags
        await ConversationMemoryService.saveMessage(userId, "user", message, {
          language: advice.language,
          intent: "emergency_inquiry",
          isEmergency: true,
          conversationId
        });

        await ConversationMemoryService.saveMessage(userId, "assistant", advice.response, {
          language: advice.language,
          intent: "emergency_response",
          isEmergency: true,
          conversationId
        });

        if (conversationId) {
          await ConversationMemoryService.updateConversation(conversationId, message);
        }
      } catch (memoryError) {
        console.error("Emergency inquiry memory persistence failed; returning live response anyway:", memoryError);
      }

      const formattedAdvice = BilinguMedicalAdvisor.formatAdviceForDisplay(advice);

      res.json({
        success: true,
        isEmergency: true,
        urgentAction: true,
        data: {
          ...triageResponseFields(advice),
          advice: formattedAdvice,
          fullAdvice: advice,
          language: advice.language,
          emergencyNumbers:
            advice.language === "ar"
            ? { saudi: "997", egypt: "123", uae: "998", kuwait: "112" }
            : { us: "911", uk: "999", eu: "112", australia: "000" }
        }
      });
    } catch (error) {
      console.error("Error in handleEmergencyInquiry:", error);
      res.status(500).json({ error: "Failed to handle emergency inquiry" });
    }
  },

  /**
   * GET /api/v1/ai/medical-advice/resources
   * Get medical resources for a specific condition
   */
  async getMedicalResources(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.authUser?.userId;
      const { condition, language = "en" } = req.query;

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      if (!condition || typeof condition !== "string") {
        res.status(400).json({ error: "Condition parameter is required" });
        return;
      }

      // Create a dummy medical context to get resources
      const healthQuery = `Tell me about ${condition}`;
      const advice = await BilinguMedicalAdvisor.getMedicalAdvice(healthQuery);

      res.json({
        success: true,
        data: {
          condition,
          resources: advice.resources,
          language: advice.language
        }
      });
    } catch (error) {
      console.error("Error in getMedicalResources:", error);
      res.status(500).json({ error: "Failed to fetch medical resources" });
    }
  },

  /**
   * POST /api/v1/ai/medical-advice/symptoms-checker
   * Symptom checker for initial assessment
   */
  async checkSymptoms(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.authUser?.userId;
      const { symptoms, language = "en" } = req.body;

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      if (!symptoms || !Array.isArray(symptoms) || symptoms.length === 0) {
        res.status(400).json({ error: "Symptoms array is required" });
        return;
      }

      // Build symptom query
      const symptomQuery =
        language === "ar"
          ? `أعاني من: ${symptoms.join("، ")}`
          : `I have: ${symptoms.join(", ")}`;

      const advice = await BilinguMedicalAdvisor.getMedicalAdvice(symptomQuery);

      // Save symptom check
      await ConversationMemoryService.saveMessage(userId, "user", symptomQuery, {
        language: advice.language,
        intent: "symptoms_check",
        isEmergency: advice.isEmergency
      });

      res.json({
        success: true,
        data: {
          ...triageResponseFields(advice),
          assessment: advice.response,
          isEmergent: advice.isEmergency,
          followUpQuestions: advice.followUpQuestions,
          resources: advice.resources,
          language: advice.language
        }
      });
    } catch (error) {
      console.error("Error in checkSymptoms:", error);
      res.status(500).json({ error: "Failed to check symptoms" });
    }
  },
};

export default enhancedMedicalChatController;

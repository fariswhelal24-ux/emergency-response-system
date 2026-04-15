import { Request, Response, Router } from "express";

import { authenticate } from "../../middlewares/authenticate.js";
import { aiAssistantController } from "./ai-assistant.controller.js";

export const aiRoutes = Router();

/**
 * POST /api/v1/ai/voice
 * Voice analysis endpoint (base64 audio)
 */
aiRoutes.post("/voice", async (req: Request, res: Response) => {
  await aiAssistantController.voice(req, res);
});

/**
 * POST /api/v1/ai/chat
 * Public contextual chat with full messages array
 */
aiRoutes.post("/chat", async (req: Request, res: Response) => {
  await aiAssistantController.chat(req, res);
});

/**
 * POST /api/v1/ai/chat/public
 * Backward-compatible alias for public chat
 */
aiRoutes.post("/chat/public", async (req: Request, res: Response) => {
  await aiAssistantController.chat(req, res);
});

/**
 * POST /api/v1/ai/chat/private
 * Authenticated chat with persistent server-side history
 */
aiRoutes.post("/chat/private", authenticate as any, async (req: Request, res: Response) => {
  await aiAssistantController.sendMessage(req, res);
});

/**
 * GET /api/v1/ai/conversations
 */
aiRoutes.get("/conversations", authenticate as any, async (req: Request, res: Response) => {
  await aiAssistantController.getConversations(req, res);
});

/**
 * POST /api/v1/ai/conversations
 */
aiRoutes.post("/conversations", authenticate as any, async (req: Request, res: Response) => {
  await aiAssistantController.createConversation(req, res);
});

/**
 * GET /api/v1/ai/conversations/:conversationId
 */
aiRoutes.get("/conversations/:conversationId", authenticate as any, async (req: Request, res: Response) => {
  await aiAssistantController.getConversationHistory(req, res);
});

/**
 * GET /api/v1/ai/stats
 */
aiRoutes.get("/stats", authenticate as any, async (req: Request, res: Response) => {
  await aiAssistantController.getUserStats(req, res);
});

/**
 * GET /api/v1/ai/search
 */
aiRoutes.get("/search", authenticate as any, async (req: Request, res: Response) => {
  await aiAssistantController.searchMessages(req, res);
});

export default aiRoutes;

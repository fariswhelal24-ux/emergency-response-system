import { Request, Response } from "express";

import AIAssistantService from "../../shared/services/ai-assistant";
import type { AssistantChatMessage } from "../../shared/services/ai-assistant";
import ConversationMemoryService from "../../shared/services/conversation-memory";

const buildConversationTitle = (message: string): string => {
  const plain = message.trim().replace(/\s+/g, " ");
  if (!plain) {
    return "Medical Chat";
  }

  const words = plain.split(" ").slice(0, 8).join(" ");
  return words.length > 48 ? `${words.slice(0, 45)}...` : words;
};

const sanitizePublicHistory = (history: unknown): Array<{ role: "user" | "assistant"; content: string }> => {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const role = (item as { role?: unknown }).role;
      const content = (item as { content?: unknown }).content;

      if ((role !== "user" && role !== "assistant") || typeof content !== "string") {
        return null;
      }

      if (!content.trim()) {
        return null;
      }

      return { role, content };
    })
    .filter((item): item is { role: "user" | "assistant"; content: string } => item !== null)
    .slice(-30);
};

const sanitizeMessages = (messages: unknown): AssistantChatMessage[] => {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const role = (item as { role?: unknown }).role;
      const content = (item as { content?: unknown }).content;

      if ((role !== "user" && role !== "assistant") || typeof content !== "string") {
        return null;
      }

      const trimmed = content.trim();
      if (!trimmed) {
        return null;
      }

      return {
        role,
        content: trimmed
      };
    })
    .filter((item): item is AssistantChatMessage => item !== null)
    .slice(-40);
};

export const aiAssistantController = {
  /**
   * POST /api/v1/ai/voice
   * Accepts base64 audio payload and returns transcription + emergency analysis.
   * NOTE: Current transcription is a safe placeholder until full STT is wired.
   */
  async voice(req: Request, res: Response): Promise<void> {
    try {
      const body = typeof req.body === "object" && req.body !== null ? req.body : {};
      const audio = (body as { audio?: unknown }).audio;

      if (typeof audio !== "string" || audio.trim().length === 0) {
        res.status(400).json({ error: "audio is required and must be a base64 string" });
        return;
      }

      const sanitizedBase64 = audio.replace(/\s+/g, "");
      let byteLength = 0;
      try {
        byteLength = Buffer.from(sanitizedBase64, "base64").byteLength;
      } catch {
        res.status(400).json({ error: "audio must be valid base64" });
        return;
      }

      if (byteLength === 0) {
        res.status(400).json({ error: "audio payload is empty" });
        return;
      }

      const transcription =
        (typeof (body as { transcriptHint?: unknown }).transcriptHint === "string"
          ? (body as { transcriptHint?: string }).transcriptHint?.trim()
          : "") ||
        `Voice captured (${Math.max(1, Math.round(byteLength / 1024))} KB).`;

      const assistantResult = await AIAssistantService.getResponse(transcription, { history: [] });

      res.json({
        success: true,
        data: {
          transcription,
          analysis: {
            isEmergency: assistantResult.isEmergency,
            intent: assistantResult.analysis.intent,
            confidence: assistantResult.analysis.confidence,
            responseLanguage: assistantResult.responseLanguage
          }
        }
      });
    } catch (error) {
      console.error("Error in voice:", error);
      res.status(500).json({ error: "Failed to process voice audio" });
    }
  },

  /**
   * POST /api/v1/ai/chat
   * Chat with explicit conversation messages array
   */
  async chat(req: Request, res: Response): Promise<void> {
    try {
      const body = typeof req.body === "object" && req.body !== null ? req.body : {};
      const cleanMessages = sanitizeMessages((body as { messages?: unknown }).messages);

      if (cleanMessages.length === 0) {
        res.status(400).json({
          error: "messages is required and must be a non-empty array of { role, content }"
        });
        return;
      }

      const hasUserMessage = cleanMessages.some((message) => message.role === "user");
      if (!hasUserMessage) {
        res.status(400).json({
          error: "messages must include at least one user message"
        });
        return;
      }

      const assistantResult = await AIAssistantService.getResponseFromMessages(cleanMessages);

      res.json({
        success: true,
        data: {
          assistantMessage: {
            role: "assistant",
            content: assistantResult.response
          },
          analysis: {
            intent: assistantResult.analysis.intent,
            confidence: assistantResult.analysis.confidence,
            keywords: assistantResult.analysis.keywords,
            entities: assistantResult.analysis.entities,
            isEmergency: assistantResult.isEmergency,
            preprocessed: assistantResult.preprocessed,
            language: assistantResult.language,
            responseLanguage: assistantResult.responseLanguage,
            needsFollowUp: assistantResult.needsFollowUp,
            followUpQuestions: assistantResult.followUpQuestions,
            sources: assistantResult.sources
          }
        }
      });
    } catch (error) {
      console.error("Error in chat:", error);
      res.status(500).json({ error: "Failed to process chat messages" });
    }
  },

  /**
   * POST /api/v1/ai/chat
   * Authenticated chat with persistent conversation memory
   */
  async sendMessage(req: Request, res: Response): Promise<void> {
    try {
      const body = typeof req.body === "object" && req.body !== null ? req.body : {};
      const message = (body as { message?: unknown }).message;
      const userId = req.authUser?.userId;

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      if (!message || typeof message !== "string" || message.trim().length === 0) {
        res.status(400).json({ error: "Message is required" });
        return;
      }

      const requestedConversationId =
        typeof (body as { conversationId?: unknown }).conversationId === "string" &&
        (body as { conversationId: string }).conversationId.trim().length > 0
          ? (body as { conversationId: string }).conversationId.trim()
          : undefined;

      let conversationId = requestedConversationId;
      if (conversationId) {
        const existing = await ConversationMemoryService.getConversationById(userId, conversationId);
        if (!existing) {
          conversationId = undefined;
        }
      }

      if (!conversationId) {
        const created = await ConversationMemoryService.createConversation(userId, buildConversationTitle(message));
        conversationId = created.id;
      }

      const historyRows = await ConversationMemoryService.getConversationHistory(userId, 30, conversationId);
      const history = historyRows.map((row) => ({
        role: row.role,
        content: row.content
      }));

      const assistantResult = await AIAssistantService.getResponse(message, {
        userId,
        history
      });

      const userMsg = await ConversationMemoryService.saveMessage(userId, "user", message, {
        language: assistantResult.language,
        intent: assistantResult.analysis.intent,
        isEmergency: assistantResult.isEmergency,
        conversationId
      });

      const assistantMsg = await ConversationMemoryService.saveMessage(
        userId,
        "assistant",
        assistantResult.response,
        {
          language: assistantResult.responseLanguage,
          intent: assistantResult.analysis.intent,
          isEmergency: assistantResult.isEmergency,
          conversationId
        }
      );

      await ConversationMemoryService.updateConversation(conversationId, assistantResult.response, 2);

      res.json({
        success: true,
        data: {
          conversationId,
          userMessage: userMsg,
          assistantMessage: assistantMsg,
          analysis: {
            intent: assistantResult.analysis.intent,
            confidence: assistantResult.analysis.confidence,
            keywords: assistantResult.analysis.keywords,
            entities: assistantResult.analysis.entities,
            isEmergency: assistantResult.isEmergency,
            preprocessed: assistantResult.preprocessed,
            language: assistantResult.language,
            responseLanguage: assistantResult.responseLanguage,
            needsFollowUp: assistantResult.needsFollowUp,
            followUpQuestions: assistantResult.followUpQuestions,
            sources: assistantResult.sources
          }
        }
      });
    } catch (error) {
      console.error("Error in sendMessage:", error);
      res.status(500).json({ error: "Failed to process message" });
    }
  },

  /**
   * POST /api/v1/ai/chat/public
   * Public chat for demo/mobile clients without auth
   */
  async sendPublicMessage(req: Request, res: Response): Promise<void> {
    try {
      const body = typeof req.body === "object" && req.body !== null ? req.body : {};
      const messages = (body as { messages?: unknown }).messages;
      const message = (body as { message?: unknown }).message;
      const history = (body as { history?: unknown }).history;

      const cleanMessagesFromArray = sanitizeMessages(messages);
      const cleanMessages =
        cleanMessagesFromArray.length > 0
          ? cleanMessagesFromArray
          : [
              ...sanitizePublicHistory(history),
              ...(typeof message === "string" && message.trim().length > 0
                ? [{ role: "user" as const, content: message.trim() }]
                : [])
            ].slice(-40);

      if (cleanMessages.length === 0) {
        res.status(400).json({
          error: "messages is required and must be a non-empty array of { role, content }"
        });
        return;
      }

      const assistantResult = await AIAssistantService.getResponseFromMessages(cleanMessages);

      res.json({
        success: true,
        data: {
          assistantMessage: {
            role: "assistant",
            content: assistantResult.response
          },
          analysis: {
            intent: assistantResult.analysis.intent,
            confidence: assistantResult.analysis.confidence,
            keywords: assistantResult.analysis.keywords,
            entities: assistantResult.analysis.entities,
            isEmergency: assistantResult.isEmergency,
            preprocessed: assistantResult.preprocessed,
            language: assistantResult.language,
            responseLanguage: assistantResult.responseLanguage,
            needsFollowUp: assistantResult.needsFollowUp,
            followUpQuestions: assistantResult.followUpQuestions,
            sources: assistantResult.sources
          }
        }
      });
    } catch (error) {
      console.error("Error in sendPublicMessage:", error);
      res.status(500).json({ error: "Failed to process message" });
    }
  },

  /**
   * GET /api/v1/ai/conversations
   */
  async getConversations(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.authUser?.userId;

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const conversations = await ConversationMemoryService.getConversationThreads(userId);

      res.json({
        success: true,
        data: conversations
      });
    } catch (error) {
      console.error("Error in getConversations:", error);
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  },

  /**
   * GET /api/v1/ai/conversations/:conversationId
   */
  async getConversationHistory(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.authUser?.userId;
      const conversationId = typeof req.params.conversationId === "string" ? req.params.conversationId : undefined;

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      if (!conversationId) {
        res.status(400).json({ error: "Conversation ID is required" });
        return;
      }

      const messages = await ConversationMemoryService.getConversationHistory(userId, 50, conversationId);

      res.json({
        success: true,
        data: messages
      });
    } catch (error) {
      console.error("Error in getConversationHistory:", error);
      res.status(500).json({ error: "Failed to fetch conversation history" });
    }
  },

  /**
   * POST /api/v1/ai/conversations
   */
  async createConversation(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.authUser?.userId;
      const body = typeof req.body === "object" && req.body !== null ? req.body : {};
      const title = (body as { title?: unknown }).title;

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      if (!title || typeof title !== "string") {
        res.status(400).json({ error: "Title is required" });
        return;
      }

      const conversation = await ConversationMemoryService.createConversation(userId, title);

      res.json({
        success: true,
        data: conversation
      });
    } catch (error) {
      console.error("Error in createConversation:", error);
      res.status(500).json({ error: "Failed to create conversation" });
    }
  },

  /**
   * GET /api/v1/ai/stats
   */
  async getUserStats(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.authUser?.userId;

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const stats = await ConversationMemoryService.getUserStats(userId);

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error("Error in getUserStats:", error);
      res.status(500).json({ error: "Failed to fetch statistics" });
    }
  },

  /**
   * GET /api/v1/ai/search
   */
  async searchMessages(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.authUser?.userId;
      const { q } = req.query;

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      if (!q || typeof q !== "string") {
        res.status(400).json({ error: "Search query is required" });
        return;
      }

      const messages = await ConversationMemoryService.searchMessages(userId, q);

      res.json({
        success: true,
        data: messages
      });
    } catch (error) {
      console.error("Error in searchMessages:", error);
      res.status(500).json({ error: "Failed to search messages" });
    }
  }
};

export default aiAssistantController;

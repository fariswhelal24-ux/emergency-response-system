import { pool } from "../../database/pool";

interface ChatMessage {
  id: string;
  userId: string;
  role: "user" | "assistant";
  content: string;
  language: "ar" | "en" | "mixed";
  intent?: string;
  isEmergency: boolean;
  tokens?: number;
  createdAt: Date;
}

interface ConversationThread {
  id: string;
  userId: string;
  title: string;
  lastMessage: string;
  messageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export class ConversationMemoryService {
  /**
   * Save a chat message to database
   */
  static async saveMessage(
    userId: string,
    role: "user" | "assistant",
    content: string,
    options: {
      language?: "ar" | "en" | "mixed";
      intent?: string;
      isEmergency?: boolean;
      conversationId?: string;
    } = {}
  ): Promise<ChatMessage> {
    try {
      const id = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const query = `
        INSERT INTO ai_chat_messages 
        (id, user_id, role, content, language, intent, is_emergency, conversation_id, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        RETURNING *
      `;
      
      const result = await pool.query(query, [
        id,
        userId,
        role,
        content,
        options.language || "en",
        options.intent || null,
        options.isEmergency || false,
        options.conversationId || null,
      ]);
      
      return result.rows[0];
    } catch (error) {
      console.error("Error saving message:", error);
      throw error;
    }
  }

  /**
   * Get recent conversation history for a user
   */
  static async getConversationHistory(
    userId: string,
    limit: number = 20,
    conversationId?: string
  ): Promise<ChatMessage[]> {
    try {
      let query = `
        SELECT id, user_id, role, content, language, intent, is_emergency, created_at
        FROM ai_chat_messages
        WHERE user_id = $1
      `;
      
      const params: any[] = [userId];
      
      if (conversationId) {
        query += ` AND conversation_id = $${params.length + 1}`;
        params.push(conversationId);
      }
      
      query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
      params.push(limit);
      
      const result = await pool.query(query, params);
      return result.rows.reverse(); // Return in chronological order
    } catch (error) {
      console.error("Error fetching conversation history:", error);
      throw error;
    }
  }

  /**
   * Get conversation threads for a user
   */
  static async getConversationThreads(userId: string): Promise<ConversationThread[]> {
    try {
      const query = `
        SELECT 
          id,
          user_id,
          title,
          last_message,
          message_count,
          created_at,
          updated_at
        FROM ai_conversations
        WHERE user_id = $1
        ORDER BY updated_at DESC
      `;
      
      const result = await pool.query(query, [userId]);
      return result.rows;
    } catch (error) {
      console.error("Error fetching conversations:", error);
      throw error;
    }
  }

  /**
   * Get a conversation by ID for the user
   */
  static async getConversationById(
    userId: string,
    conversationId: string
  ): Promise<ConversationThread | null> {
    try {
      const query = `
        SELECT
          id,
          user_id,
          title,
          last_message,
          message_count,
          created_at,
          updated_at
        FROM ai_conversations
        WHERE id = $1 AND user_id = $2
        LIMIT 1
      `;

      const result = await pool.query(query, [conversationId, userId]);
      return result.rows[0] || null;
    } catch (error) {
      console.error("Error fetching conversation by id:", error);
      throw error;
    }
  }

  /**
   * Create a new conversation thread
   */
  static async createConversation(
    userId: string,
    title: string
  ): Promise<ConversationThread> {
    try {
      const id = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const query = `
        INSERT INTO ai_conversations (id, user_id, title, last_message, message_count, created_at, updated_at)
        VALUES ($1, $2, $3, '', 0, NOW(), NOW())
        RETURNING *
      `;
      
      const result = await pool.query(query, [id, userId, title]);
      return result.rows[0];
    } catch (error) {
      console.error("Error creating conversation:", error);
      throw error;
    }
  }

  /**
   * Update conversation metadata
   */
  static async updateConversation(
    conversationId: string,
    lastMessage: string,
    incrementBy: number = 1
  ): Promise<void> {
    try {
      const query = `
        UPDATE ai_conversations
        SET last_message = $1, message_count = message_count + $2, updated_at = NOW()
        WHERE id = $3
      `;
      
      await pool.query(query, [lastMessage, incrementBy, conversationId]);
    } catch (error) {
      console.error("Error updating conversation:", error);
      throw error;
    }
  }

  /**
   * Delete old messages (cleanup)
   */
  static async deleteOldMessages(daysOld: number = 90): Promise<number> {
    try {
      const query = `
        DELETE FROM ai_chat_messages
        WHERE created_at < NOW() - INTERVAL '${daysOld} days'
        RETURNING id
      `;
      
      const result = await pool.query(query);
      return result.rows.length;
    } catch (error) {
      console.error("Error deleting old messages:", error);
      throw error;
    }
  }

  /**
   * Search messages by content or intent
   */
  static async searchMessages(
    userId: string,
    query: string
  ): Promise<ChatMessage[]> {
    try {
      const searchQuery = `
        SELECT id, user_id, role, content, language, intent, is_emergency, created_at
        FROM ai_chat_messages
        WHERE user_id = $1 AND (content ILIKE $2 OR intent ILIKE $2)
        ORDER BY created_at DESC
        LIMIT 50
      `;
      
      const result = await pool.query(searchQuery, [userId, `%${query}%`]);
      return result.rows;
    } catch (error) {
      console.error("Error searching messages:", error);
      throw error;
    }
  }

  /**
   * Get usage statistics for a user
   */
  static async getUserStats(userId: string): Promise<{
    totalMessages: number;
    emergencyCalls: number;
    preferredLanguage: "ar" | "en" | "mixed";
    lastActive: Date;
  }> {
    try {
      const query = `
        SELECT 
          COUNT(*) as total_messages,
          COUNT(CASE WHEN is_emergency = true THEN 1 END) as emergency_calls,
          MAX(created_at) as last_active,
          MODE() WITHIN GROUP (ORDER BY language) as preferred_language
        FROM ai_chat_messages
        WHERE user_id = $1
      `;
      
      const result = await pool.query(query, [userId]);
      const stats = result.rows[0];
      
      return {
        totalMessages: parseInt(stats.total_messages || "0"),
        emergencyCalls: parseInt(stats.emergency_calls || "0"),
        preferredLanguage: stats.preferred_language || "en",
        lastActive: stats.last_active || new Date(),
      };
    } catch (error) {
      console.error("Error fetching user stats:", error);
      throw error;
    }
  }
}

export default ConversationMemoryService;

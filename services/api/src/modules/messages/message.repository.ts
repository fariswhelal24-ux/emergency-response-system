import { db } from "../../database/pool";

import { MessageType } from "../../shared/types/domain";

export type MessageRow = {
  id: string;
  case_id: string;
  sender_user_id: string | null;
  recipient_user_id: string | null;
  message_type: MessageType;
  body: string;
  created_at: Date;
};

export const messageRepository = {
  createMessage: async (input: {
    caseId: string;
    senderUserId: string;
    recipientUserId?: string;
    messageType: MessageType;
    body: string;
  }): Promise<MessageRow> => {
    const query = await db.query<MessageRow>(
      `
      INSERT INTO messages (case_id, sender_user_id, recipient_user_id, message_type, body)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
      `,
      [input.caseId, input.senderUserId, input.recipientUserId ?? null, input.messageType, input.body]
    );

    return query.rows[0];
  },

  listCaseMessages: async (caseId: string): Promise<MessageRow[]> => {
    const query = await db.query<MessageRow>(
      `
      SELECT *
      FROM messages
      WHERE case_id = $1
      ORDER BY created_at ASC
      `,
      [caseId]
    );

    return query.rows;
  }
};

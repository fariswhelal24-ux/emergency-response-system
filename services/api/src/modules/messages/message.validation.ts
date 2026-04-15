import { z } from "zod";

import { messageTypes } from "../../shared/types/domain.js";

export const sendMessageSchema = z.object({
  caseId: z.string().uuid(),
  recipientUserId: z.string().uuid().optional(),
  messageType: z.enum(messageTypes).default("CHAT"),
  body: z.string().trim().min(1).max(2000)
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;

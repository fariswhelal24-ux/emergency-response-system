import { AppError } from "../../shared/errors/AppError";
import { UserRole } from "../../shared/types/domain";
import { emergencyRepository } from "../emergencies/emergency.repository";
import { messageRepository } from "./message.repository";
import { SendMessageInput } from "./message.validation";

type AuthContext = {
  userId: string;
  role: UserRole;
};

const assertCaseAccess = async (auth: AuthContext, caseId: string): Promise<void> => {
  const emergencyCase = await emergencyRepository.findCaseById(caseId);

  if (!emergencyCase) {
    throw new AppError("Emergency case not found", 404);
  }

  if (auth.role === "CITIZEN" && emergencyCase.reporting_user_id !== auth.userId) {
    throw new AppError("You can only access your own emergency cases", 403);
  }

  if (auth.role === "VOLUNTEER") {
    const volunteerId = await emergencyRepository.findVolunteerIdByUserId(auth.userId);

    if (!volunteerId) {
      throw new AppError("Volunteer profile not found", 403);
    }

    const assignment = await emergencyRepository.findVolunteerAssignmentByCase({
      caseId,
      volunteerId
    });

    if (!assignment) {
      throw new AppError("You are not assigned to this case", 403);
    }
  }
};

export const messageService = {
  sendMessage: async (auth: AuthContext, input: SendMessageInput) => {
    await assertCaseAccess(auth, input.caseId);

    const created = await messageRepository.createMessage({
      caseId: input.caseId,
      senderUserId: auth.userId,
      recipientUserId: input.recipientUserId,
      messageType: input.messageType,
      body: input.body
    });

    return {
      id: created.id,
      caseId: created.case_id,
      senderUserId: created.sender_user_id,
      recipientUserId: created.recipient_user_id,
      messageType: created.message_type,
      body: created.body,
      createdAt: created.created_at
    };
  },

  listCaseMessages: async (auth: AuthContext, caseId: string) => {
    await assertCaseAccess(auth, caseId);

    const rows = await messageRepository.listCaseMessages(caseId);

    return rows.map((row) => ({
      id: row.id,
      caseId: row.case_id,
      senderUserId: row.sender_user_id,
      recipientUserId: row.recipient_user_id,
      messageType: row.message_type,
      body: row.body,
      createdAt: row.created_at
    }));
  }
};

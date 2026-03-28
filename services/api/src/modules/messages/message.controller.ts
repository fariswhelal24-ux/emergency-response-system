import { Request, Response } from "express";

import { AppError } from "../../shared/errors/AppError";
import { emitMessageCreated } from "../../sockets/realtimeServer";
import { getRequiredRouteParam } from "../../shared/utils/request";
import { messageService } from "./message.service";
import { SendMessageInput } from "./message.validation";

const getAuth = (request: Request) => {
  if (!request.authUser) {
    throw new AppError("Authentication required", 401);
  }

  return {
    userId: request.authUser.userId,
    role: request.authUser.role
  };
};

export const messageController = {
  sendMessage: async (request: Request, response: Response): Promise<void> => {
    const payload = request.body as SendMessageInput;
    const message = await messageService.sendMessage(getAuth(request), payload);

    emitMessageCreated(payload.caseId, {
      caseId: payload.caseId,
      message
    });

    response.status(201).json({
      message: "Message sent",
      data: message
    });
  },

  listCaseMessages: async (request: Request, response: Response): Promise<void> => {
    const caseId = getRequiredRouteParam(request.params.caseId, "caseId");
    const messages = await messageService.listCaseMessages(getAuth(request), caseId);

    response.json({
      data: messages,
      meta: {
        count: messages.length
      }
    });
  }
};

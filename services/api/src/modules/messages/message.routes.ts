import { Router } from "express";

import { authenticate } from "../../middlewares/authenticate";
import { validateBody } from "../../middlewares/validate";
import { asyncHandler } from "../../shared/utils/asyncHandler";
import { messageController } from "./message.controller";
import { sendMessageSchema } from "./message.validation";

export const messageRoutes = Router();

messageRoutes.use(authenticate);

messageRoutes.post("/", validateBody(sendMessageSchema), asyncHandler(messageController.sendMessage));
messageRoutes.get("/case/:caseId", asyncHandler(messageController.listCaseMessages));

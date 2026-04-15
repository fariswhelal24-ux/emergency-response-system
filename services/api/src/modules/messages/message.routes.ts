import { Router } from "express";

import { authenticate } from "../../middlewares/authenticate.js";
import { validateBody } from "../../middlewares/validate.js";
import { asyncHandler } from "../../shared/utils/asyncHandler.js";
import { messageController } from "./message.controller.js";
import { sendMessageSchema } from "./message.validation.js";

export const messageRoutes = Router();

messageRoutes.use(authenticate);

messageRoutes.post("/", validateBody(sendMessageSchema), asyncHandler(messageController.sendMessage));
messageRoutes.get("/case/:caseId", asyncHandler(messageController.listCaseMessages));

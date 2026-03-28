import { Router } from "express";

import { authenticate } from "../../middlewares/authenticate";
import { validateBody } from "../../middlewares/validate";
import { asyncHandler } from "../../shared/utils/asyncHandler";
import { userController } from "./user.controller";
import { updateMedicalProfileSchema, updateUserProfileSchema } from "./user.validation";

export const userRoutes = Router();

userRoutes.use(authenticate);

userRoutes.get("/me/profile", asyncHandler(userController.getMyProfile));
userRoutes.patch(
  "/me/profile",
  validateBody(updateUserProfileSchema),
  asyncHandler(userController.updateMyProfile)
);
userRoutes.get("/me/medical-profile", asyncHandler(userController.getMyMedicalProfile));
userRoutes.put(
  "/me/medical-profile",
  validateBody(updateMedicalProfileSchema),
  asyncHandler(userController.updateMyMedicalProfile)
);
userRoutes.get("/me/history", asyncHandler(userController.getMyHistory));

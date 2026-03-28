import compression from "compression";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";

import { env } from "./config/env";
import { errorHandler } from "./middlewares/errorHandler";
import { notFoundHandler } from "./middlewares/notFound";
import { authRoutes } from "./modules/auth/auth.routes";
import { dispatcherRoutes } from "./modules/dispatcher/dispatcher.routes";
import { emergencyRoutes } from "./modules/emergencies/emergency.routes";
import { locationRoutes } from "./modules/locations/location.routes";
import { messageRoutes } from "./modules/messages/message.routes";
import { responderRoutes } from "./modules/responders/responder.routes";
import { userRoutes } from "./modules/users/user.routes";
import { volunteerRoutes } from "./modules/volunteers/volunteer.routes";
import { aiRoutes } from "./modules/ai-assistant/ai-assistant.routes";
import { medicalAdviceRoutes } from "./modules/ai-assistant/medical-advice.routes";

export const app = express();

app.use(
  cors({
    origin: env.clientOrigins,
    credentials: true
  })
);
app.use(helmet());
app.use(compression());
app.use(express.json({ limit: "2mb" }));

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 240,
    standardHeaders: true,
    legacyHeaders: false
  })
);

app.get("/health", (_request, response) => {
  response.json({
    status: "ok",
    service: "real-time-emergency-response-api",
    timestamp: new Date().toISOString()
  });
});

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/volunteers", volunteerRoutes);
app.use("/api/v1/emergencies", emergencyRoutes);
app.use("/api/v1/dispatcher", dispatcherRoutes);
app.use("/api/v1/messages", messageRoutes);
app.use("/api/v1/locations", locationRoutes);
app.use("/api/v1/responders", responderRoutes);
app.use("/api/v1/ai", aiRoutes);
app.use("/api/v1/medical-advice", medicalAdviceRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

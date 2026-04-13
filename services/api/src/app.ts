import compression from "compression";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";

import { env } from "./config/env";
import { errorHandler } from "./middlewares/errorHandler";
import { notFoundHandler } from "./middlewares/notFound";
import { authenticate } from "./middlewares/authenticate";
import { validateBody } from "./middlewares/validate";
import { authRoutes } from "./modules/auth/auth.routes";
import { dispatcherRoutes } from "./modules/dispatcher/dispatcher.routes";
import { emergencyController } from "./modules/emergencies/emergency.controller";
import { emergencyRoutes } from "./modules/emergencies/emergency.routes";
import { createEmergencySchema, initEmergencyCallSchema } from "./modules/emergencies/emergency.validation";
import { locationRoutes } from "./modules/locations/location.routes";
import { messageRoutes } from "./modules/messages/message.routes";
import { responderRoutes } from "./modules/responders/responder.routes";
import { userRoutes } from "./modules/users/user.routes";
import { volunteerRoutes } from "./modules/volunteers/volunteer.routes";
import { aiRoutes } from "./modules/ai-assistant/ai-assistant.routes";
import { medicalAdviceRoutes } from "./modules/ai-assistant/medical-advice.routes";
import AIAssistantService from "./shared/services/ai-assistant";
import { asyncHandler } from "./shared/utils/asyncHandler";

export const app = express();
// Required when clients send X-Forwarded-For (proxies, some dev tools); otherwise express-rate-limit throws.
app.set("trust proxy", 1);

const DEV_LOCAL_ORIGIN_PATTERN = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i;
const DEV_LAN_ORIGIN_PATTERN =
  /^https?:\/\/(?:10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?::\d+)?$/i;
/** Expo web / dev clients hitting the API through Cloudflare, localtunnel, or ngrok. */
const DEV_TUNNEL_ORIGIN_PATTERN =
  /^https:\/\/[\w.-]+\.(trycloudflare\.com|loca\.lt|ngrok-free\.app|ngrok\.app|ngrok\.io)(?::\d+)?$/i;

const isAllowedOrigin = (origin?: string): boolean => {
  if (!origin) {
    return true;
  }

  if (env.clientOrigins.includes(origin)) {
    return true;
  }

  if (
    !env.isProduction &&
    (DEV_LOCAL_ORIGIN_PATTERN.test(origin) ||
      DEV_LAN_ORIGIN_PATTERN.test(origin) ||
      DEV_TUNNEL_ORIGIN_PATTERN.test(origin))
  ) {
    return true;
  }

  return false;
};

app.use(
  cors({
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS blocked for origin: ${origin ?? "unknown"}`));
    },
    credentials: true
  })
);
app.use(helmet());
app.use(compression());
app.use(express.json({ limit: "15mb" }));

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

app.get("/health/ai", (_request, response) => {
  const diagnostics = AIAssistantService.getRuntimeDiagnostics();
  response.json({
    status: diagnostics.openAIConfigured ? "ok" : "degraded",
    service: "ai-assistant",
    timestamp: new Date().toISOString(),
    diagnostics
  });
});

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/volunteers", volunteerRoutes);
app.post(
  "/api/v1/emergency/init",
  authenticate,
  validateBody(initEmergencyCallSchema),
  asyncHandler(emergencyController.initEmergencyCall)
);
app.post(
  "/api/v1/emergency/create",
  authenticate,
  validateBody(createEmergencySchema),
  asyncHandler(emergencyController.createEmergency)
);
app.use("/api/v1/emergencies", emergencyRoutes);
app.use("/api/v1/dispatcher", dispatcherRoutes);
app.use("/api/v1/messages", messageRoutes);
app.use("/api/v1/locations", locationRoutes);
app.use("/api/v1/responders", responderRoutes);
app.use("/api/v1/ai", aiRoutes);
app.use("/api/v1/medical-advice", medicalAdviceRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

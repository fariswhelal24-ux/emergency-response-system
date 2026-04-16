import { createServer } from "node:http";

import { app } from "./app.js";
import { initDatabase } from "./database/init.js";
import { db } from "./database/pool.js";
import { systemBootstrapService } from "./shared/services/system-bootstrap.js";
import { attachRealtimeServer } from "./sockets/realtimeServer.js";

const server = createServer(app);

try {
  attachRealtimeServer(server);
  console.log("✅ Realtime (socket.io) server attached");
} catch (error) {
  console.warn("⚠️ Realtime server attach failed (continuing without sockets):", error);
}

const startServer = async (): Promise<void> => {
  try {
    await initDatabase();
    console.log("✅ Database initialized");
  } catch (error) {
    console.warn("⚠️ Database init skipped:", error);
  }

  try {
    await systemBootstrapService.ensureStaticAmbulanceSetup();
  } catch (error) {
    console.warn("⚠️ Bootstrap skipped:", error);
  }

  const PORT = Number(process.env.PORT) || 8080;

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
};

void startServer().catch((error: unknown) => {
  console.error("❌ Startup error:", error);
  process.exit(1);
});

// 🛑 graceful shutdown
const shutdown = async (signal: string): Promise<void> => {
  console.log(`Received ${signal}. Shutting down...`);

  server.close(async () => {
    await db.close();
    process.exit(0);
  });
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
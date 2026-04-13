import { createServer } from "node:http";

import { app } from "./app";
import { env } from "./config/env";
import { db } from "./database/pool";
import { systemBootstrapService } from "./shared/services/system-bootstrap";
import { attachRealtimeServer } from "./sockets/realtimeServer";

const server = createServer(app);

attachRealtimeServer(server);

const startServer = async (): Promise<void> => {
  await systemBootstrapService.ensureStaticAmbulanceSetup();
  console.log("Static ambulance bootstrap is ready (Bethlehem, AMB-BETH-001).");

  // ✅ التعديل هنا: نخلي السيرفر يستقبل من كل الشبكة
  server.listen(env.port, "0.0.0.0", () => {
    console.log(`🚀 Emergency backend running on:`);
    console.log(`➡️ Local:   http://localhost:${env.port}`);
    console.log(`➡️ Network: http://YOUR_IP:${env.port}`);
  });
};

void startServer().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to start server bootstrap: ${message}`);
  process.exit(1);
});

const shutdown = async (signal: string): Promise<void> => {
  console.log(`Received ${signal}. Shutting down gracefully...`);

  server.close(async () => {
    await db.close();
    process.exit(0);
  });
};

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

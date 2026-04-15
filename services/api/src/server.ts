import { createServer } from "node:http";

import { app } from "./app.js";
import { db } from "./database/pool.js";
import { systemBootstrapService } from "./shared/services/system-bootstrap.js";
import { attachRealtimeServer } from "./sockets/realtimeServer.js";

const server = createServer(app);

attachRealtimeServer(server);

const startServer = async (): Promise<void> => {
  await systemBootstrapService.ensureStaticAmbulanceSetup();

  const PORT = Number(process.env.PORT) || 4100;

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
};

void startServer().catch((error: unknown) => {
  console.error("Startup error:", error);
  process.exit(1);
});

const shutdown = async (signal: string): Promise<void> => {
  console.log(`Received ${signal}. Shutting down...`);

  server.close(async () => {
    await db.close();
    process.exit(0);
  });
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
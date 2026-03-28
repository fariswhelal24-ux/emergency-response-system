import { createServer } from "node:http";

import { app } from "./app";
import { env } from "./config/env";
import { db } from "./database/pool";
import { attachRealtimeServer } from "./sockets/realtimeServer";

const server = createServer(app);

attachRealtimeServer(server);

server.listen(env.port, env.host, () => {
  const hostLabel = env.host === "0.0.0.0" ? "localhost" : env.host;
  console.log(`Emergency backend listening on http://${hostLabel}:${env.port}`);
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

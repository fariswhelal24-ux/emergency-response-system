import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DASHBOARD_PORT = 5173;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "../..");

const wait = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const getListeningPids = (port) => {
  const result = spawnSync("lsof", ["-t", "-nP", `-iTCP:${port}`, "-sTCP:LISTEN"], {
    encoding: "utf8"
  });

  if (result.error) {
    console.warn(`[dispatcher] Could not inspect port ${port}: ${result.error.message}`);
    return [];
  }

  if (!result.stdout.trim()) {
    return [];
  }

  return result.stdout
    .split(/\s+/)
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);
};

const isAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const stopPid = async (pid) => {
  if (!isAlive(pid)) {
    return;
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return;
  }

  await wait(800);

  if (!isAlive(pid)) {
    return;
  }

  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // no-op
  }
};

for (const pid of getListeningPids(DASHBOARD_PORT)) {
  console.log(`[dispatcher] Port ${DASHBOARD_PORT} is busy (PID ${pid}). Closing old process...`);
  await stopPid(pid);
}

const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const args = [
  "--filter",
  "@ers/dispatcher-dashboard",
  "exec",
  "vite",
  "--port",
  String(DASHBOARD_PORT),
  "--strictPort"
];

console.log(`[dispatcher] Starting dashboard on http://localhost:${DASHBOARD_PORT}/`);

const child = spawn(pnpmCommand, args, {
  cwd: workspaceRoot,
  env: process.env,
  stdio: "inherit"
});

const forwardSignal = (signal) => {
  if (child.exitCode === null) {
    child.kill(signal);
  }
};

process.on("SIGINT", () => forwardSignal("SIGINT"));
process.on("SIGTERM", () => forwardSignal("SIGTERM"));

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { networkInterfaces } from "node:os";
import path from "node:path";

const API_PORT = 4100;
const API_PATH = "/api/v1";
const API_HEALTH_URL = `http://127.0.0.1:${API_PORT}/health`;
const API_READY_TIMEOUT_MS = 30_000;
const API_POLL_INTERVAL_MS = 750;
const PUBLIC_TUNNEL_TIMEOUT_MS = 20_000;
const PUBLIC_TUNNEL_CF_URL_TIMEOUT_MS = 28_000;
const PUBLIC_TUNNEL_HEALTH_TIMEOUT_MS = 8_000;
const TUNNEL_HEALTH_RETRIES = 4;
const TUNNEL_HEALTH_RETRY_DELAY_MS = 1_500;
const PUBLIC_MODE_FLAGS = new Set(["--public", "--open"]);
const PUBLIC_MODE_ENV_VALUES = new Set(["1", "true", "yes", "on"]);
const DEFAULT_EXPO_METRO_PORT = "8081";

const resolveExpoMetroPort = () => {
  const raw = process.env.ERS_EXPO_METRO_PORT?.trim() || process.env.EXPO_DEV_SERVER_PORT?.trim();
  if (!raw) {
    return DEFAULT_EXPO_METRO_PORT;
  }
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 && n < 65_536 ? String(n) : DEFAULT_EXPO_METRO_PORT;
};

const expoMetroPort = resolveExpoMetroPort();

const isLikelyVirtualInterface = (name) => {
  return /^(lo\d*|utun\d*|awdl\d*|llw\d*|bridge\d*|anpi\d*|gif\d*|stf\d*|p2p\d*|vboxnet\d*|vmnet\d*|docker\d*|br-\w+|veth\w+|tailscale\d*|wg\d*|zt\d*)$/i.test(
    name
  );
};

const isPreferredLanInterface = (name) => {
  return /^(en\d+|wlan\d+|wl\w+|eth\d+)$/i.test(name);
};

const isPrivateIpv4 = (address) => {
  return (
    /^10\./.test(address) ||
    /^192\.168\./.test(address) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(address)
  );
};

const isLocalHost = (host) => /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|::1)$/i.test(host);

const isPrivateHost = (host) =>
  /^10\./.test(host) ||
  /^192\.168\./.test(host) ||
  /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);

const isLocalOrPrivateApiBase = (value) => {
  if (!value) {
    return true;
  }

  try {
    const parsed = new URL(value);
    const host = parsed.hostname.replace(/^\[/, "").replace(/\]$/, "");
    return isLocalHost(host) || isPrivateHost(host);
  } catch {
    return true;
  }
};

const extractHostFromApiBase = (value) => {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).hostname.replace(/^\[/, "").replace(/\]$/, "");
  } catch {
    return null;
  }
};

const resolveLocalIpv4 = () => {
  const interfaces = networkInterfaces();
  const candidates = [];

  for (const [name, entries] of Object.entries(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family !== "IPv4" || entry.internal) {
        continue;
      }

      candidates.push({
        name,
        address: entry.address,
        isPrivate: isPrivateIpv4(entry.address),
        isVirtual: isLikelyVirtualInterface(name),
        isPreferred: isPreferredLanInterface(name)
      });
    }
  }

  const pick = (predicate) => candidates.find(predicate)?.address ?? null;

  return (
    pick((item) => item.isPreferred && item.isPrivate && !item.isVirtual) ||
    pick((item) => item.isPrivate && !item.isVirtual) ||
    pick((item) => item.isPreferred && item.isPrivate) ||
    pick((item) => item.isPrivate) ||
    pick((item) => !item.isVirtual) ||
    candidates[0]?.address ||
    null
  );
};

const wait = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** True if something is already listening on this TCP port (Metro / another Expo). */
const isTcpPortInUse = (port) =>
  new Promise((resolve) => {
    const server = createServer();
    server.once("error", (err) => {
      resolve(Boolean(err && err.code === "EADDRINUSE"));
    });
    server.once("listening", () => {
      server.close(() => resolve(false));
    });
    server.listen(port, "0.0.0.0");
  });

/** Pin Metro port for `--tunnel` (default 8081). Override with ERS_EXPO_METRO_PORT or EXPO_DEV_SERVER_PORT if 8081 is busy. */
const pinExpoWsTunnelPort = (args, port) => {
  const filtered = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--port" || a === "-p") {
      i += 1;
      continue;
    }
    if (a.startsWith("--port=")) {
      continue;
    }
    filtered.push(a);
  }
  filtered.push("--port", String(port));
  args.splice(0, args.length, ...filtered);
};

const fetchWithTimeout = async (url, timeoutMs) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
};

const assertTunnelHealth = async (tunnelUrl, label) => {
  const normalizedTunnelUrl = tunnelUrl.replace(/\/+$/, "");
  const healthUrl = `${normalizedTunnelUrl}/health`;
  let lastError = new Error(`${label} tunnel health check failed`);

  for (let attempt = 0; attempt < TUNNEL_HEALTH_RETRIES; attempt++) {
    if (attempt > 0) {
      await wait(TUNNEL_HEALTH_RETRY_DELAY_MS);
    }

    const response = await fetchWithTimeout(healthUrl, PUBLIC_TUNNEL_HEALTH_TIMEOUT_MS);

    if (!response || !response.ok) {
      lastError = new Error(
        `${label} tunnel is not reachable (${response ? `HTTP ${response.status}` : "network error"})`
      );
      continue;
    }

    try {
      const payload = await response.json();
      if (payload?.status && payload.status !== "ok") {
        lastError = new Error(`${label} tunnel health check failed`);
        continue;
      }
    } catch {
      // If /health returns plain text, reachability is still enough.
    }

    return;
  }

  throw lastError;
};

const withPromiseTimeout = async (promise, timeoutMs, timeoutMessage) => {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
};

const isApiHealthy = async () => {
  const response = await fetchWithTimeout(API_HEALTH_URL, 1_500);

  if (!response || !response.ok) {
    return false;
  }

  try {
    const payload = await response.json();
    return payload?.status === "ok";
  } catch {
    return true;
  }
};

const waitForApiReady = async (apiProcess) => {
  const deadline = Date.now() + API_READY_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (await isApiHealthy()) {
      return true;
    }

    if (apiProcess.exitCode !== null) {
      return false;
    }

    await wait(API_POLL_INTERVAL_MS);
  }

  return false;
};

const appDirectory = process.cwd();
const appName = path.basename(appDirectory);
const localIp = resolveLocalIpv4();
const rawArgs = process.argv.slice(2).filter((arg) => arg !== "--");
const publicModeFromArg = rawArgs.some((arg) => PUBLIC_MODE_FLAGS.has(arg));
const incomingArgs = rawArgs.filter((arg) => !PUBLIC_MODE_FLAGS.has(arg));
const publicModeFromEnv = PUBLIC_MODE_ENV_VALUES.has((process.env.EXPO_PUBLIC_MODE ?? "").trim().toLowerCase());
const publicMode = publicModeFromArg || publicModeFromEnv;
const forceExpoWsTunnel =
  publicMode &&
  !PUBLIC_MODE_ENV_VALUES.has((process.env.EXPO_USE_NGROK_TUNNEL ?? "").trim().toLowerCase());
const currentNodeMajor = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
const stableNodeCandidates = [
  process.env.ERS_STABLE_NODE_PATH?.trim(),
  "/opt/homebrew/opt/node@22/bin/node",
  "/opt/homebrew/opt/node@20/bin/node",
  "/usr/local/opt/node@22/bin/node",
  "/usr/local/opt/node@20/bin/node"
].filter(Boolean);
const stableNodePath = stableNodeCandidates.find((candidate) => existsSync(candidate));

if (
  publicMode &&
  currentNodeMajor >= 23 &&
  process.env.ERS_PUBLIC_NODE_REEXECED !== "1"
) {
  if (!stableNodePath) {
    console.error(
      `[${appName}] Public tunnel with Expo is unstable on Node ${process.version}. Install Node 20/22, then rerun.`
    );
    process.exit(1);
  }

  console.warn(
    `[${appName}] Detected Node ${process.version}. Re-launching public mode with stable Node: ${stableNodePath}`
  );

  const rerun = spawnSync(stableNodePath, [process.argv[1], ...process.argv.slice(2)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ERS_PUBLIC_NODE_REEXECED: "1"
    },
    stdio: "inherit"
  });

  if (typeof rerun.status === "number") {
    process.exit(rerun.status);
  }

  process.exit(1);
}

const explicitApiBase =
  process.env.EXPO_PUBLIC_API_BASE_URL?.trim() || process.env.EXPO_PUBLIC_API_URL?.trim();
let apiBaseUrl = explicitApiBase || `http://${localIp ?? "127.0.0.1"}:${API_PORT}${API_PATH}`;
const workspaceRoot = path.resolve(appDirectory, "../..");
const defaultExpoArgs = incomingArgs.length > 0 ? ["start", ...incomingArgs] : ["start", "--lan", "--clear"];
const expoArgs = (() => {
  if (!publicMode) {
    return defaultExpoArgs;
  }

  const nextArgs = [...defaultExpoArgs];
  if (!nextArgs.includes("--tunnel")) {
    const lanIndex = nextArgs.indexOf("--lan");
    if (lanIndex >= 0) {
      nextArgs[lanIndex] = "--tunnel";
    } else {
      const localhostIndex = nextArgs.indexOf("--localhost");
      if (localhostIndex >= 0) {
        nextArgs[localhostIndex] = "--tunnel";
      } else {
        nextArgs.push("--tunnel");
      }
    }
  }

  if (forceExpoWsTunnel) {
    pinExpoWsTunnelPort(nextArgs, expoMetroPort);
    return nextArgs;
  }

  const hasExplicitPort =
    nextArgs.includes("--port") || nextArgs.includes("-p") || nextArgs.some((arg) => arg.startsWith("--port="));
  if (!hasExplicitPort) {
    nextArgs.push("--port", expoMetroPort);
  }

  return nextArgs;
})();

const usingPnpm = (process.env.npm_config_user_agent ?? "").includes("pnpm");
const packageManagerCommand = usingPnpm
  ? process.platform === "win32"
    ? "pnpm.cmd"
    : "pnpm"
  : process.platform === "win32"
    ? "npm.cmd"
    : "npm";
const apiStartCommandArgs = usingPnpm
  ? ["--filter", "@ers/api", "dev"]
  : ["--workspace", "@ers/api", "run", "dev"];

const localExpoCli = path.join(appDirectory, "node_modules", "expo", "bin", "cli");
const hasLocalExpoCli = existsSync(localExpoCli);
const command = hasLocalExpoCli
  ? process.execPath
  : process.platform === "win32"
    ? "npx.cmd"
    : "npx";

const loadNgrok = () => {
  const requireFromApp = createRequire(path.join(appDirectory, "package.json"));
  try {
    return requireFromApp("@expo/ngrok");
  } catch {
    return null;
  }
};

/** @expo/ngrok spawns @expo/ngrok-bin; if the platform package is missing, `bin` is null and spawn throws. */
const isExpoNgrokBinaryAvailable = () => {
  const requireFromApp = createRequire(path.join(appDirectory, "package.json"));
  try {
    const bin = requireFromApp("@expo/ngrok-bin");
    return typeof bin === "string" && bin.length > 0;
  } catch {
    return false;
  }
};

const loadLocalTunnel = () => {
  const requireFromWorkspace = createRequire(path.join(workspaceRoot, "package.json"));
  try {
    return requireFromWorkspace("localtunnel");
  } catch {
    return null;
  }
};

const hasCloudflaredCli = () => {
  try {
    const result = spawnSync("cloudflared", ["--version"], { stdio: "ignore" });
    return !result.error && (result.status === 0 || result.status === null);
  } catch {
    return false;
  }
};

/**
 * Cloudflare quick tunnel (trycloudflare.com) is far more reliable than localtunnel for dev APIs.
 * Install: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
 * macOS: brew install cloudflared
 */
const openCloudflaredQuickTunnel = async () => {
  if (process.env.ERS_SKIP_CLOUDFLARED === "1") {
    return null;
  }

  if (!hasCloudflaredCli()) {
    return null;
  }

  console.log(`[${appName}] Opening public API tunnel with cloudflared (trycloudflare.com)...`);

  return new Promise((resolve, reject) => {
    let settled = false;
    let buffer = "";

    const child = spawn(
      "cloudflared",
      ["tunnel", "--no-autoupdate", "--url", `http://127.0.0.1:${API_PORT}`],
      { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env } }
    );

    const finish = (fn) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      fn();
    };

    const tryConsumeUrl = () => {
      const match = buffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
      if (!match) {
        return;
      }

      const normalizedTunnelUrl = match[0].replace(/\/+$/, "");

      finish(() => {
        void assertTunnelHealth(normalizedTunnelUrl, "cloudflared")
          .then(() => {
            resolve({
              apiBase: `${normalizedTunnelUrl}${API_PATH}`,
              publicTunnelUrl: normalizedTunnelUrl,
              close: async () => {
                try {
                  child.kill("SIGTERM");
                } catch {
                  // no-op
                }
              }
            });
          })
          .catch((healthError) => {
            try {
              child.kill("SIGTERM");
            } catch {
              // no-op
            }
            reject(healthError);
          });
      });
    };

    const onChunk = (chunk) => {
      buffer += chunk.toString();
      tryConsumeUrl();
    };

    child.stderr?.on("data", onChunk);
    child.stdout?.on("data", onChunk);

    child.on("error", () => {
      finish(() => resolve(null));
    });

    child.on("exit", (code, signal) => {
      if (settled) {
        return;
      }
      if (signal === "SIGTERM") {
        finish(() => resolve(null));
        return;
      }
      if (code && code !== 0) {
        finish(() =>
          reject(new Error(`cloudflared exited with code ${code}. Is port ${API_PORT} reachable locally?`))
        );
      }
    });

    const timer = setTimeout(() => {
      finish(() => {
        try {
          child.kill("SIGTERM");
        } catch {
          // no-op
        }
        reject(new Error(`Timed out waiting for cloudflared URL after ${PUBLIC_TUNNEL_CF_URL_TIMEOUT_MS / 1000}s`));
      });
    }, PUBLIC_TUNNEL_CF_URL_TIMEOUT_MS);
  });
};

const resolvePublicApiBase = async () => {
  if (explicitApiBase && !isLocalOrPrivateApiBase(explicitApiBase)) {
    console.log(`[${appName}] Using explicit public API base: ${explicitApiBase}`);
    return {
      apiBase: explicitApiBase,
      publicTunnelUrl: null,
      close: async () => {}
    };
  }

  try {
    const cf = await openCloudflaredQuickTunnel();
    if (cf) {
      return cf;
    }
  } catch (error) {
    console.warn(
      `[${appName}] cloudflared failed (${error instanceof Error ? error.message : String(error)}). Trying ngrok...`
    );
  }

  if (!hasCloudflaredCli()) {
    console.warn(
      `[${appName}] Install cloudflared for reliable public API URLs (localtunnel often returns HTTP 503): brew install cloudflared — see https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/`
    );
  }

  const ngrok = loadNgrok();
  const ngrokBinOk = Boolean(ngrok && isExpoNgrokBinaryAvailable());
  if (ngrok && ngrokBinOk) {
    try {
      const ngrokAuthtoken = process.env.NGROK_AUTHTOKEN?.trim();
      console.log(`[${appName}] Opening public API tunnel with ngrok...`);

      const tunnelUrl = await withPromiseTimeout(
        ngrok.connect({
          proto: "http",
          addr: API_PORT,
          authtoken: ngrokAuthtoken || undefined
        }),
        PUBLIC_TUNNEL_TIMEOUT_MS,
        `Timed out while opening ngrok tunnel after ${PUBLIC_TUNNEL_TIMEOUT_MS / 1000}s`
      );
      const normalizedTunnelUrl = tunnelUrl.replace(/\/+$/, "");
      await assertTunnelHealth(normalizedTunnelUrl, "ngrok");

      return {
        apiBase: `${normalizedTunnelUrl}${API_PATH}`,
        publicTunnelUrl: normalizedTunnelUrl,
        close: async () => {
          try {
            await ngrok.disconnect(normalizedTunnelUrl);
          } catch {
            // no-op
          }

          try {
            await ngrok.kill();
          } catch {
            // no-op
          }
        }
      };
    } catch (error) {
      try {
        await ngrok.kill();
      } catch {
        // no-op
      }

      console.warn(
        `[${appName}] ngrok failed (${error instanceof Error ? error.message : String(error)}). Trying localtunnel...`
      );
    }
  } else if (ngrok && !ngrokBinOk) {
    console.warn(
      `[${appName}] @expo/ngrok binary is not available for this platform (pnpm may have omitted optional deps). Skipping ngrok. Trying localtunnel...`
    );
  }

  const localTunnel = loadLocalTunnel();
  if (localTunnel) {
    try {
      console.log(`[${appName}] Opening public API tunnel with localtunnel...`);
      const tunnel = await withPromiseTimeout(
        localTunnel({ port: API_PORT }),
        PUBLIC_TUNNEL_TIMEOUT_MS,
        `Timed out while opening localtunnel after ${PUBLIC_TUNNEL_TIMEOUT_MS / 1000}s`
      );
      const normalizedTunnelUrl = tunnel.url.replace(/\/+$/, "");

      try {
        await assertTunnelHealth(normalizedTunnelUrl, "localtunnel");
      } catch (healthError) {
        try {
          tunnel.close();
        } catch {
          // no-op
        }
        throw healthError;
      }

      return {
        apiBase: `${normalizedTunnelUrl}${API_PATH}`,
        publicTunnelUrl: normalizedTunnelUrl,
        close: async () => {
          try {
            tunnel.close();
          } catch {
            // no-op
          }
        }
      };
    } catch (error) {
      console.warn(
        `[${appName}] localtunnel failed (${error instanceof Error ? error.message : String(error)}).`
      );
    }
  }

  console.warn(
    `[${appName}] Public mode needs cloudflared, ngrok, or localtunnel. Install cloudflared for best results (brew install cloudflared). Falling back to LAN API base.`
  );
  return null;
};

if (!explicitApiBase && !localIp) {
  console.warn(`[${appName}] Could not detect LAN IP automatically. Falling back to 127.0.0.1.`);
}

if (explicitApiBase && localIp) {
  const explicitHost = extractHostFromApiBase(explicitApiBase);
  const autoSwitchStaleLanBase = PUBLIC_MODE_ENV_VALUES.has(
    (process.env.EXPO_AUTO_SWITCH_STALE_LAN ?? "").trim().toLowerCase()
  );
  const looksLikeStaleLanBase =
    explicitHost &&
    isPrivateHost(explicitHost) &&
    explicitHost !== localIp &&
    autoSwitchStaleLanBase;

  if (looksLikeStaleLanBase) {
    apiBaseUrl = `http://${localIp}:${API_PORT}${API_PATH}`;
    console.warn(
      `[${appName}] EXPO_PUBLIC_API_BASE_URL host (${explicitHost}) was auto-switched to current LAN IP (${localIp}).`
    );
  }
}

let apiProcess = null;
if (await isApiHealthy()) {
  console.log(`[${appName}] API is already running at ${API_HEALTH_URL}`);
} else {
  console.log(`[${appName}] API not detected, starting workspace service (@ers/api)...`);
  apiProcess = spawn(packageManagerCommand, apiStartCommandArgs, {
    cwd: workspaceRoot,
    env: process.env,
    stdio: "inherit"
  });

  const ready = await waitForApiReady(apiProcess);
  if (ready) {
    console.log(`[${appName}] API is ready at ${API_HEALTH_URL}`);
  } else {
    console.warn(
      `[${appName}] API did not become healthy in time. Expo will still start, but mobile requests may fail until the backend is up.`
    );
  }
}

let closePublicTunnel = null;
let publicTunnelUrl = null;

if (publicMode) {
  if (forceExpoWsTunnel) {
    console.log(
      `[${appName}] Public mode enabled. Expo tunnel will use WS mode (no ngrok binary dependency).`
    );
  } else {
    console.log(`[${appName}] Public mode enabled. Expo will run with --tunnel for cross-network access.`);
  }

  const shouldReplaceLocalBase = !explicitApiBase || isLocalOrPrivateApiBase(explicitApiBase);
  if (shouldReplaceLocalBase) {
    try {
      const result = await resolvePublicApiBase();
      if (result?.apiBase) {
        apiBaseUrl = result.apiBase;
        publicTunnelUrl = result.publicTunnelUrl;
        closePublicTunnel = result.close;
      } else {
        console.error(
          `[${appName}] Public mode requested but no public API tunnel is available. Aborting to avoid unusable LAN QR.`
        );
        process.exit(1);
      }
    } catch (error) {
      console.error(
        `[${appName}] Could not open public tunnel (${error instanceof Error ? error.message : String(error)}).`
      );
      console.error(
        `[${appName}] Start a tunnel manually (for example: npx localtunnel --port ${API_PORT}) and rerun with EXPO_PUBLIC_API_BASE_URL=https://<public-domain>${API_PATH}.`
      );
      process.exit(1);
    }
  }
}

console.log(`[${appName}] API base: ${apiBaseUrl}`);
if (publicTunnelUrl) {
  console.log(`[${appName}] Public API tunnel: ${publicTunnelUrl}`);
}

if (forceExpoWsTunnel) {
  const metroPort = Number.parseInt(expoMetroPort, 10);
  if (await isTcpPortInUse(metroPort)) {
    console.error(
      `[${appName}] Port ${expoMetroPort} is already in use (another Expo/Metro window). Public tunnel mode needs a free Metro port.`
    );
    console.error(
      `[${appName}] Close the other dev server, or free the port: lsof -ti :${expoMetroPort} | xargs kill`
    );
    console.error(
      `[${appName}] Or use another port: ERS_EXPO_METRO_PORT=8082 pnpm run dev:public:unified`
    );
    if (closePublicTunnel) {
      try {
        await closePublicTunnel();
      } catch {
        // no-op
      }
    }
    if (apiProcess && apiProcess.exitCode === null) {
      apiProcess.kill("SIGTERM");
    }
    process.exit(1);
  }
}

const commandArgs = hasLocalExpoCli ? [localExpoCli, ...expoArgs] : ["expo", ...expoArgs];

const expoChildEnv = {
  ...process.env,
  EXPO_PUBLIC_API_BASE_URL: apiBaseUrl,
  EXPO_PUBLIC_API_URL: apiBaseUrl
};

if (!process.env.EXPO_PUBLIC_WS_BASE_URL?.trim() && /^https?:\/\//i.test(apiBaseUrl)) {
  try {
    const origin = new URL(apiBaseUrl.replace(/\/api\/v1\/?$/i, ""));
    expoChildEnv.EXPO_PUBLIC_WS_BASE_URL = `${origin.protocol}//${origin.host}`;
  } catch {
    // keep existing env only
  }
}

const expoProcess = spawn(command, commandArgs, {
  cwd: appDirectory,
  env: {
    ...expoChildEnv,
    ...(forceExpoWsTunnel ? { EXPO_FORCE_WEBCONTAINER_ENV: "1" } : {})
  },
  stdio: "inherit"
});

const stopApiIfStartedByScript = () => {
  if (!apiProcess || apiProcess.exitCode !== null) {
    return;
  }

  apiProcess.kill("SIGTERM");
};

const stopPublicTunnel = async () => {
  if (!closePublicTunnel) {
    return;
  }

  try {
    await closePublicTunnel();
  } catch {
    // No-op: this is cleanup only.
  } finally {
    closePublicTunnel = null;
  }
};

const shutdown = async (code, signal) => {
  stopApiIfStartedByScript();
  await stopPublicTunnel();

  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
};

expoProcess.on("exit", (code, signal) => {
  void shutdown(code, signal);
});

process.on("SIGINT", () => {
  if (expoProcess.exitCode === null) {
    expoProcess.kill("SIGINT");
  }
  stopApiIfStartedByScript();
  void stopPublicTunnel();
});

process.on("SIGTERM", () => {
  if (expoProcess.exitCode === null) {
    expoProcess.kill("SIGTERM");
  }
  stopApiIfStartedByScript();
  void stopPublicTunnel();
});

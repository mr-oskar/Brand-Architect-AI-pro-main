import app from "./app";
import { logger } from "./lib/logger";
import { startScheduler } from "./lib/scheduler";
import { syncRuntimeSettings } from "./lib/runtimeSettings";
import { seedAdmins } from "./lib/seedAdmins";

syncRuntimeSettings();

// Bootstrap the admin account(s) from the server-side config file before
// accepting traffic. Idempotent: safe to run on every restart.
seedAdmins().catch((err) => {
  logger.error({ err }, "Admin bootstrap failed (server will still start)");
});

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  startScheduler(60_000);
});

server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

// ─── Process-level safety nets ───────────────────────────────────────────────
// Log (don't crash) on unexpected promise rejections / exceptions so the
// server keeps serving healthy requests instead of dying silently.
process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "Unhandled promise rejection");
});

process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "Uncaught exception");
  // Give the logger a moment to flush, then exit so the workflow restarts
  // with a clean state. (uncaughtException leaves the process in an
  // undefined state — restarting is the safe choice.)
  setTimeout(() => process.exit(1), 200);
});

// Graceful shutdown on SIGTERM/SIGINT (lets in-flight requests finish)
function gracefulShutdown(signal: string) {
  logger.info({ signal }, "Received shutdown signal, closing server");
  server.close((err) => {
    if (err) {
      logger.error({ err }, "Error during server close");
      process.exit(1);
    }
    logger.info("Server closed cleanly");
    process.exit(0);
  });
  // Hard-exit after 10s if connections refuse to close
  setTimeout(() => {
    logger.warn("Forcing shutdown after timeout");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

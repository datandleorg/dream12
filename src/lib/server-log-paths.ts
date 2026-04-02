import { existsSync, mkdirSync } from "fs";
import { join } from "path";

/** Writable NDJSON log directory (created on demand). */
export function getServerLogDir(): string {
  const dir = process.env.SERVER_LOG_DIR?.trim() || join(process.cwd(), ".data", "logs");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export const SERVER_LOG_FILENAME = "server.ndjson";

export function getServerLogFilePath(): string {
  return join(getServerLogDir(), SERVER_LOG_FILENAME);
}

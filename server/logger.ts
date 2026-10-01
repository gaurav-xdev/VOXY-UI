import pino, { type Logger } from "pino";
import type { AppConfig } from "./config";

/**
 * Structured JSON logs. Request/response headers and bodies are NEVER logged (so cookies,
 * CSRF tokens and passwords cannot leak), and a redaction list is a second line of defence.
 */
export const REDACT_PATHS = [
  "password",
  "currentPassword",
  "newPassword",
  "token",
  "secret",
  "apiKey",
  "authorization",
  "cookie",
  "*.password",
  "*.currentPassword",
  "*.newPassword",
  "*.token",
  "*.secret",
  "*.apiKey",
  "*.authorization",
  "*.cookie",
  "req.headers",
  "res.headers",
  "headers",
  "err.config",
  "err.request",
  "err.response",
];

export function createLogger(config: Pick<AppConfig, "logLevel" | "deployEnv">, destination?: pino.DestinationStream): Logger {
  const options: pino.LoggerOptions = {
    level: config.logLevel,
    base: { service: "voxy", env: config.deployEnv },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: { paths: REDACT_PATHS, censor: "[redacted]" },
    formatters: { level: (label) => ({ level: label }) },
  };
  if (!destination && config.deployEnv === "development") {
    return pino({ ...options, transport: { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname,service,env" } } });
  }
  return destination ? pino(options, destination) : pino(options);
}

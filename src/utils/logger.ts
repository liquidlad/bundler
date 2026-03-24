// Simple logging utility

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

let currentLevel = LogLevel.INFO;

export function setLogLevel(level: LogLevel) {
  currentLevel = level;
}

function timestamp(): string {
  return new Date().toISOString();
}

export function debug(msg: string, ...args: unknown[]) {
  if (currentLevel <= LogLevel.DEBUG) console.log(`[${timestamp()}] DEBUG: ${msg}`, ...args);
}

export function info(msg: string, ...args: unknown[]) {
  if (currentLevel <= LogLevel.INFO) console.log(`[${timestamp()}] INFO: ${msg}`, ...args);
}

export function warn(msg: string, ...args: unknown[]) {
  if (currentLevel <= LogLevel.WARN) console.warn(`[${timestamp()}] WARN: ${msg}`, ...args);
}

export function error(msg: string, ...args: unknown[]) {
  if (currentLevel <= LogLevel.ERROR) console.error(`[${timestamp()}] ERROR: ${msg}`, ...args);
}

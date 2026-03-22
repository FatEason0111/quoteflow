import { tooManyRequests } from "./errors.js";

const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const attempts = new Map();

function normalizeEmail(email) {
  return String(email ?? "").trim().toLowerCase();
}

function getKey(email, ipAddress) {
  const ip = String(ipAddress ?? "unknown").trim() || "unknown";
  return `${ip}::${normalizeEmail(email)}`;
}

function getFreshEntry(key, now = Date.now()) {
  const existing = attempts.get(key);
  if (!existing) {
    return {
      count: 0,
      windowStartedAt: now,
      blockedUntil: 0,
    };
  }

  if (existing.blockedUntil && existing.blockedUntil > now) {
    return existing;
  }

  if (now - existing.windowStartedAt >= ATTEMPT_WINDOW_MS) {
    return {
      count: 0,
      windowStartedAt: now,
      blockedUntil: 0,
    };
  }

  return existing;
}

export function assertLoginAttemptAllowed({ email, ipAddress }) {
  const key = getKey(email, ipAddress);
  const entry = getFreshEntry(key);

  if (entry.blockedUntil && entry.blockedUntil > Date.now()) {
    throw tooManyRequests("Too many login attempts. Please wait a few minutes and try again.");
  }
}

export function recordLoginFailure({ email, ipAddress }) {
  const now = Date.now();
  const key = getKey(email, ipAddress);
  const entry = getFreshEntry(key, now);
  const nextCount = entry.count + 1;

  attempts.set(key, {
    count: nextCount,
    windowStartedAt: entry.windowStartedAt,
    blockedUntil: nextCount >= MAX_ATTEMPTS ? now + ATTEMPT_WINDOW_MS : 0,
  });
}

export function clearLoginFailures({ email, ipAddress }) {
  attempts.delete(getKey(email, ipAddress));
}

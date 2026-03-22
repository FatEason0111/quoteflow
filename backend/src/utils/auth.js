import crypto from "node:crypto";
import bcrypt from "bcrypt";
import { env } from "../config/env.js";

export async function hashPassword(password) {
  return bcrypt.hash(password, env.bcryptRounds);
}

export async function comparePassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

export function generateSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}

export function hashSessionToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

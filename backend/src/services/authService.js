import { prisma } from "../lib/prisma.js";
import { comparePassword, generateSessionToken, hashSessionToken } from "../utils/auth.js";
import { badRequest, unauthorized } from "../utils/errors.js";
import { env } from "../config/env.js";
import { toApiUser } from "../utils/presentation.js";

function getSessionMaxAge(rememberMe) {
  if (rememberMe) {
    return env.sessionRememberDays * 24 * 60 * 60 * 1000;
  }

  return env.sessionTtlHours * 60 * 60 * 1000;
}

export async function login({
  email,
  password,
  rememberMe = true,
  ipAddress,
  userAgent,
}) {
  if (!email || !password) {
    throw badRequest("Email and password are required.");
  }

  const user = await prisma.user.findFirst({
    where: {
      email: email.trim().toLowerCase(),
      status: "ACTIVE",
    },
    include: {
      workspace: true,
    },
  });

  if (!user) {
    throw unauthorized("Invalid email or password.");
  }

  const isValid = await comparePassword(password, user.passwordHash);
  if (!isValid) {
    throw unauthorized("Invalid email or password.");
  }

  const token = generateSessionToken();
  const sessionMaxAge = getSessionMaxAge(rememberMe);
  const expiresAt = new Date(Date.now() + sessionMaxAge);

  await prisma.$transaction([
    prisma.authSession.create({
      data: {
        workspaceId: user.workspaceId,
        userId: user.id,
        sessionTokenHash: hashSessionToken(token),
        expiresAt,
        ipAddress,
        userAgent,
      },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    }),
  ]);

  return {
    token,
    maxAge: sessionMaxAge,
    user: toApiUser(user, user.workspace),
  };
}

export async function logout(sessionId) {
  if (!sessionId) {
    return;
  }

  await prisma.authSession.deleteMany({
    where: {
      id: sessionId,
    },
  });
}

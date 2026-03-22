import { prisma } from "../lib/prisma.js";
import { env, isProduction } from "../config/env.js";
import { hashSessionToken } from "../utils/auth.js";
import { forbidden, unauthorized } from "../utils/errors.js";

function sessionCookieOptions(maxAge) {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
    maxAge,
  };
}

export function setSessionCookie(res, token, maxAge) {
  res.cookie(env.sessionCookieName, token, sessionCookieOptions(maxAge));
}

export function clearSessionCookie(res) {
  res.clearCookie(env.sessionCookieName, sessionCookieOptions(0));
}

export function attachAuthContext(req, _res, next) {
  Promise.resolve()
    .then(async () => {
      const rawToken = req.cookies?.[env.sessionCookieName];

      if (!rawToken) {
        req.auth = null;
        next();
        return;
      }

      const session = await prisma.authSession.findUnique({
        where: {
          sessionTokenHash: hashSessionToken(rawToken),
        },
        include: {
          user: true,
          workspace: true,
        },
      });

      if (!session || session.expiresAt < new Date() || session.user.status !== "ACTIVE") {
        req.auth = null;
        next();
        return;
      }

      req.auth = {
        sessionId: session.id,
        user: session.user,
        workspace: session.workspace,
        workspaceId: session.workspaceId,
        token: rawToken,
      };

      await prisma.authSession.update({
        where: { id: session.id },
        data: { lastSeenAt: new Date() },
      });

      next();
    })
    .catch(next);
}

export function requireAuth(req, _res, next) {
  if (!req.auth?.user) {
    return next(unauthorized());
  }

  return next();
}

export function requireRoles(...roles) {
  return (req, _res, next) => {
    if (!req.auth?.user) {
      return next(unauthorized());
    }

    if (req.auth.user.role === "ADMIN") {
      return next();
    }

    if (!roles.includes(req.auth.user.role)) {
      return next(forbidden());
    }

    return next();
  };
}

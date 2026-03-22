import express from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { login, logout } from "../services/authService.js";
import { clearSessionCookie, requireAuth, setSessionCookie } from "../middleware/auth.js";
import { sendData, sendNoContent } from "../utils/response.js";
import { toApiUser } from "../utils/presentation.js";

export const authRouter = express.Router();

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const result = await login({
      email: req.body.email,
      password: req.body.password,
      rememberMe: req.body.rememberMe !== false,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });

    setSessionCookie(res, result.token, result.maxAge);
    sendData(res, result.user);
  })
);

authRouter.post(
  "/logout",
  requireAuth,
  asyncHandler(async (req, res) => {
    await logout(req.auth.sessionId);
    clearSessionCookie(res);
    sendNoContent(res);
  })
);

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    sendData(res, toApiUser(req.auth.user, req.auth.workspace));
  })
);

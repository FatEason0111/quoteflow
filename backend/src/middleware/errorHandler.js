import { AppError } from "../utils/errors.js";

export function notFoundHandler(req, _res, next) {
  next(new AppError("NOT_FOUND", `Route not found: ${req.method} ${req.originalUrl}`, 404));
}

export function errorHandler(error, req, res, _next) {
  const statusCode = error.statusCode ?? 500;
  const code = error.code ?? "INTERNAL_ERROR";
  const message = statusCode >= 500 ? "Internal server error." : error.message;

  if (statusCode >= 500) {
    console.error(
      JSON.stringify({
        requestId: req.requestId,
        error: error.message,
        stack: error.stack,
      })
    );
  }

  res.status(statusCode).json({
    error: {
      code,
      message,
      details: error.details,
    },
  });
}

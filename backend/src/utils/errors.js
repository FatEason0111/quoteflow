export class AppError extends Error {
  constructor(code, message, statusCode = 400, details) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export const badRequest = (message, details) => new AppError("BAD_REQUEST", message, 400, details);
export const unauthorized = (message = "Authentication required.") =>
  new AppError("UNAUTHORIZED", message, 401);
export const forbidden = (message = "You do not have access to this resource.") =>
  new AppError("FORBIDDEN", message, 403);
export const notFound = (message = "Resource not found.") => new AppError("NOT_FOUND", message, 404);
export const conflict = (message, details) => new AppError("CONFLICT", message, 409, details);

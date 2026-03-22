import crypto from "node:crypto";

export function requestLogger(req, _res, next) {
  req.requestId = crypto.randomUUID();
  req.requestStartedAt = Date.now();
  next();
}

export function responseLogger(req, res, next) {
  res.on("finish", () => {
    const durationMs = Date.now() - (req.requestStartedAt ?? Date.now());
    console.log(
      JSON.stringify({
        requestId: req.requestId,
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs,
      })
    );
  });

  next();
}

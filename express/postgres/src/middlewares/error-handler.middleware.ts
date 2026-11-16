import type { ErrorRequestHandler } from 'express';

export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  const status = err.status ?? 500;

  if (res.headersSent) return next(err);

  if (status >= 500) {
    console.error(err);
  }

  res.status(status).json({ message: status < 500 ? err.message : 'Something went wrong!' });
};

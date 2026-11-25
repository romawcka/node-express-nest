import type { IncomingMessage, ServerResponse } from 'node:http';
import { HttpError } from '../errors/http.error.ts';
import { sendJson } from '../helpers/send.helper.ts';

export const errorHandler = (err: unknown, _req: IncomingMessage, res: ServerResponse) => {
  const status = err instanceof HttpError ? err.status : 500;

  if (status >= 500) console.error(err);

  // The response has already begun: we cannot send a JSON error, so we terminate the connection.
  if (res.headersSent) return res.destroy();

  sendJson(res, status, { message: err instanceof HttpError && status < 500 ? err.message : 'Something went wrong!' });
};

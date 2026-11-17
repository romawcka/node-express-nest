import type { ServerResponse } from 'node:http';

export const sendJson = (res: ServerResponse, status: number, body?: unknown) => {
  // The response is sent once: after sending the headers, setHeader will throw an error.
  if (res.headersSent || res.writableEnded) return;

  res.statusCode = status;

  // 204 No Content and 304 Not Modified have no body.
  if (status === 204 || status === 304 || body === undefined) {
    return res.end();
  }

  const json = JSON.stringify(body);

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Length', Buffer.byteLength(json));
  res.end(json);
};

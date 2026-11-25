import type { IncomingMessage } from 'node:http';
import { HttpError } from '../errors/http.error.ts';

const LIMIT = 100 * 1024;

const tooLarge = () => new HttpError(413, 'request entity too large');

export const readJson = async (req: IncomingMessage): Promise<unknown> => {
  if (Number(req.headers['content-length']) > LIMIT) throw tooLarge();

  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size <= LIMIT) {
      chunks.push(chunk);
    }
  }

  if (size > LIMIT) throw tooLarge();
  if (size === 0) return undefined;

  const type = req.headers['content-type']?.split(';')[0]?.trim().toLowerCase();

  if (type !== 'application/json') {
    throw new HttpError(415, 'Content-Type must be application/json');
  }

  const text = Buffer.concat(chunks).toString('utf-8');

  try {
    return JSON.parse(text);
  } catch (err) {
    throw new HttpError(400, (err as SyntaxError).message);
  }
};

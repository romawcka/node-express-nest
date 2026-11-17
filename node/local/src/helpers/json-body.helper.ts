import type { IncomingMessage } from 'node:http';
import { HttpError } from '../errors/http.error.ts';

const LIMIT = 100 * 1024;

const tooLarge = () => new HttpError(413, 'request entity too large');

export const readJson = async (req: IncomingMessage): Promise<unknown> => {
  if (Number(req.headers['content-length']) > LIMIT) throw tooLarge();

  const chunks: Buffer[] = [];
  let size = 0;

  // req — readable stream
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size <= LIMIT) {
      // Limit exceeded: continue reading the stream to the end, but do not store any more data.
      chunks.push(chunk);
    }
  }

  if (size > LIMIT) throw tooLarge();
  if (size === 0) return undefined;

  const type = req.headers['content-type']?.split(';')[0]?.trim().toLowerCase();

  if (type !== 'application/json') {
    throw new HttpError(415, 'Content-Type must be application/json');
  }

  // Decode once after concatenation: a multi-byte UTF-8 character might be split across chunks.
  const text = Buffer.concat(chunks).toString('utf-8');

  try {
    return JSON.parse(text);
  } catch (err) {
    throw new HttpError(400, (err as SyntaxError).message);
  }
};

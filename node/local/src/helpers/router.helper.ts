import type { IncomingMessage, ServerResponse } from 'node:http';
import { HttpError } from '../errors/http.error.ts';

export type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export type Handler = (req: IncomingMessage, res: ServerResponse) => boolean | Promise<boolean>;

export type Route = {
  method: Method;
  path: string; // for example, '/tasks/:id'
  handler: (req: IncomingMessage, res: ServerResponse, ...params: string[]) => unknown;
};

// matchPath('/tasks/:id', '/tasks/abc') → ['abc']; do not match → undefined.
const matchPath = (pattern: string, pathname: string) => {
  const desiredStr = pattern.split('/').filter(Boolean);
  const gotStr = pathname.split('/').filter(Boolean);

  if (desiredStr.length !== gotStr.length) return undefined;

  const params: string[] = [];

  for (const [i, segment] of desiredStr.entries()) {
    const value = gotStr[i] ?? '';

    if (segment.startsWith(':')) {
      params.push(value);
    } else if (segment !== value) {
      return undefined;
    }
  }

  return params;
};

const decode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new HttpError(400, `Failed to decode param '${value}'`);
  }
};

export const createRouter = (routes: Route[]): Handler => {
  return async (req, res) => {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost');

    for (const route of routes) {
      if (route.method !== req.method) continue;

      const params = matchPath(route.path, pathname);

      if (!params) continue;

      await route.handler(req, res, ...params.map(decode));
      return true;
    }

    return false;
  };
};

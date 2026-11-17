import type { Handler } from '../helpers/router.helper.ts';

export const cors: Handler = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'OPTIONS') return false;

  res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE');
  res.setHeader('Vary', 'Access-Control-Request-Headers');

  const requestHeaders = req.headers['access-control-request-headers'];

  if (requestHeaders) {
    res.setHeader('Access-Control-Allow-Headers', requestHeaders);
  }

  res.statusCode = 204;
  res.setHeader('Content-Length', '0');
  res.end();

  return true;
};

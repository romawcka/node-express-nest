// morgan-like-tiny logger
// ':method :url :status :res[content-length] - :response-time ms'

import type { Handler } from '../helpers/router.helper.ts';

export const logger: Handler = (req, res) => {
  const start = performance.now();

  res.once('finish', () => {
    const ms = (performance.now() - start).toFixed(3);
    const length = res.getHeader('content-length') ?? '-';

    console.log(`${req.method} ${req.url} ${res.statusCode} ${length} - ${ms} ms`);
  });

  return false;
};

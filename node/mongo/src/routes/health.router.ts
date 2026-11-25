import { createRouter } from '../helpers/router.helper.ts';
import { sendJson } from '../helpers/send.helper.ts';

export const createHealthRouter = (isDatabaseConnected: () => boolean) =>
  createRouter([
    {
      method: 'GET',
      path: '/health',
      handler: (_req, res) => sendJson(res, 200, { status: 'ok', db: isDatabaseConnected() ? 'up' : 'down' }),
    },
  ]);

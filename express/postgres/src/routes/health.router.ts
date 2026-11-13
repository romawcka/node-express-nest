import { Router } from 'express';

export const createHealthRouter = (isDbConnected: () => Promise<boolean>) => {
  const router = Router();

  router.get('/health', async (_req, res) => {
    const isUp = await isDbConnected();

    res.json({ status: 'ok', db: isUp ? 'up' : 'down' });
  });

  return router;
};

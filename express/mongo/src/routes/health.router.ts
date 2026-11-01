import { Router } from "express";

export const createHealthRouter = (isDbConnected: () => boolean) => {
  const router = Router();

  router.get("/health", (_req, res) =>
    res.json({ status: "ok", db: isDbConnected() ? "up" : "down" }),
  );

  return router;
};

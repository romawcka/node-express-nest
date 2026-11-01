import { Router } from "express";

export const createHealthRouter = () => {
  const router = Router();

  router.get("/health", (_req, res) => res.json({ status: "ok" }));

  return router;
};

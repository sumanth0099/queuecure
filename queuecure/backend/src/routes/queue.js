import { Router } from "express";
import { prisma } from "../index.js";
import { buildQueueState } from "../socket/handlers.js";

const router = Router();

// GET full queue state (used on page load / refresh)
router.get("/", async (req, res) => {
  try {
    const state = await buildQueueState(prisma);
    res.json(state);
  } catch (err) {
    console.error("[REST] GET /queue error:", err);
    res.status(500).json({ error: "Failed to fetch queue." });
  }
});

export default router;

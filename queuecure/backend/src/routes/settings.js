import { Router } from "express";
import { prisma } from "../index.js";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const settings = await prisma.settings.findUnique({ where: { id: 1 } });
    res.json(settings ?? { avgConsultationTime: 10 });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch settings." });
  }
});

export default router;

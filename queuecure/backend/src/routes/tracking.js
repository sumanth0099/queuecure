import { Router } from "express";
import { prisma } from "../index.js";
import { computeWaitEstimates } from "../socket/handlers.js";

const router = Router();

router.get("/:trackingId", async (req, res) => {
  const { trackingId } = req.params;

  try {
    const patient = await prisma.patient.findUnique({ where: { trackingId } });

    if (!patient) {
      return res.status(404).json({ error: "Patient not found." });
    }

    const currentlyServing = await prisma.patient.findFirst({
      where: { status: "serving" },
    });

    let patientsAhead = 0;
    if (patient.status === "waiting") {
      patientsAhead = await prisma.patient.count({
        where: {
          status: "waiting",
          token: { lt: patient.token },
        },
      });
      if (currentlyServing) patientsAhead += 1;
    }

    const estimates = await computeWaitEstimates(prisma, patientsAhead);

    res.json({
      patient,
      currentlyServing,
      patientsAhead,
      ...estimates,
    });
  } catch (err) {
    console.error("[REST] GET /track error:", err);
    res.status(500).json({ error: "Failed to fetch tracking info." });
  }
});

export default router;

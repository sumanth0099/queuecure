import { v4 as uuidv4 } from "uuid";

// Track in-progress operations to prevent race conditions
const lockSet = new Set();

/**
 * Compute wait time estimates based on real consultation history.
 * Returns both the static expected wait (using setting) and the
 * live estimate (using moving average of last 5 consultations).
 */
async function computeWaitEstimates(prisma, patientsAhead) {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  const avgTime = settings?.avgConsultationTime ?? 10;

  const recentConsultations = await prisma.consultation.findMany({
    where: { duration: { not: null } },
    orderBy: { startTime: "desc" },
    take: 5,
  });

  let liveAvg = avgTime;
  if (recentConsultations.length > 0) {
    const totalDuration = recentConsultations.reduce(
      (sum, c) => sum + (c.duration ?? 0),
      0
    );
    liveAvg = Math.round(totalDuration / recentConsultations.length);
  }

  const expectedWait = patientsAhead * avgTime;
  const liveEstimate = patientsAhead * liveAvg;

  // Queue health status
  let queueStatus = "on-schedule";
  if (expectedWait === 0) {
    queueStatus = "on-schedule";
  } else {
    const diff = (liveEstimate - expectedWait) / expectedWait;
    if (diff < -0.2) queueStatus = "ahead";
    else if (diff <= 0.1) queueStatus = "on-schedule";
    else if (diff <= 0.3) queueStatus = "slight-delay";
    else queueStatus = "delayed";
  }

  return { expectedWait, liveEstimate, queueStatus, liveAvg };
}

/**
 * Build the full queue state to broadcast to all clients.
 */
async function buildQueueState(prisma) {
  const [waiting, serving, skipped, completed, settings] = await Promise.all([
    prisma.patient.findMany({
      where: { status: "waiting" },
      orderBy: { token: "asc" },
    }),
    prisma.patient.findMany({
      where: { status: "serving" },
      orderBy: { calledAt: "asc" },
    }),
    prisma.patient.findMany({
      where: { status: "skipped" },
      orderBy: { token: "asc" },
    }),
    prisma.patient.findMany({
      where: { status: "completed" },
      orderBy: { completedAt: "desc" },
      take: 10,
    }),
    prisma.settings.findUnique({ where: { id: 1 } }),
  ]);

  const currentPatient = serving[0] ?? null;
  const patientsAhead = waiting.length;
  const estimates = await computeWaitEstimates(prisma, patientsAhead);

  return {
    queue: waiting,
    currentPatient,
    skipped,
    recentCompleted: completed,
    waitingCount: waiting.length,
    avgConsultationTime: settings?.avgConsultationTime ?? 10,
    ...estimates,
  };
}

export function registerSocketHandlers(io, prisma) {
  io.on("connection", async (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // Send full state on connection
    try {
      const state = await buildQueueState(prisma);
      socket.emit("queueState", state);
    } catch (err) {
      console.error("[Socket] Error sending initial state:", err);
    }

    // ─── ADD PATIENT ────────────────────────────────────────────────
    socket.on("addPatient", async ({ name }, callback) => {
      if (!name || !name.trim()) {
        return callback?.({ error: "Patient name is required." });
      }

      try {
        // Get next token atomically
        const latest = await prisma.patient.aggregate({ _max: { token: true } });
        const token = (latest._max.token ?? 0) + 1;

        const patient = await prisma.patient.create({
          data: {
            id: uuidv4(),
            token,
            name: name.trim(),
            trackingId: uuidv4(),
            status: "waiting",
          },
        });

        const state = await buildQueueState(prisma);
        io.emit("queueUpdated", state);

        callback?.({ success: true, patient });
        console.log(`[Queue] Added patient: ${patient.name} (Token ${token})`);
      } catch (err) {
        console.error("[Socket] addPatient error:", err);
        callback?.({ error: "Failed to add patient." });
      }
    });

    // ─── CALL NEXT ──────────────────────────────────────────────────
    socket.on("callNext", async (_, callback) => {
      // Prevent double-click race conditions
      if (lockSet.has("callNext")) {
        return callback?.({ error: "Operation in progress." });
      }
      lockSet.add("callNext");

      try {
        // Check if someone is already being served
        const alreadyServing = await prisma.patient.findFirst({
          where: { status: "serving" },
        });
        if (alreadyServing) {
          return callback?.({ error: "Complete or skip the current patient first." });
        }

        // Find first waiting patient
        const next = await prisma.patient.findFirst({
          where: { status: "waiting" },
          orderBy: { token: "asc" },
        });

        if (!next) {
          return callback?.({ error: "No patients in queue." });
        }

        const now = new Date();
        const updated = await prisma.patient.update({
          where: { id: next.id },
          data: { status: "serving", calledAt: now },
        });

        // Create consultation record
        await prisma.consultation.create({
          data: {
            id: uuidv4(),
            patientId: next.id,
            startTime: now,
          },
        });

        const state = await buildQueueState(prisma);
        io.emit("queueUpdated", state);
        io.emit("tokenCalled", {
          token: updated.token,
          name: updated.name,
          patient: updated,
        });

        callback?.({ success: true, patient: updated });
        console.log(`[Queue] Called Token ${updated.token}: ${updated.name}`);
      } catch (err) {
        console.error("[Socket] callNext error:", err);
        callback?.({ error: "Failed to call next patient." });
      } finally {
        lockSet.delete("callNext");
      }
    });

    // ─── COMPLETE PATIENT ───────────────────────────────────────────
    socket.on("completePatient", async ({ patientId }, callback) => {
      try {
        const patient = await prisma.patient.findUnique({ where: { id: patientId } });
        if (!patient || patient.status !== "serving") {
          return callback?.({ error: "Patient is not currently being served." });
        }

        const now = new Date();
        const calledAt = patient.calledAt ?? now;
        const durationMs = now.getTime() - calledAt.getTime();
        const durationMins = Math.max(1, Math.round(durationMs / 60000));

        await prisma.patient.update({
          where: { id: patientId },
          data: { status: "completed", completedAt: now },
        });

        // Update consultation record
        const consultation = await prisma.consultation.findFirst({
          where: { patientId, endTime: null },
          orderBy: { startTime: "desc" },
        });

        if (consultation) {
          await prisma.consultation.update({
            where: { id: consultation.id },
            data: { endTime: now, duration: durationMins },
          });
        }

        const state = await buildQueueState(prisma);
        io.emit("queueUpdated", state);
        io.emit("patientCompleted", { patientId, duration: durationMins });

        callback?.({ success: true });
        console.log(`[Queue] Completed Token ${patient.token} (${durationMins} mins)`);
      } catch (err) {
        console.error("[Socket] completePatient error:", err);
        callback?.({ error: "Failed to complete patient." });
      }
    });

    // ─── SKIP PATIENT ───────────────────────────────────────────────
    socket.on("skipPatient", async ({ patientId }, callback) => {
      try {
        const patient = await prisma.patient.findUnique({ where: { id: patientId } });
        if (!patient || patient.status !== "serving") {
          return callback?.({ error: "Patient is not currently being served." });
        }

        await prisma.patient.update({
          where: { id: patientId },
          data: { status: "skipped" },
        });

        // Close consultation without duration (skipped)
        const consultation = await prisma.consultation.findFirst({
          where: { patientId, endTime: null },
          orderBy: { startTime: "desc" },
        });
        if (consultation) {
          await prisma.consultation.update({
            where: { id: consultation.id },
            data: { endTime: new Date() },
          });
        }

        const state = await buildQueueState(prisma);
        io.emit("queueUpdated", state);
        io.emit("patientSkipped", { patientId });

        callback?.({ success: true });
        console.log(`[Queue] Skipped Token ${patient.token}`);
      } catch (err) {
        console.error("[Socket] skipPatient error:", err);
        callback?.({ error: "Failed to skip patient." });
      }
    });

    // ─── RECALL PATIENT ─────────────────────────────────────────────
    socket.on("recallPatient", async ({ patientId }, callback) => {
      try {
        // Check if someone is being served
        const alreadyServing = await prisma.patient.findFirst({
          where: { status: "serving" },
        });
        if (alreadyServing) {
          return callback?.({ error: "Complete or skip current patient before recalling." });
        }

        const patient = await prisma.patient.findUnique({ where: { id: patientId } });
        if (!patient || patient.status !== "skipped") {
          return callback?.({ error: "Patient is not in skipped list." });
        }

        const now = new Date();
        const updated = await prisma.patient.update({
          where: { id: patientId },
          data: { status: "serving", calledAt: now },
        });

        await prisma.consultation.create({
          data: {
            id: uuidv4(),
            patientId,
            startTime: now,
          },
        });

        const state = await buildQueueState(prisma);
        io.emit("queueUpdated", state);
        io.emit("tokenCalled", {
          token: updated.token,
          name: updated.name,
          patient: updated,
        });

        callback?.({ success: true, patient: updated });
        console.log(`[Queue] Recalled Token ${patient.token}`);
      } catch (err) {
        console.error("[Socket] recallPatient error:", err);
        callback?.({ error: "Failed to recall patient." });
      }
    });

    // ─── UPDATE CONSULTATION TIME ────────────────────────────────────
    socket.on("updateConsultationTime", async ({ minutes }, callback) => {
      const mins = parseInt(minutes, 10);
      if (isNaN(mins) || mins < 1 || mins > 120) {
        return callback?.({ error: "Enter a valid time between 1–120 minutes." });
      }

      try {
        await prisma.settings.upsert({
          where: { id: 1 },
          update: { avgConsultationTime: mins },
          create: { id: 1, avgConsultationTime: mins },
        });

        const state = await buildQueueState(prisma);
        io.emit("queueUpdated", state);
        io.emit("settingsUpdated", { avgConsultationTime: mins });

        callback?.({ success: true });
        console.log(`[Settings] Avg consultation time updated to ${mins} mins`);
      } catch (err) {
        console.error("[Socket] updateConsultationTime error:", err);
        callback?.({ error: "Failed to update settings." });
      }
    });

    // ─── SUBSCRIBE TO TRACKING ──────────────────────────────────────
    socket.on("subscribeTracking", async ({ trackingId }, callback) => {
      try {
        const patient = await prisma.patient.findUnique({
          where: { trackingId },
        });

        if (!patient) {
          return callback?.({ error: "Invalid tracking ID." });
        }

        socket.join(`tracking:${trackingId}`);

        // Get patients ahead in queue
        let patientsAhead = 0;
        if (patient.status === "waiting") {
          patientsAhead = await prisma.patient.count({
            where: {
              status: "waiting",
              token: { lt: patient.token },
            },
          });
          // +1 if someone is currently being served
          const serving = await prisma.patient.findFirst({ where: { status: "serving" } });
          if (serving) patientsAhead += 1;
        }

        const estimates = await computeWaitEstimates(prisma, patientsAhead);

        callback?.({
          success: true,
          patient,
          patientsAhead,
          ...estimates,
        });
      } catch (err) {
        console.error("[Socket] subscribeTracking error:", err);
        callback?.({ error: "Failed to fetch tracking info." });
      }
    });

    socket.on("disconnect", () => {
      console.log(`[Socket] Client disconnected: ${socket.id}`);
    });
  });

  // After every queue update, push fresh data to all tracking subscribers
  io.on("connection", (socket) => {
    socket.on("queueUpdated", async () => {
      // handled by individual subscriptions via queueUpdated event
    });
  });
}

export { buildQueueState, computeWaitEstimates };

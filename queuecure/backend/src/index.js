import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import { PrismaClient } from "@prisma/client";
import { registerSocketHandlers } from "./socket/handlers.js";
import queueRouter from "./routes/queue.js";
import settingsRouter from "./routes/settings.js";
import trackingRouter from "./routes/tracking.js";

const app = express();
const httpServer = createServer(app);
export const prisma = new PrismaClient();

import dotenv from "dotenv";
dotenv.config();

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

export const io = new Server(httpServer, {
  cors: {
    origin: [FRONTEND_URL, "http://localhost:5173", "http://localhost:4173"],
    methods: ["GET", "POST"],
  },
});

app.use(
  cors({
    origin: [FRONTEND_URL, "http://localhost:5173", "http://localhost:4173"],
  })
);
app.use(express.json());

// Routes
app.use("/api/queue", queueRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/track", trackingRouter);

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Seed default settings if not exist
async function seedSettings() {
  const existing = await prisma.settings.findUnique({ where: { id: 1 } });
  if (!existing) {
    await prisma.settings.create({ data: { id: 1, avgConsultationTime: 10 } });
    console.log("Default settings seeded.");
  }
}

// Socket.IO event handlers
registerSocketHandlers(io, prisma);

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, async () => {
  await seedSettings();
  console.log(`🚀 QueueCure server running on port ${PORT}`);
});

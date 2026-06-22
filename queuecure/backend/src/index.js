import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";
import { registerSocketHandlers } from "./socket/handlers.js";
import queueRouter from "./routes/queue.js";
import settingsRouter from "./routes/settings.js";
import trackingRouter from "./routes/tracking.js";

import dotenv from "dotenv";
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
export const prisma = new PrismaClient();

// In production the frontend is served from the same origin,
// so we just need CORS for local dev.
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:4173",
];

export const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
  },
});

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

// API Routes
app.use("/api/queue", queueRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/track", trackingRouter);

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── Serve the Vite-built frontend in production ──
const publicDir = path.join(__dirname, "..", "public");
app.use(express.static(publicDir));

// For any route that doesn't match an API endpoint, serve index.html
// (supports client-side routing with React Router)
app.get("*", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
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

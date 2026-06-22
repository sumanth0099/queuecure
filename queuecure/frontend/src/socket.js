import { io } from "socket.io-client";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";

// Singleton socket instance shared across the app
const socket = io(BACKEND_URL, {
  autoConnect: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
});

socket.on("connect", () => {
  console.log("[Socket] Connected:", socket.id);
});

socket.on("disconnect", (reason) => {
  console.warn("[Socket] Disconnected:", reason);
});

socket.on("connect_error", (err) => {
  console.error("[Socket] Connection error:", err.message);
});

export default socket;

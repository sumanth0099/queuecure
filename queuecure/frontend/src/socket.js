import { io } from "socket.io-client";

// In production the backend is served from the same origin.
// In local dev, fallback to localhost:3001.
const BACKEND_URL =
  import.meta.env.DEV ? "http://localhost:3001" : window.location.origin;

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

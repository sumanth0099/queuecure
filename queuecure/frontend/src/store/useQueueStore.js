import { create } from "zustand";
import socket from "../socket.js";

const useQueueStore = create((set, get) => ({
  // ── State ──────────────────────────────────────────────────────
  queue: [],              // waiting patients
  currentPatient: null,   // patient being served
  skipped: [],            // skipped patients
  recentCompleted: [],    // last 10 completed

  waitingCount: 0,
  avgConsultationTime: 10,
  expectedWait: 0,
  liveEstimate: 0,
  liveAvg: 10,
  queueStatus: "on-schedule",

  connected: false,
  loading: true,

  toasts: [],

  // ── Actions ────────────────────────────────────────────────────
  setConnected: (val) => set({ connected: val }),

  updateFromState: (state) => {
    set({
      queue: state.queue ?? [],
      currentPatient: state.currentPatient ?? null,
      skipped: state.skipped ?? [],
      recentCompleted: state.recentCompleted ?? [],
      waitingCount: state.waitingCount ?? 0,
      avgConsultationTime: state.avgConsultationTime ?? 10,
      expectedWait: state.expectedWait ?? 0,
      liveEstimate: state.liveEstimate ?? 0,
      liveAvg: state.liveAvg ?? 10,
      queueStatus: state.queueStatus ?? "on-schedule",
      loading: false,
    });
  },

  addToast: (message, type = "success") => {
    const id = Date.now();
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 3500);
  },

  // ── Socket operations ──────────────────────────────────────────
  addPatient: (name) => {
    return new Promise((resolve) => {
      socket.emit("addPatient", { name }, (res) => {
        if (res?.error) {
          get().addToast(res.error, "error");
          resolve({ error: res.error });
        } else {
          get().addToast(`Token ${res.patient.token} assigned to ${res.patient.name}`);
          resolve({ patient: res.patient });
        }
      });
    });
  },

  callNext: () => {
    return new Promise((resolve) => {
      socket.emit("callNext", null, (res) => {
        if (res?.error) {
          get().addToast(res.error, "error");
          resolve({ error: res.error });
        } else {
          resolve({ success: true });
        }
      });
    });
  },

  completePatient: (patientId) => {
    return new Promise((resolve) => {
      socket.emit("completePatient", { patientId }, (res) => {
        if (res?.error) {
          get().addToast(res.error, "error");
          resolve({ error: res.error });
        } else {
          get().addToast("Consultation completed.");
          resolve({ success: true });
        }
      });
    });
  },

  skipPatient: (patientId) => {
    return new Promise((resolve) => {
      socket.emit("skipPatient", { patientId }, (res) => {
        if (res?.error) {
          get().addToast(res.error, "error");
          resolve({ error: res.error });
        } else {
          get().addToast("Patient skipped.");
          resolve({ success: true });
        }
      });
    });
  },

  recallPatient: (patientId) => {
    return new Promise((resolve) => {
      socket.emit("recallPatient", { patientId }, (res) => {
        if (res?.error) {
          get().addToast(res.error, "error");
          resolve({ error: res.error });
        } else {
          get().addToast("Patient recalled.");
          resolve({ success: true });
        }
      });
    });
  },

  updateConsultationTime: (minutes) => {
    return new Promise((resolve) => {
      socket.emit("updateConsultationTime", { minutes }, (res) => {
        if (res?.error) {
          get().addToast(res.error, "error");
          resolve({ error: res.error });
        } else {
          get().addToast(`Avg consultation time set to ${minutes} mins.`);
          resolve({ success: true });
        }
      });
    });
  },
}));

// ── Wire socket events to store ──────────────────────────────────
socket.on("connect", () => useQueueStore.getState().setConnected(true));
socket.on("disconnect", () => useQueueStore.getState().setConnected(false));

socket.on("queueState", (state) => {
  useQueueStore.getState().updateFromState(state);
});

socket.on("queueUpdated", (state) => {
  useQueueStore.getState().updateFromState(state);
});

export default useQueueStore;

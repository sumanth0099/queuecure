import React from "react";
import useQueueStore from "../store/useQueueStore.js";

export default function ToastContainer() {
  const toasts = useQueueStore((s) => s.toasts);

  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.type}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}

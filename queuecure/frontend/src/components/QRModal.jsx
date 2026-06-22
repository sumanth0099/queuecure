import React, { useEffect, useRef } from "react";
import QRCode from "qrcode";

export default function QRModal({ patient, onClose }) {
  const canvasRef = useRef(null);
  const trackingUrl = `${window.location.origin}/track/${patient.trackingId}`;

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, trackingUrl, {
        width: 200,
        color: { dark: "#2dd4bf", light: "#161b22" },
        margin: 2,
      });
    }
  }, [trackingUrl]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 200,
        backdropFilter: "blur(4px)",
      }}
      onClick={onClose}
    >
      <div
        className="card fade-in"
        style={{ maxWidth: 320, width: "100%", textAlign: "center" }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="card-title" style={{ marginBottom: 8 }}>Patient Token</p>
        <div
          className="mono"
          style={{
            fontSize: 48,
            fontWeight: 500,
            color: "var(--teal)",
            lineHeight: 1,
            marginBottom: 4,
          }}
        >
          {patient.token}
        </div>
        <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 20 }}>
          {patient.name}
        </p>

        <div
          style={{
            background: "var(--surface-2)",
            borderRadius: "var(--radius-md)",
            padding: 16,
            display: "inline-block",
            marginBottom: 16,
          }}
        >
          <canvas ref={canvasRef} />
        </div>

        <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>
          Scan to track queue position
        </p>
        <p
          className="mono"
          style={{
            fontSize: 10,
            color: "var(--text-dim)",
            wordBreak: "break-all",
            marginBottom: 20,
          }}
        >
          {trackingUrl}
        </p>

        <button className="btn btn-ghost" style={{ width: "100%" }} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

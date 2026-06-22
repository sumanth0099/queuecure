import React, { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import socket from "../socket.js";

import useQueueStore from "../store/useQueueStore.js";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";

function StatusBar({ status }) {
  const config = {
    ahead:        { icon: "🟢", msg: "Queue is moving faster than expected", cls: "#3fb950" },
    "on-schedule":{ icon: "🔵", msg: "Running on schedule",                  cls: "#58a6ff" },
    "slight-delay":{ icon:"🟡", msg: "Slight delays expected",               cls: "#d29922" },
    delayed:      { icon: "🔴", msg: "Clinic experiencing delays",           cls: "#f85149" },
  };
  const c = config[status] ?? config["on-schedule"];
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "12px 16px",
        background: `${c.cls}12`,
        border: `1px solid ${c.cls}30`,
        borderRadius: "var(--radius-md)",
        fontSize: 14,
        fontWeight: 500,
        color: c.cls,
      }}
    >
      <span style={{ fontSize: 18 }}>{c.icon}</span>
      {c.msg}
    </div>
  );
}

function StatCard({ label, value, unit, highlight }) {
  return (
    <div
      className="card"
      style={{
        textAlign: "center",
        padding: "20px 12px",
        borderColor: highlight ? "rgba(45,212,191,0.25)" : "var(--border)",
        background: highlight ? "rgba(45,212,191,0.04)" : "var(--surface)",
      }}
    >
      <div
        className="mono"
        style={{
          fontSize: 38,
          fontWeight: 500,
          color: highlight ? "var(--teal)" : "var(--text)",
          lineHeight: 1,
          marginBottom: 4,
        }}
      >
        {value}
        {unit && (
          <span style={{ fontSize: 16, color: "var(--text-muted)", fontWeight: 400, marginLeft: 4 }}>
            {unit}
          </span>
        )}
      </div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--text-muted)",
        }}
      >
        {label}
      </div>
    </div>
  );
}

export default function TrackingPage() {
  const { trackingId } = useParams();
  const connected = useQueueStore((s) => s.connected);

  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Fetch tracking data via REST on initial load (works even offline from socket)
  const fetchTracking = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/track/${trackingId}`);
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Patient not found.");
      }
      const data = await res.json();
      setState(data);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [trackingId]);

  useEffect(() => {
    fetchTracking();
  }, [fetchTracking]);

  // Subscribe via socket for live updates
  useEffect(() => {
    socket.emit("subscribeTracking", { trackingId }, (res) => {
      if (res?.error) {
        setError(res.error);
        setLoading(false);
      }
    });

    // When queue updates, re-fetch this patient's position
    function onQueueUpdated() {
      fetchTracking();
    }

    socket.on("queueUpdated", onQueueUpdated);
    socket.on("connect", () => {
      // Re-subscribe after reconnect
      socket.emit("subscribeTracking", { trackingId });
      fetchTracking();
    });

    return () => {
      socket.off("queueUpdated", onQueueUpdated);
    };
  }, [trackingId, fetchTracking]);

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "80vh",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            border: "3px solid var(--border)",
            borderTopColor: "var(--teal)",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <span style={{ color: "var(--text-muted)", fontSize: 14 }}>
          Finding your queue position…
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "80vh",
          gap: 12,
          textAlign: "center",
          padding: 24,
        }}
      >
        <div style={{ fontSize: 48 }}>🔍</div>
        <div style={{ fontWeight: 700, fontSize: 20 }}>Patient Not Found</div>
        <div style={{ color: "var(--text-muted)", fontSize: 14, maxWidth: 300 }}>
          {error}. Please check your QR code or ask the receptionist for help.
        </div>
      </div>
    );
  }

  if (!state) return null;

  const { patient, currentlyServing, patientsAhead, expectedWait, liveEstimate, queueStatus } = state;

  const isServing   = patient.status === "serving";
  const isCompleted = patient.status === "completed";
  const isSkipped   = patient.status === "skipped";
  const isWaiting   = patient.status === "waiting";

  return (
    <div
      style={{
        maxWidth: 480,
        margin: "0 auto",
        padding: "24px 16px",
        minHeight: "calc(100vh - 57px)",
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 24, textAlign: "center" }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--text-muted)",
            marginBottom: 8,
          }}
        >
          Your Queue Ticket
        </div>

        {/* Big token */}
        <div
          className="mono"
          style={{
            fontSize: "clamp(72px, 20vw, 100px)",
            fontWeight: 500,
            lineHeight: 1,
            color: isServing ? "var(--teal)" : isCompleted ? "var(--green)" : isSkipped ? "var(--yellow)" : "var(--text)",
            textShadow: isServing ? "0 0 60px rgba(45,212,191,0.35)" : "none",
            marginBottom: 4,
          }}
        >
          {patient.token}
        </div>
        <div style={{ fontSize: 20, fontWeight: 600, color: "var(--text)" }}>
          {patient.name}
        </div>

        {/* Status pill */}
        <div style={{ marginTop: 10 }}>
          {isServing && (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 20px",
                background: "var(--teal-glow)",
                border: "1px solid rgba(45,212,191,0.4)",
                borderRadius: 99,
                color: "var(--teal)",
                fontWeight: 700,
                fontSize: 14,
                letterSpacing: "0.04em",
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "var(--teal)",
                  animation: "pulse 1.2s ease infinite",
                  display: "inline-block",
                }}
              />
              IT'S YOUR TURN — Please go in!
            </div>
          )}
          {isCompleted && (
            <span
              style={{
                display: "inline-block",
                padding: "6px 18px",
                background: "rgba(63,185,80,0.12)",
                border: "1px solid rgba(63,185,80,0.3)",
                borderRadius: 99,
                color: "var(--green)",
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              ✓ Consultation Complete
            </span>
          )}
          {isSkipped && (
            <span
              style={{
                display: "inline-block",
                padding: "6px 18px",
                background: "rgba(210,153,34,0.12)",
                border: "1px solid rgba(210,153,34,0.3)",
                borderRadius: 99,
                color: "var(--yellow)",
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              ⏭ Skipped — Receptionist will recall you
            </span>
          )}
        </div>
      </div>

      {/* Live stats (only meaningful while waiting) */}
      {isWaiting && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
              marginBottom: 12,
            }}
          >
            <StatCard
              label="Now Serving"
              value={currentlyServing ? currentlyServing.token : "—"}
              highlight={false}
            />
            <StatCard
              label="Ahead of You"
              value={patientsAhead}
              highlight={patientsAhead === 0}
            />
            <StatCard
              label="Expected Wait"
              value={expectedWait}
              unit="min"
            />
            <StatCard
              label="Live Estimate"
              value={liveEstimate}
              unit="min"
              highlight={liveEstimate < expectedWait}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <StatusBar status={queueStatus} />
          </div>

          {patientsAhead === 0 && (
            <div
              style={{
                padding: "14px 16px",
                background: "var(--teal-muted)",
                border: "1px solid rgba(45,212,191,0.3)",
                borderRadius: "var(--radius-md)",
                color: "var(--teal)",
                fontWeight: 600,
                fontSize: 14,
                textAlign: "center",
                marginBottom: 12,
              }}
            >
              🎉 You're next! Please be ready.
            </div>
          )}
        </>
      )}

      {/* Currently serving info for context */}
      {isWaiting && currentlyServing && (
        <div
          className="card"
          style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 14 }}
        >
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "var(--text-muted)",
                marginBottom: 2,
              }}
            >
              Currently with doctor
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                className="mono"
                style={{ fontSize: 22, color: "var(--teal)", fontWeight: 500 }}
              >
                {currentlyServing.token}
              </span>
              <span style={{ fontSize: 14, color: "var(--text-muted)" }}>
                {currentlyServing.name}
              </span>
            </div>
          </div>
          <div
            style={{
              marginLeft: "auto",
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "var(--teal)",
              animation: "pulse 1.5s ease infinite",
            }}
          />
        </div>
      )}

      {/* Completed state info */}
      {isCompleted && patient.completedAt && (
        <div className="card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Consultation Finished</div>
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
            Completed at {new Date(patient.completedAt).toLocaleTimeString()}
          </div>
        </div>
      )}

      {/* Footer */}
      <div
        style={{
          marginTop: 24,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 12,
          color: "var(--text-dim)",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            color: connected ? "var(--green)" : "var(--red)",
            fontWeight: 600,
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: connected ? "var(--green)" : "var(--red)",
              animation: connected ? "pulse 1.5s ease infinite" : "none",
            }}
          />
          {connected ? "Live updates" : "Offline"}
        </span>
        {lastUpdated && (
          <span>
            Updated {lastUpdated.toLocaleTimeString()}
          </span>
        )}
      </div>
    </div>
  );
}

import React, { useEffect, useRef, useState } from "react";
import useQueueStore from "../store/useQueueStore.js";
import socket from "../socket.js";

function QueueHealthBadge({ status }) {
  const config = {
    ahead:       { icon: "🟢", label: "Running Ahead",      cls: "health-ahead" },
    "on-schedule": { icon: "🔵", label: "On Schedule",      cls: "health-on-time" },
    "slight-delay": { icon: "🟡", label: "Slight Delays",  cls: "health-slight" },
    delayed:     { icon: "🔴", label: "Experiencing Delays", cls: "health-delayed" },
  };

  const c = config[status] ?? config["on-schedule"];
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 28, marginBottom: 4 }}>{c.icon}</div>
      <div className={`${c.cls}`} style={{ fontSize: 14, fontWeight: 600 }}>
        {c.label}
      </div>
    </div>
  );
}

function StatBox({ label, value, unit, mono }) {
  return (
    <div
      className="card"
      style={{ textAlign: "center", padding: "20px 16px" }}
    >
      <div
        className={mono ? "mono" : ""}
        style={{ fontSize: 40, fontWeight: mono ? 500 : 700, color: "var(--text)", lineHeight: 1, marginBottom: 6 }}
      >
        {value}
        {unit && <span style={{ fontSize: 18, color: "var(--text-muted)", fontWeight: 400, marginLeft: 4 }}>{unit}</span>}
      </div>
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)" }}>
        {label}
      </div>
    </div>
  );
}

export default function WaitingRoomPage() {
  const {
    currentPatient,
    waitingCount,
    queueStatus,
    expectedWait,
    liveEstimate,
    avgConsultationTime,
    loading,
    queue,
  } = useQueueStore();

  const [tokenFlash, setTokenFlash] = useState(false);
  const prevTokenRef = useRef(null);

  // Voice announcement + flash on token change
  useEffect(() => {
    function onTokenCalled({ token, name }) {
      // Flash animation
      setTokenFlash(true);
      setTimeout(() => setTokenFlash(false), 700);

      // Voice announcement
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(
          `Token ${token}, ${name}, please proceed to the consultation room.`
        );
        utterance.rate = 0.9;
        utterance.pitch = 1;
        utterance.volume = 1;
        window.speechSynthesis.speak(utterance);
      }
    }

    socket.on("tokenCalled", onTokenCalled);
    return () => socket.off("tokenCalled", onTokenCalled);
  }, []);

  // Flash if current patient changes after initial load
  useEffect(() => {
    if (!loading && currentPatient) {
      if (prevTokenRef.current !== null && prevTokenRef.current !== currentPatient.token) {
        setTokenFlash(true);
        setTimeout(() => setTokenFlash(false), 700);
      }
      prevTokenRef.current = currentPatient.token;
    }
  }, [currentPatient?.token, loading]);

  if (loading) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: "80vh", color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 14,
      }}>
        Connecting…
      </div>
    );
  }

  return (
    <div className="waiting-room-grid">
      {/* ── Main: Current token ── */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          background: "var(--surface)",
          border: currentPatient ? "1px solid rgba(45,212,191,0.2)" : "1px solid var(--border)",
          borderRadius: "var(--radius-xl)",
          padding: "48px 32px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Ambient glow */}
        {currentPatient && (
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%,-50%)",
              width: 400,
              height: 400,
              background: "radial-gradient(circle, rgba(45,212,191,0.06) 0%, transparent 70%)",
              pointerEvents: "none",
            }}
          />
        )}

        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            color: "var(--text-muted)",
            marginBottom: 16,
          }}
        >
          Now Serving
        </div>

        {currentPatient ? (
          <>
            <div className={`token-giant ${tokenFlash ? "token-flash" : ""}`}>
              {currentPatient.token}
            </div>
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "clamp(22px, 4vw, 36px)",
                fontWeight: 700,
                color: "var(--text)",
                marginTop: 16,
                marginBottom: 8,
              }}
            >
              {currentPatient.name}
            </div>
            <div style={{ color: "var(--text-muted)", fontSize: 14 }}>
              Please proceed to the consultation room
            </div>
          </>
        ) : (
          <>
            <div
              className="mono"
              style={{
                fontSize: "clamp(60px, 14vw, 120px)",
                color: "var(--text-dim)",
                lineHeight: 1,
                fontWeight: 500,
              }}
            >
              —
            </div>
            <div style={{ color: "var(--text-muted)", fontSize: 18, marginTop: 16 }}>
              Clinic not started yet
            </div>
          </>
        )}

        {/* live indicator */}
        <div style={{ position: "absolute", top: 20, right: 20 }}>
          <span className="live-dot">Live</span>
        </div>
      </div>

      {/* ── Right sidebar ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <StatBox label="Patients Waiting" value={waitingCount} mono />

        <StatBox
          label="Expected Wait"
          value={expectedWait}
          unit="min"
          mono
        />

        <StatBox
          label="Live Estimate"
          value={liveEstimate}
          unit="min"
          mono
        />

        <div className="card" style={{ textAlign: "center" }}>
          <p className="card-title" style={{ marginBottom: 12 }}>Queue Health</p>
          <QueueHealthBadge status={queueStatus} />
        </div>

        <div className="card">
          <p className="card-title" style={{ marginBottom: 12 }}>Up Next</p>
          {queue.length === 0 ? (
            <div style={{ color: "var(--text-dim)", fontSize: 13, fontStyle: "italic" }}>
              Queue is empty
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {queue.slice(0, 5).map((p, i) => (
                <div
                  key={p.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "8px 10px",
                    background: i === 0 ? "var(--surface-2)" : "transparent",
                    borderRadius: "var(--radius-sm)",
                  }}
                >
                  <span
                    className="mono"
                    style={{ fontSize: 20, color: i === 0 ? "var(--teal)" : "var(--text-muted)", fontWeight: 500, minWidth: 36 }}
                  >
                    {p.token}
                  </span>
                  <span style={{ fontSize: 14, color: i === 0 ? "var(--text)" : "var(--text-muted)" }}>
                    {p.name}
                  </span>
                </div>
              ))}
              {queue.length > 5 && (
                <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 4 }}>
                  +{queue.length - 5} more
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom bar: avg consultation time ── */}
      <div
        style={{
          gridColumn: "1 / -1",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          padding: "12px 20px",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          fontSize: 13,
          color: "var(--text-muted)",
        }}
      >
        Average consultation time:
        <span className="mono" style={{ color: "var(--teal)", fontWeight: 500 }}>
          {avgConsultationTime} min
        </span>
        &nbsp;·&nbsp;
        Live estimates update automatically as each patient is seen
      </div>
    </div>
  );
}

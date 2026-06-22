import React, { useState, useRef } from "react";
import useQueueStore from "../store/useQueueStore.js";
import QRModal from "../components/QRModal.jsx";

function StatusPill({ status }) {
  return (
    <span className={`status-pill status-${status}`}>
      {status === "waiting" && "⏳ Waiting"}
      {status === "serving" && "🟢 Serving"}
      {status === "completed" && "✓ Done"}
      {status === "skipped" && "⏭ Skipped"}
    </span>
  );
}

export default function ReceptionistPage() {
  const {
    queue,
    currentPatient,
    skipped,
    waitingCount,
    avgConsultationTime,
    callNext,
    completePatient,
    skipPatient,
    recallPatient,
    addPatient,
    updateConsultationTime,
    loading,
  } = useQueueStore();

  const [name, setName] = useState("");
  const [timeInput, setTimeInput] = useState("");
  const [qrPatient, setQrPatient] = useState(null);
  const [addLoading, setAddLoading] = useState(false);
  const [callLoading, setCallLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const nameRef = useRef(null);

  async function handleAddPatient(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setAddLoading(true);
    const res = await addPatient(name.trim());
    setAddLoading(false);
    if (!res.error) {
      setQrPatient(res.patient);
      setName("");
      nameRef.current?.focus();
    }
  }

  async function handleCallNext() {
    setCallLoading(true);
    await callNext();
    setCallLoading(false);
  }

  async function handleComplete() {
    if (!currentPatient) return;
    setActionLoading(true);
    await completePatient(currentPatient.id);
    setActionLoading(false);
  }

  async function handleSkip() {
    if (!currentPatient) return;
    setActionLoading(true);
    await skipPatient(currentPatient.id);
    setActionLoading(false);
  }

  async function handleUpdateTime(e) {
    e.preventDefault();
    if (!timeInput) return;
    await updateConsultationTime(parseInt(timeInput, 10));
    setTimeInput("");
  }

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "60vh",
          color: "var(--text-muted)",
          fontFamily: "var(--font-mono)",
          fontSize: 14,
        }}
      >
        Connecting to queue...
      </div>
    );
  }

  return (
    <div className="receptionist-grid">
      {/* ── Left column ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Add Patient */}
        <div className="card">
          <p className="card-title">Register Patient</p>
          <form onSubmit={handleAddPatient} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input
              ref={nameRef}
              className="input"
              placeholder="Patient name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              autoComplete="off"
            />
            <button
              className="btn btn-primary"
              type="submit"
              disabled={addLoading || !name.trim()}
            >
              {addLoading ? "Adding…" : "Add Patient →"}
            </button>
          </form>
        </div>

        {/* Current Patient */}
        <div
          className="card"
          style={{
            borderColor: currentPatient ? "rgba(45,212,191,0.3)" : "var(--border)",
            background: currentPatient ? "rgba(45,212,191,0.04)" : "var(--surface)",
          }}
        >
          <p className="card-title">Now Serving</p>

          {currentPatient ? (
            <>
              <div style={{ marginBottom: 16 }}>
                <div
                  className="mono"
                  style={{ fontSize: 56, color: "var(--teal)", lineHeight: 1, fontWeight: 500 }}
                >
                  {currentPatient.token}
                </div>
                <div style={{ fontSize: 20, fontWeight: 600, color: "var(--text)", marginTop: 4 }}>
                  {currentPatient.name}
                </div>
                {currentPatient.calledAt && (
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4, fontFamily: "var(--font-mono)" }}>
                    Called at {new Date(currentPatient.calledAt).toLocaleTimeString()}
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  className="btn btn-success"
                  onClick={handleComplete}
                  disabled={actionLoading}
                  style={{ flex: 1 }}
                >
                  ✓ Complete
                </button>
                <button
                  className="btn btn-warning"
                  onClick={handleSkip}
                  disabled={actionLoading}
                  style={{ flex: 1 }}
                >
                  ⏭ Skip
                </button>
              </div>
            </>
          ) : (
            <>
              <div style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 16, minHeight: 80, display: "flex", alignItems: "center" }}>
                {waitingCount > 0
                  ? `${waitingCount} patient${waitingCount !== 1 ? "s" : ""} waiting — call next to begin.`
                  : "No patients in queue."}
              </div>
              <button
                className="btn btn-primary"
                onClick={handleCallNext}
                disabled={callLoading || waitingCount === 0}
                style={{ width: "100%" }}
              >
                {callLoading ? "Calling…" : "Call Next Patient →"}
              </button>
            </>
          )}
        </div>

        {/* Avg Consultation Time */}
        <div className="card">
          <p className="card-title">Avg Consultation Time</p>
          <div
            className="mono"
            style={{ fontSize: 32, color: "var(--text)", marginBottom: 12, fontWeight: 500 }}
          >
            {avgConsultationTime}
            <span style={{ fontSize: 14, color: "var(--text-muted)", fontFamily: "var(--font-body)", fontWeight: 400, marginLeft: 6 }}>
              min
            </span>
          </div>
          <form onSubmit={handleUpdateTime} style={{ display: "flex", gap: 8 }}>
            <input
              className="input"
              type="number"
              min="1"
              max="120"
              placeholder="New time (mins)"
              value={timeInput}
              onChange={(e) => setTimeInput(e.target.value)}
              style={{ flex: 1 }}
            />
            <button
              className="btn btn-ghost"
              type="submit"
              disabled={!timeInput}
            >
              Set
            </button>
          </form>
        </div>

        {/* Skipped patients */}
        {skipped.length > 0 && (
          <div className="card">
            <p className="card-title">Skipped — Recall</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {skipped.map((p) => (
                <div
                  key={p.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 12px",
                    background: "var(--surface-2)",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <div>
                    <span className="mono" style={{ fontSize: 18, color: "var(--yellow)", marginRight: 10 }}>
                      {p.token}
                    </span>
                    <span style={{ fontSize: 14 }}>{p.name}</span>
                  </div>
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={() => recallPatient(p.id)}
                    disabled={!!currentPatient}
                  >
                    Recall
                  </button>
                </div>
              ))}
            </div>
            {currentPatient && (
              <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
                Complete or skip current patient to recall.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Right column: Queue list ── */}
      <div className="card" style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <p className="card-title" style={{ marginBottom: 0 }}>Queue</p>
          <div style={{ display: "flex", align: "center", gap: 12 }}>
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
              <span className="mono" style={{ color: "var(--text)", fontWeight: 500 }}>{waitingCount}</span> waiting
            </span>
            <span className="live-dot">Live</span>
          </div>
        </div>

        {/* Call Next button when someone is being served */}
        {currentPatient && (
          <div style={{ marginBottom: 12 }}>
            <button
              className="btn btn-primary"
              onClick={handleCallNext}
              disabled={callLoading || waitingCount === 0}
            >
              {callLoading ? "Calling…" : "Call Next →"}
            </button>
          </div>
        )}

        {queue.length === 0 && !currentPatient ? (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-dim)",
              fontSize: 14,
              fontStyle: "italic",
            }}
          >
            No patients waiting. Add the first patient to start.
          </div>
        ) : (
          <div style={{ overflowY: "auto", flex: 1 }}>
            {/* Currently serving shown at top */}
            {currentPatient && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "12px 14px",
                  marginBottom: 6,
                  background: "var(--teal-muted)",
                  border: "1px solid rgba(45,212,191,0.25)",
                  borderRadius: "var(--radius-md)",
                }}
              >
                <span
                  className="mono"
                  style={{ fontSize: 28, color: "var(--teal)", minWidth: 52, fontWeight: 500 }}
                >
                  {currentPatient.token}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{currentPatient.name}</div>
                </div>
                <StatusPill status="serving" />
              </div>
            )}

            {/* Waiting queue */}
            {queue.map((patient, idx) => (
              <div
                key={patient.id}
                className="fade-in"
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "10px 14px",
                  marginBottom: 4,
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)",
                  transition: "background 0.2s",
                }}
              >
                <span
                  className="mono"
                  style={{ fontSize: 24, color: "var(--text-muted)", minWidth: 52, fontWeight: 500 }}
                >
                  {patient.token}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{patient.name}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)", marginTop: 1 }}>
                    pos {idx + 1} · est {(idx + 1 + (currentPatient ? 1 : 0)) * avgConsultationTime} min wait
                  </div>
                </div>
                <StatusPill status="waiting" />
                <button
                  className="btn btn-sm btn-ghost"
                  style={{ marginLeft: 10 }}
                  onClick={() => setQrPatient(patient)}
                  title="Show QR"
                >
                  QR
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* QR Modal */}
      {qrPatient && <QRModal patient={qrPatient} onClose={() => setQrPatient(null)} />}
    </div>
  );
}

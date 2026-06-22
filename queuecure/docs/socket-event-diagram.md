# QueueCure — Socket Event Diagram

## Overview

QueueCure uses **Socket.IO** for bidirectional, real-time communication between three clients (Receptionist, Waiting Room, Patient Phone) and one Express server. All queue logic executes server-side; clients only send intent and receive updated state.

---

## Connection Flow

```
Receptionist       Waiting Room        Patient Phone         Server
     │                   │                   │                  │
     │── connect() ──────────────────────────────────────────►  │
     │                   │                   │        ◄── queueState (full state) ──│
     │                   │── connect() ──────────────────────►  │
     │                   │                   │        ◄── queueState ───────────── │
     │                   │                   │── connect() ──►  │
     │                   │                   │        ◄── queueState ───────────── │
```

On every new connection, the server immediately emits the full current queue state so the client hydrates without a separate REST call.

---

## Event: addPatient

```
Receptionist                              Server                    DB
     │                                       │                       │
     │── addPatient({ name }) ─────────────► │                       │
     │                                       │── INSERT patient ────►│
     │                                       │◄─ patient row ────────│
     │◄── callback({ patient, token }) ───── │                       │
     │                                       │                       │
     │         ┌──── io.emit("queueUpdated", fullState) ────────────────────┐
     │◄────────┘                             │              ◄────────────────┘ Waiting Room
     │                                       │              ◄────────────────┘ Patient Phones
```

Token number is computed server-side: `MAX(token) + 1` to prevent race conditions across multiple receptionists.

---

## Event: callNext

```
Receptionist                              Server                    DB
     │                                       │                       │
     │── callNext() ──────────────────────►  │                       │
     │                    [lockSet check: prevent concurrent calls]   │
     │                                       │── UPDATE status='serving' ──►│
     │                                       │── INSERT Consultation row ──►│
     │◄── callback({ success }) ─────────── │                       │
     │                                       │                       │
     │         ┌──── io.emit("queueUpdated", fullState) ────────────────────┐
     │◄────────┘                             │              ◄────────────────┘ Waiting Room
     │                                       │              ◄────────────────┘ Patient Phones
     │         ┌──── io.emit("tokenCalled", { token, name }) ──────────────┐
     │◄────────┘                             │              ◄────────────────┘ Waiting Room
     │                                       │                        (triggers voice announcement)
```

---

## Event: completePatient

```
Receptionist                              Server                    DB
     │                                       │                       │
     │── completePatient({ patientId }) ───► │                       │
     │                                       │── UPDATE status='completed' ►│
     │                                       │── UPDATE Consultation.duration ►│
     │◄── callback({ success }) ─────────── │    (now used in moving average)│
     │                                       │                       │
     │         ┌──── io.emit("queueUpdated", fullState) ────────────────────┐
     │◄────────┘                             │              ◄────────────────┘ All clients
     │         ┌──── io.emit("patientCompleted", { patientId, duration }) ──┐
     │◄────────┘                             │              ◄────────────────┘ All clients
```

Duration is computed as `completedAt - calledAt` in minutes. This feeds the moving average algorithm.

---

## Event: skipPatient

```
Receptionist                              Server                    DB
     │                                       │                       │
     │── skipPatient({ patientId }) ────────►│                       │
     │                                       │── UPDATE status='skipped' ──►│
     │                                       │── UPDATE Consultation (endTime, no duration) │
     │◄── callback({ success }) ─────────── │                       │
     │         ┌──── io.emit("queueUpdated") / io.emit("patientSkipped") ──┐
     │◄────────┘                             │              ◄────────────────┘ All clients
```

---

## Event: recallPatient

```
Receptionist                              Server                    DB
     │                                       │                       │
     │── recallPatient({ patientId }) ──────►│                       │
     │                    [check: nobody currently serving]           │
     │                                       │── UPDATE status='serving' ──►│
     │                                       │── INSERT new Consultation ──►│
     │◄── callback({ success }) ─────────── │                       │
     │         ┌──── io.emit("queueUpdated") + io.emit("tokenCalled") ──────┐
     │◄────────┘                             │              ◄────────────────┘ All clients
     │                                       │                  (voice announcement fires again)
```

---

## Event: updateConsultationTime

```
Receptionist                              Server                    DB
     │                                       │                       │
     │── updateConsultationTime({ minutes })►│                       │
     │                                       │── UPSERT Settings.avgConsultationTime ──►│
     │◄── callback({ success }) ─────────── │                       │
     │         ┌──── io.emit("queueUpdated") + io.emit("settingsUpdated") ──┐
     │◄────────┘                             │              ◄────────────────┘ All clients
     │                                       │          (all wait time displays recalculate)
```

---

## Event: subscribeTracking (Patient Phone)

```
Patient Phone                             Server                    DB
     │                                       │                       │
     │── subscribeTracking({ trackingId }) ► │                       │
     │                                       │── SELECT patient ────►│
     │                                       │── COUNT patientsAhead►│
     │                                       │── computeWaitEstimates│
     │◄── callback({ patient, patientsAhead, estimates }) ────────── │
     │                                       │                       │
     │  [joins room: `tracking:${trackingId}`]                       │
     │                                       │                       │
     │  [on any queueUpdated event, patient re-fetches via REST]     │
```

---

## Full Broadcast Map

```
Event emitted by server       Who receives it
─────────────────────────     ────────────────────────────────────────
queueState                    Only the connecting client (socket.emit)
queueUpdated                  ALL connected clients (io.emit)
tokenCalled                   ALL connected clients (io.emit)
patientCompleted              ALL connected clients (io.emit)
patientSkipped                ALL connected clients (io.emit)
settingsUpdated               ALL connected clients (io.emit)
```

---

## State Object Shape (queueState / queueUpdated)

```json
{
  "queue": [
    { "id": "uuid", "token": 24, "name": "Priya", "status": "waiting", ... }
  ],
  "currentPatient": {
    "id": "uuid", "token": 23, "name": "Ravi", "status": "serving", "calledAt": "..."
  },
  "skipped": [...],
  "recentCompleted": [...],
  "waitingCount": 3,
  "avgConsultationTime": 10,
  "expectedWait": 30,
  "liveEstimate": 24,
  "liveAvg": 8,
  "queueStatus": "ahead"
}
```

---

## Concurrency Guard (Double-Click / Multi-Receptionist)

```
Receptionist A              Server (lockSet)           Receptionist B
     │                            │                          │
     │── callNext() ─────────────►│ lockSet.add("callNext")  │
     │                            │                          │── callNext() ──►│
     │                            │         [lockSet.has("callNext") → true]   │
     │                            │◄── callback({ error: "Operation in progress" }) ──┘
     │◄── callback({ success }) ──│ lockSet.delete("callNext")
```

Token generation uses `MAX(token) + 1` within a single Prisma transaction, ensuring tokens are always unique even with concurrent receptionist sessions.

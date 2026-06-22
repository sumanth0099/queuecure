# QueueCure — Thought Process Sheet

**Hackathon:** Queue Cure '26 · Wooble  
**Builder:** Sumanth  
**Stack:** React · Vite · Zustand · Socket.IO · Express · PostgreSQL · Prisma

---

## 1. Problem Framing

The brief says patients don't know when they'll be called. I read that as three distinct pain points:

1. **Uncertainty anxiety** — not knowing is worse than knowing it'll be long
2. **Physical crowding** — everyone sits in one room because they're afraid of missing their name
3. **Receptionist overload** — managing a manual list while also answering "how long?" questions constantly

A good solution eliminates all three simultaneously, not just one. That meant three screens sharing a single real-time data source, not three separate apps.

---

## 2. Architecture Decision: Why WebSockets over Polling

My first instinct was polling (`setInterval` + REST fetch every 2 seconds). It's simpler. But I rejected it for two reasons:

- **Latency compounds** — in a busy clinic, 2 seconds per update means the waiting room display can be 4-6 tokens behind reality
- **Judge criterion #1 is "live queue updates without refresh"** — polling technically satisfies this but the spirit is real-time push

Socket.IO was the right call. One server event — `io.emit("queueUpdated", state)` — instantly updates every connected screen with zero polling overhead.

**Tradeoff accepted:** WebSocket connections are stateful and harder to scale horizontally. For a single-clinic deployment (the target), this is a non-issue. If scaling to multiple clinics, I'd namespace sockets per clinic (`io.of("/clinic-123")`).

---

## 3. Backend as Single Source of Truth

Early in design I considered letting the frontend compute token numbers (just `lastToken + 1` in React state). I rejected this because:

- Two receptionists on different browsers would produce duplicate tokens
- Frontend state resets on refresh, breaking the sequence
- Race conditions: two rapid "Add Patient" clicks could fire simultaneously

**Solution:** Token generation happens exclusively in the backend:
```js
const latest = await prisma.patient.aggregate({ _max: { token: true } });
const token = (latest._max.token ?? 0) + 1;
```

This runs as a sequential DB operation. Even if two sockets emit `addPatient` simultaneously, Prisma's query queue serializes them.

---

## 4. Wait Time Algorithm Design

The hardest product question was: **how do you show an honest wait time estimate?**

A hardcoded "10 minutes per patient" would be wrong 80% of the time — some consultations take 3 minutes, some take 25.

**Two-layer approach:**

**Layer 1 — Expected Wait (static):** Uses the receptionist's configured average. This is what they *expect* the day to look like. Starting baseline.

**Layer 2 — Live Estimate (dynamic):** Uses a moving average of the last 5 actual consultation durations stored in the `Consultation` table.

```
liveAvg = mean(last 5 durations)
liveEstimate = patientsAhead × liveAvg
```

**Why 5?** Enough to smooth out one unusually long consultation without being so large that it lags behind the current pace. A 10-sample window would mean a busy morning still influencing afternoon estimates.

**Queue Health** is derived from the gap between these two:
```
diff = (liveEstimate - expectedWait) / expectedWait
```
This gives a percentage deviation, making it independent of the absolute wait time. Whether the clinic runs 5-minute or 30-minute consultations, the health status self-calibrates.

---

## 5. Concurrency Edge Cases

### Double-click "Call Next"
Two rapid clicks would try to set two patients to `serving`. I handle this with a server-side `Set` that acts as a mutex:

```js
if (lockSet.has("callNext")) return callback({ error: "Operation in progress" });
lockSet.add("callNext");
// ... DB operations ...
lockSet.delete("callNext"); // in finally block
```

The frontend also disables the button while the request is in flight (`setCallLoading(true)`), so this is defense-in-depth — frontend prevents accidental double-clicks, backend prevents malicious or concurrent ones.

### Multiple Receptionists
If two receptionists call next simultaneously:
- The lock ensures only one proceeds
- The second gets an error callback and the button re-enables
- No patient ends up in an inconsistent state

### Page Refresh
On every socket `connect` event, the server emits the full `queueState`. This means refreshing any screen re-hydrates instantly — no stale state, no "loading" gap beyond the connection handshake.

### Skip → Recall
When a patient is skipped, their record stays in the database with `status = 'skipped'`. The receptionist sees a Recall button. Clicking it:
1. Checks no one is currently being served
2. Sets the patient back to `serving` with a fresh `calledAt`
3. Creates a new Consultation record

The patient's original token is preserved throughout. No renumbering, no confusion.

---

## 6. Patient Tracking Page Design

The tracking URL (`/track/:trackingId`) uses a UUID that's generated server-side when the patient is registered and embedded in the QR code. Key decisions:

**Why UUID and not token number in the URL?**  
Token numbers are guessable (if you're token 25, just type /track/24 to see another patient's status). UUIDs are not enumerable — only the patient with the QR code can access their page.

**Live updates on the tracking page:**  
The page subscribes via socket (`subscribeTracking`) but the actual position computation re-queries the database on every `queueUpdated` event. This is intentional — computing position purely from socket deltas would require complex state diffing; re-querying is 1 SQL COUNT that runs in <5ms and is always correct.

---

## 7. Voice Announcements

Using the browser's built-in `SpeechSynthesis` API was a deliberate choice over an external TTS service. Reasons:

- Zero cost, zero latency, no API key to manage
- Works offline (important for clinic network conditions in India)
- Sufficient quality for "Token 23, Ravi Kumar, please proceed to the consultation room"

The announcement fires on the `tokenCalled` socket event, not on `queueUpdated` — this prevents false announcements during settings changes or other updates.

One limitation: `speechSynthesis` requires a user gesture on some browsers before it will speak. The Waiting Room display should be opened and clicked once to "unlock" audio, then it will auto-announce indefinitely.

---

## 8. What I Would Build Next (Given More Time)

| Feature | Why |
|---------|-----|
| Multi-clinic namespacing | Each clinic gets its own Socket.IO namespace and DB tenant |
| SMS fallback | Send patient an SMS with tracking link when QR isn't scanned |
| Doctor's view | Separate read-only screen showing queue from the doctor's side |
| Daily analytics | Avg wait per day, busiest hours, doctor efficiency metrics |
| Appointment slots | Allow pre-booking so patients don't arrive all at once |
| PWA (offline mode) | Service worker to show last-known position even without network |

---

## 9. Judging Criteria Self-Assessment

| Criterion | Weight | What I did |
|-----------|--------|------------|
| Live queue updates across both screens without refresh | 40% | Socket.IO push to all clients on every state change; full state hydration on reconnect |
| Wait time computed from real data — not hardcoded | 25% | Moving average of last 5 actual consultation durations; falls back to configured avg only when no history exists |
| Receptionist screen is fast and mistake-proof | 20% | Server-side validation on all operations; button disabled during in-flight requests; lock prevents double-call; clear error toasts |
| Thought process addresses concurrency and edge cases | 15% | This document + code comments covering double-click, multi-receptionist, refresh, skip/recall, and disconnect scenarios |

---

## 10. The One Insight That Shaped Everything

> A queue is not a list. It's a promise.

When a patient gets token 25, they're being promised that approximately `(25 - currentToken) × avgTime` minutes from now, it will be their turn. If that promise is broken — or worse, invisible — trust collapses.

QueueCure doesn't just display the queue. It makes the promise visible, tracks whether the clinic is keeping it, and updates patients in real time when circumstances change. That's the difference between a CRUD app and a product.

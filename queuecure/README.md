# QueueCure — Real-Time Clinic Queue Management

> Built for Queue Cure '26 · Wooble Hackathon

76% of India's 1.5 million clinics still run on paper token slips and shouting. Patients wait 2–3 hours with zero visibility. QueueCure fixes that with a real-time, live-sync queue management system that works across devices the moment "Call Next" is clicked.

---

## Live Demo

| Screen | URL |
|--------|-----|
| Receptionist Dashboard | `https://queuecure.vercel.app/` |
| Waiting Room Display   | `https://queuecure.vercel.app/display` |
| Patient Tracking       | `https://queuecure.vercel.app/track/:trackingId` |

---

## What It Does

### Screen 1 — Receptionist Dashboard
- Add patients by name → auto-assigned incrementing token
- Instant QR code generated per patient (links to their tracking page)
- Call Next / Complete / Skip buttons to manage flow
- Recall skipped patients without losing their token
- Set average consultation time (used in wait predictions)
- Full live queue list with per-patient estimated wait

### Screen 2 — Waiting Room Display
- Giant token number display (designed for wall-mounted screens)
- Voice announcement via browser `speechSynthesis` when token changes
- Live stats: patients waiting, expected wait, live estimate
- Queue health badge (🟢 Ahead / 🔵 On Schedule / 🟡 Slight Delay / 🔴 Delayed)
- All updates push instantly via Socket.IO — zero refresh needed

### Screen 3 — Patient Tracking Page (`/track/:trackingId`)
- Accessed by scanning QR code on their own phone
- Shows: their token, now serving, patients ahead, expected wait, live estimate
- Status-aware: "You're next!", "It's your turn!", "Consultation complete"
- Live socket subscription — updates automatically as queue moves

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite |
| State | Zustand |
| Real-time | Socket.IO Client |
| Backend | Node.js + Express |
| Real-time | Socket.IO Server |
| Database | PostgreSQL via Prisma ORM |
| QR Codes | `qrcode` npm package |
| Voice | Web Speech API (`speechSynthesis`) |
| Deploy (FE) | Vercel |
| Deploy (BE) | Railway |
| Database host | Neon (serverless Postgres) |

---

## Architecture

```
Receptionist (React)          Patient Phone (React)
       │                              │
  Zustand store                  TrackingPage
       │                              │
  Socket.IO Client ◄────────────────►│
       │                         Socket.IO Client
       │                              │
       └──────────────┬───────────────┘
                      ▼
            Express + Socket.IO Server
            (single source of truth)
                      │
                      ▼
                  PostgreSQL
                (via Prisma ORM)
```

**Key principle:** The backend is the single source of truth. Token generation, status transitions, and wait calculations all happen server-side. The frontend only emits intent ("call next") and renders what the server sends back.

---

## Wait Time Algorithm

### Expected Wait (static baseline)
Uses the receptionist's configured average consultation time:
```
expectedWait = patientsAhead × avgConsultationTime
```

### Live Estimate (dynamic, data-driven)
Uses a moving average of the last 5 actual completed consultations:
```
liveAvg     = average(last 5 consultation durations)
liveEstimate = patientsAhead × liveAvg
```

### Queue Health Status
```
diff = (liveEstimate - expectedWait) / expectedWait

diff < -20%      → 🟢 Running Ahead
-20% to +10%     → 🔵 On Schedule
+10% to +30%     → 🟡 Slight Delays
> +30%           → 🔴 Significant Delays
```

The live estimate self-corrects as consultations finish — if the doctor is running fast, wait times drop in real time for all patients.

---

## Database Schema

```sql
Patient
  id          UUID  (PK)
  token       INT   (auto-incrementing, server-controlled)
  name        TEXT
  trackingId  UUID  (unique, for QR URL)
  status      TEXT  -- waiting | serving | completed | skipped
  createdAt   TIMESTAMP
  calledAt    TIMESTAMP
  completedAt TIMESTAMP

Settings
  id                  INT  (PK = 1, singleton row)
  avgConsultationTime INT  (minutes, default 10)

Consultation
  id        UUID
  patientId UUID (FK → Patient)
  startTime TIMESTAMP
  endTime   TIMESTAMP
  duration  INT  (minutes, computed on complete)
```

---

## Socket Events

### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `addPatient` | `{ name }` | Register a new patient |
| `callNext` | — | Call the next waiting patient |
| `completePatient` | `{ patientId }` | Mark consultation done |
| `skipPatient` | `{ patientId }` | Skip unavailable patient |
| `recallPatient` | `{ patientId }` | Recall a skipped patient |
| `updateConsultationTime` | `{ minutes }` | Update avg time setting |
| `subscribeTracking` | `{ trackingId }` | Subscribe to patient tracking |

### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `queueState` | Full state object | Sent on initial connection |
| `queueUpdated` | Full state object | Broadcast after any change |
| `tokenCalled` | `{ token, name, patient }` | Triggers voice announcement |
| `patientCompleted` | `{ patientId, duration }` | Consultation finished |
| `patientSkipped` | `{ patientId }` | Patient was skipped |
| `settingsUpdated` | `{ avgConsultationTime }` | Settings changed |

---

## Local Development Setup

### Prerequisites
- Node.js 18+
- PostgreSQL database (local or [Neon](https://neon.tech) free tier)

### 1. Clone & install
```bash
git clone https://github.com/yourusername/queuecure.git
cd queuecure
```

### 2. Backend setup
```bash
cd backend
npm install

# Copy env and fill in your DATABASE_URL
cp .env.example .env

# Push schema to database
npx prisma db push

# Start dev server
npm run dev
# → Running on http://localhost:3001
```

### 3. Frontend setup
```bash
cd ../frontend
npm install

cp .env.example .env
# VITE_BACKEND_URL=http://localhost:3001

npm run dev
# → Running on http://localhost:5173
```

### 4. Open the app
| URL | Screen |
|-----|--------|
| `http://localhost:5173/` | Receptionist |
| `http://localhost:5173/display` | Waiting Room |
| `http://localhost:5173/track/<id>` | Patient Tracking |

---

## Deployment

### Backend → Railway
1. Push `backend/` to a GitHub repo
2. New Railway project → Deploy from GitHub
3. Add environment variables: `DATABASE_URL`, `FRONTEND_URL`, `PORT`
4. Railway auto-detects Node.js and runs `npm start`

### Frontend → Vercel
1. Push `frontend/` to GitHub
2. New Vercel project → import repo
3. Set `VITE_BACKEND_URL` to your Railway backend URL
4. Deploy — Vercel handles Vite build automatically

### Database → Neon
1. Create a free project at [neon.tech](https://neon.tech)
2. Copy the connection string to `DATABASE_URL` in Railway
3. Run `npx prisma db push` once to create tables

---

## Edge Cases Handled

| Scenario | How it's handled |
|----------|-----------------|
| Double-click "Call Next" | Server-side lock (`lockSet`) prevents concurrent calls |
| Page refresh | Frontend fetches full queue state on socket connect |
| Multiple receptionists | Token generation is server-side; never frontend |
| Patient skipped | Recall button brings them back without token loss |
| Empty queue | Graceful empty states on all screens |
| Doctor runs long | Moving average updates live — all estimates self-correct |
| No consultation history | Falls back to receptionist-configured avg time |
| Socket disconnect | Auto-reconnects (10 attempts, 1s delay); re-fetches state on reconnect |

---

## Project Structure

```
queuecure/
├── backend/
│   ├── prisma/
│   │   └── schema.prisma        # DB schema
│   ├── src/
│   │   ├── index.js             # Express + Socket.IO server
│   │   ├── socket/
│   │   │   └── handlers.js      # All socket event logic
│   │   └── routes/
│   │       ├── queue.js         # REST: GET /api/queue
│   │       ├── settings.js      # REST: GET /api/settings
│   │       └── tracking.js      # REST: GET /api/track/:id
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.jsx              # Router + nav
│   │   ├── socket.js            # Socket singleton
│   │   ├── store/
│   │   │   └── useQueueStore.js # Zustand store
│   │   ├── pages/
│   │   │   ├── ReceptionistPage.jsx
│   │   │   ├── WaitingRoomPage.jsx
│   │   │   └── TrackingPage.jsx
│   │   ├── components/
│   │   │   ├── QRModal.jsx
│   │   │   └── ToastContainer.jsx
│   │   └── styles/
│   │       └── global.css
│   └── package.json
└── docs/
    ├── socket-event-diagram.md
    └── thought-process.md
```

---

## Author

Built by **Sumanth** for Queue Cure '26 on Wooble.

> *"Every minute a patient spends not knowing is a minute of needless anxiety. QueueCure makes the wait visible."*

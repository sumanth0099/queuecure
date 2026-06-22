import React from "react";
import { Routes, Route, NavLink } from "react-router-dom";
import ReceptionistPage from "./pages/ReceptionistPage.jsx";
import WaitingRoomPage from "./pages/WaitingRoomPage.jsx";
import TrackingPage from "./pages/TrackingPage.jsx";
import ToastContainer from "./components/ToastContainer.jsx";
import useQueueStore from "./store/useQueueStore.js";

export default function App() {
  const connected = useQueueStore((s) => s.connected);

  return (
    <>
      <nav className="nav">
        <NavLink to="/" className="nav-logo">
          Queue<span>Cure</span>
        </NavLink>
        <div className="nav-links">
          <NavLink
            to="/"
            className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
            end
          >
            Receptionist
          </NavLink>
          <NavLink
            to="/display"
            className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
          >
            Waiting Room
          </NavLink>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              color: connected ? "var(--green)" : "var(--red)",
              fontWeight: 600,
              marginLeft: 8,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: connected ? "var(--green)" : "var(--red)",
                display: "inline-block",
              }}
            />
            {connected ? "Live" : "Offline"}
          </span>
        </div>
      </nav>

      <Routes>
        <Route path="/" element={<ReceptionistPage />} />
        <Route path="/display" element={<WaitingRoomPage />} />
        <Route path="/track/:trackingId" element={<TrackingPage />} />
      </Routes>

      <ToastContainer />
    </>
  );
}

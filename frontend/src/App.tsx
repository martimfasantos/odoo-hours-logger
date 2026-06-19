import { useEffect, useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import {
  CalendarClock,
  ClipboardCheck,
  Tags,
  Settings as SettingsIcon,
  Clock,
} from "lucide-react";
import { api } from "./api/client";
import DailyView from "./pages/DailyView";
import Logged from "./pages/Logged";
import MappingRules from "./pages/MappingRules";
import Settings from "./pages/Settings";
import { LogHoursProvider } from "./state/LogHoursContext";

type Health = "checking" | "ok" | "down";

const NAV = [
  { to: "/", label: "Log Hours", icon: CalendarClock, end: true },
  { to: "/logged", label: "Logged", icon: ClipboardCheck, end: false },
  { to: "/rules", label: "Mapping rules", icon: Tags, end: false },
  { to: "/settings", label: "Settings", icon: SettingsIcon, end: false },
];

export default function App() {
  const [health, setHealth] = useState<Health>("checking");

  useEffect(() => {
    let alive = true;
    api
      .health()
      .then(() => alive && setHealth("ok"))
      .catch(() => alive && setHealth("down"));
    return () => {
      alive = false;
    };
  }, []);

  const statusLabel =
    health === "ok"
      ? "Backend connected"
      : health === "down"
        ? "Backend unreachable"
        : "Checking backend…";

  return (
    <LogHoursProvider>
      <div className="app">
        <aside className="sidebar">
          <div className="sidebar__brand">
            <span className="sidebar__brand-mark" aria-hidden="true">
              <Clock size={18} />
            </span>
            <span className="sidebar__title">Odoo Hours Logger</span>
          </div>

          <nav className="sidebar__nav" aria-label="Primary">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  isActive ? "navlink active" : "navlink"
                }
              >
                <Icon size={18} aria-hidden="true" />
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="sidebar__status">
            <span
              className={
                health === "ok"
                  ? "status-dot status-dot--ok"
                  : health === "down"
                    ? "status-dot status-dot--down"
                    : "status-dot"
              }
              role="img"
              aria-label={statusLabel}
            />
            <span>{statusLabel}</span>
          </div>
        </aside>

        <main className="main">
          <Routes>
            <Route path="/" element={<DailyView />} />
            <Route path="/logged" element={<Logged />} />
            <Route path="/rules" element={<MappingRules />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </LogHoursProvider>
  );
}

"use client";

import type { Session } from "@/lib/types";

interface SidebarProps {
  sessions: Session[];
  onNewSession: () => void;
  onSelectSession: (id: string) => void;
  isConnected: boolean;
}

export default function Sidebar({
  sessions,
  onNewSession,
  onSelectSession,
  isConnected,
}: SidebarProps) {
  return (
    <aside
      className="flex flex-col h-full border-r"
      style={{
        width: 240,
        minWidth: 240,
        background: "var(--bg-surface)",
        borderColor: "var(--border-subtle)",
      }}
    >
      <div className="p-3">
        <button
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer"
          style={{
            background: "var(--bg-elevated)",
            color: "var(--text-secondary)",
            border: "1px solid var(--border-default)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--bg-overlay)";
            e.currentTarget.style.color = "var(--text-primary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "var(--bg-elevated)";
            e.currentTarget.style.color = "var(--text-secondary)";
          }}
          onClick={onNewSession}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M7 1v12M1 7h12"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          New Session
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {sessions.map((session) => (
          <button
            key={session.id}
            className="w-full text-left px-3 py-2.5 rounded-md mb-0.5 transition-colors cursor-pointer"
            style={{
              background: session.active ? "var(--accent-surface)" : "transparent",
              borderLeft: session.active
                ? "2px solid var(--accent)"
                : "2px solid transparent",
            }}
            onClick={() => onSelectSession(session.id)}
          >
            <div
              className="text-sm font-medium truncate"
              style={{
                color: session.active ? "var(--text-primary)" : "var(--text-secondary)",
              }}
            >
              {session.title}
            </div>
            <div className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>
              {session.timestamp}
            </div>
          </button>
        ))}
      </div>

      <div className="p-3 border-t" style={{ borderColor: "var(--border-subtle)" }}>
        <div className="flex items-center gap-2 px-2">
          <div
            className="w-2 h-2 rounded-full"
            style={{ background: isConnected ? "var(--success)" : "#ef4444" }}
          />
          <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            Claude Opus 4.6
          </span>
        </div>
      </div>
    </aside>
  );
}

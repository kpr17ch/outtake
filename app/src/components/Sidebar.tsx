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
        width: 200,
        minWidth: 200,
        background: "var(--bg-surface)",
        borderColor: "var(--border-subtle)",
      }}
    >
      <div className="px-2 pt-2 pb-1">
        <button
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors cursor-pointer"
          style={{
            color: "var(--text-secondary)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--bg-elevated)";
            e.currentTarget.style.color = "var(--text-primary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--text-secondary)";
          }}
          onClick={onNewSession}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path
              d="M6 1v10M1 6h10"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          New Session
        </button>
      </div>

      <div className="px-2 pt-1 pb-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wider px-2" style={{ color: "var(--text-tertiary)" }}>
          Sessions
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-1 pb-1">
        {sessions.map((session) => (
          <button
            key={session.id}
            className="w-full text-left px-2 py-1.5 rounded mb-px transition-colors cursor-pointer"
            style={{
              background: session.active ? "var(--bg-elevated)" : "transparent",
            }}
            onMouseEnter={(e) => {
              if (!session.active) e.currentTarget.style.background = "var(--bg-elevated)";
            }}
            onMouseLeave={(e) => {
              if (!session.active) e.currentTarget.style.background = "transparent";
            }}
            onClick={() => onSelectSession(session.id)}
          >
            <div
              className="text-xs truncate"
              style={{
                color: session.active ? "var(--text-primary)" : "var(--text-secondary)",
              }}
            >
              {session.title}
            </div>
            <div className="text-[10px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>
              {session.timestamp}
            </div>
          </button>
        ))}
      </div>

      <div className="px-3 py-2 border-t" style={{ borderColor: "var(--border-subtle)" }}>
        <div className="flex items-center gap-1.5">
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: isConnected ? "var(--success)" : "#ef4444" }}
          />
          <span className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
            Claude Opus 4.6
          </span>
        </div>
      </div>
    </aside>
  );
}

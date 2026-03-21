"use client";

import { useCallback } from "react";
import type { Session } from "@/lib/types";

interface SidebarProps {
  sessions: Session[];
  activeSessionId: string | null;
  onNewSession: () => void;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  isConnected: boolean;
  isLoading: boolean;
}

function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function Sidebar({
  sessions,
  activeSessionId,
  onNewSession,
  onSelectSession,
  onDeleteSession,
  isConnected,
  isLoading,
}: SidebarProps) {
  const handleDelete = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      onDeleteSession(id);
    },
    [onDeleteSession]
  );

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
          style={{ color: "var(--text-secondary)" }}
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
        <span
          className="text-[10px] font-medium uppercase tracking-wider px-2"
          style={{ color: "var(--text-tertiary)" }}
        >
          Sessions
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-1 pb-1">
        {isLoading ? (
          <div className="text-[10px] text-center py-4" style={{ color: "var(--text-tertiary)" }}>
            Loading...
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-[10px] text-center py-4" style={{ color: "var(--text-tertiary)" }}>
            No sessions yet
          </div>
        ) : (
          sessions.map((session) => {
            const isActive = session.id === activeSessionId;
            return (
              <div key={session.id} className="group relative">
                <button
                  className="w-full text-left px-2 py-1.5 rounded mb-px transition-colors cursor-pointer"
                  style={{
                    background: isActive ? "var(--bg-elevated)" : "transparent",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.background = "var(--bg-elevated)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.background = "transparent";
                  }}
                  onClick={() => onSelectSession(session.id)}
                >
                  <div
                    className="text-xs truncate pr-4"
                    style={{
                      color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                    }}
                  >
                    {session.title}
                  </div>
                  <div className="text-[10px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                    {formatTimestamp(session.updatedAt)}
                  </div>
                </button>
                <button
                  className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded cursor-pointer"
                  style={{ color: "var(--text-tertiary)" }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "var(--text-primary)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "var(--text-tertiary)";
                  }}
                  onClick={(e) => handleDelete(e, session.id)}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path
                      d="M2 2l6 6M8 2l-6 6"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>
            );
          })
        )}
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

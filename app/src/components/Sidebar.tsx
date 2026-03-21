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
  return date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
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
        {isLoading ? (
          <div
            className="text-xs text-center py-4"
            style={{ color: "var(--text-tertiary)" }}
          >
            Loading sessions...
          </div>
        ) : sessions.length === 0 ? (
          <div
            className="text-xs text-center py-4"
            style={{ color: "var(--text-tertiary)" }}
          >
            No sessions yet
          </div>
        ) : (
          sessions.map((session) => {
            const isActive = session.id === activeSessionId;
            return (
              <div
                key={session.id}
                className="group relative"
              >
                <button
                  className="w-full text-left px-3 py-2.5 rounded-md mb-0.5 transition-colors cursor-pointer"
                  style={{
                    background: isActive ? "var(--accent-surface)" : "transparent",
                    borderLeft: isActive
                      ? "2px solid var(--accent)"
                      : "2px solid transparent",
                  }}
                  onClick={() => onSelectSession(session.id)}
                >
                  <div
                    className="text-sm font-medium truncate pr-5"
                    style={{
                      color: isActive
                        ? "var(--text-primary)"
                        : "var(--text-secondary)",
                    }}
                  >
                    {session.title}
                  </div>
                  <div
                    className="text-xs mt-0.5"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    {formatTimestamp(session.updatedAt)}
                  </div>
                </button>
                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-500/10 cursor-pointer"
                  style={{ color: "var(--text-tertiary)" }}
                  onClick={(e) => handleDelete(e, session.id)}
                  title="Delete session"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path
                      d="M2 2l8 8M10 2l-8 8"
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

      <div
        className="p-3 border-t"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <div className="flex items-center gap-2 px-2">
          <div
            className="w-2 h-2 rounded-full"
            style={{ background: isConnected ? "var(--success)" : "#ef4444" }}
          />
          <span
            className="text-xs"
            style={{ color: "var(--text-tertiary)" }}
          >
            Claude Opus 4.6
          </span>
        </div>
      </div>
    </aside>
  );
}

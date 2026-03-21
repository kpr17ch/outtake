"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Sidebar from "@/components/Sidebar";
import ChatPanel from "@/components/ChatPanel";
import VideoPanel from "@/components/VideoPanel";
import { useChat } from "@/lib/useChat";
import type { Session } from "@/lib/types";

export default function Home() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const isFirstMessage = useRef(true);

  const createSession = useCallback(async (title: string = "New Session") => {
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });

    if (!res.ok) {
      throw new Error(`Failed to create session: ${res.status}`);
    }

    return (await res.json()) as Session;
  }, []);

  const handleClaudeSessionId = useCallback(
    async (claudeSessionId: string) => {
      if (!activeSessionId) return;
      try {
        const res = await fetch(`/api/sessions/${activeSessionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ claudeSessionId }),
        });
        if (res.ok) {
          const updated = await res.json();
          setSessions((prev) =>
            prev.map((s) => (s.id === updated.id ? updated : s))
          );
        }
      } catch {
        // ignore
      }
    },
    [activeSessionId]
  );

  const { messages, isStreaming, send, stop, reset } = useChat({
    activeSessionId,
    onClaudeSessionId: handleClaudeSessionId,
  });

  // Load sessions on mount
  useEffect(() => {
    async function loadSessions() {
      try {
        const res = await fetch("/api/sessions");
        if (res.ok) {
          const data: Session[] = await res.json();
          if (data.length > 0) {
            setSessions(data);
            setActiveSessionId(data[0].id);
          } else {
            const initialSession = await createSession();
            setSessions([initialSession]);
            setActiveSessionId(initialSession.id);
          }
        }
      } catch {
        // ignore
      } finally {
        setIsLoadingSessions(false);
      }
    }
    loadSessions();
  }, [createSession]);

  // Track first message per session
  useEffect(() => {
    isFirstMessage.current = true;
  }, [activeSessionId]);

  const handleNewSession = useCallback(async () => {
    try {
      const newSession = await createSession();
      setSessions((prev) => [newSession, ...prev]);
      setActiveSessionId(newSession.id);
      reset();
    } catch {
      // ignore
    }
  }, [createSession, reset]);

  const handleSelectSession = useCallback(
    (id: string) => {
      if (id === activeSessionId) return;
      setActiveSessionId(id);
      reset();
    },
    [activeSessionId, reset]
  );

  const handleDeleteSession = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/sessions/${id}`, { method: "DELETE" });
        if (res.ok) {
          const remaining = sessions.filter((s) => s.id !== id);

          if (remaining.length === 0) {
            const replacement = await createSession();
            setSessions([replacement]);
            setActiveSessionId(replacement.id);
            reset();
            return;
          }

          setSessions(remaining);
          if (id === activeSessionId) {
            setActiveSessionId(remaining[0].id);
            reset();
          }
        }
      } catch {
        // ignore
      }
    },
    [activeSessionId, createSession, reset, sessions]
  );

  // Update session title from first message
  const handleSend = useCallback(
    async (input: string) => {
      send(input);
      if (isFirstMessage.current && activeSessionId) {
        isFirstMessage.current = false;
        const title = input.slice(0, 40) + (input.length > 40 ? "..." : "");
        try {
          const res = await fetch(`/api/sessions/${activeSessionId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title }),
          });
          if (res.ok) {
            const updated = await res.json();
            setSessions((prev) =>
              prev.map((s) => (s.id === updated.id ? updated : s))
            );
          }
        } catch {
          // ignore
        }
      }
    },
    [send, activeSessionId]
  );

  return (
    <div className="flex h-screen" style={{ background: "var(--bg-base)" }}>
      <Sidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onNewSession={handleNewSession}
        onSelectSession={handleSelectSession}
        onDeleteSession={handleDeleteSession}
        isConnected={!isStreaming}
        isLoading={isLoadingSessions}
      />
      <ChatPanel
        activeSessionId={activeSessionId}
        messages={messages}
        isStreaming={isStreaming}
        onSend={handleSend}
        onStop={stop}
      />
      <VideoPanel activeSessionId={activeSessionId} />
    </div>
  );
}

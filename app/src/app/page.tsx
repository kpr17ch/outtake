"use client";

import { useState, useCallback } from "react";
import Sidebar from "@/components/Sidebar";
import ChatPanel from "@/components/ChatPanel";
import VideoPanel from "@/components/VideoPanel";
import { useChat } from "@/lib/useChat";
import type { Session } from "@/lib/types";

export default function Home() {
  const { messages, isStreaming, sessionId, send, stop, reset } = useChat();
  const [sessions, setSessions] = useState<Session[]>([
    { id: "1", title: "Current Session", timestamp: "Just now", active: true },
  ]);

  const handleNewSession = useCallback(() => {
    reset();
    const newSession: Session = {
      id: String(Date.now()),
      title: "New Session",
      timestamp: "Just now",
      active: true,
    };
    setSessions((prev) => [
      newSession,
      ...prev.map((s) => ({ ...s, active: false })),
    ]);
  }, [reset]);

  const handleSelectSession = useCallback((id: string) => {
    setSessions((prev) =>
      prev.map((s) => ({ ...s, active: s.id === id }))
    );
  }, []);

  // Update session title from first message
  const handleSend = useCallback(
    (input: string) => {
      send(input);
      if (messages.length === 0) {
        setSessions((prev) =>
          prev.map((s) =>
            s.active
              ? { ...s, title: input.slice(0, 40) + (input.length > 40 ? "..." : "") }
              : s
          )
        );
      }
    },
    [send, messages.length]
  );

  return (
    <div className="flex h-screen" style={{ background: "var(--bg-base)" }}>
      <Sidebar
        sessions={sessions}
        onNewSession={handleNewSession}
        onSelectSession={handleSelectSession}
        isConnected={!!sessionId || !isStreaming}
      />
      <ChatPanel
        messages={messages}
        isStreaming={isStreaming}
        onSend={handleSend}
        onStop={stop}
      />
      <VideoPanel />
    </div>
  );
}

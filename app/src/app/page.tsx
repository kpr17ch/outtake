"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import ChatPanel from "@/components/ChatPanel";
import VideoEditor from "@/components/VideoEditor";
import { useChat } from "@/lib/useChat";
import type { Session } from "@/lib/types";

export default function Home() {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const isFirstMessage = useRef(true);

  // Ensure a session exists on mount
  useEffect(() => {
    async function init() {
      try {
        const res = await fetch("/api/sessions");
        if (!res.ok) return;
        const sessions: Session[] = await res.json();
        if (sessions.length > 0) {
          setActiveSessionId(sessions[0].id);
        } else {
          const createRes = await fetch("/api/sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: "New Session" }),
          });
          if (createRes.ok) {
            const session: Session = await createRes.json();
            setActiveSessionId(session.id);
          }
        }
      } catch {
        // ignore
      }
    }
    init();
  }, []);

  const handleClaudeSessionId = useCallback(
    async (claudeSessionId: string) => {
      if (!activeSessionId) return;
      try {
        await fetch(`/api/sessions/${activeSessionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ claudeSessionId }),
        });
      } catch {
        // ignore
      }
    },
    [activeSessionId]
  );

  const { messages, isStreaming, send, stop } = useChat({
    activeSessionId,
    onClaudeSessionId: handleClaudeSessionId,
  });

  // Track first message for session title
  useEffect(() => {
    isFirstMessage.current = true;
  }, [activeSessionId]);

  const handleSend = useCallback(
    async (input: string) => {
      send(input);
      if (isFirstMessage.current && activeSessionId) {
        isFirstMessage.current = false;
        const title = input.slice(0, 40) + (input.length > 40 ? "..." : "");
        try {
          await fetch(`/api/sessions/${activeSessionId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title }),
          });
        } catch {
          // ignore
        }
      }
    },
    [send, activeSessionId]
  );

  // Selection from the video editor → can be referenced in chat
  const [selection, setSelection] = useState<{
    inSeconds: number;
    outSeconds: number;
  } | null>(null);

  const handleSendWithContext = useCallback(
    (input: string) => {
      // If there's an active selection, prepend it as context
      if (selection) {
        const ctx = `[Selection: ${selection.inSeconds.toFixed(1)}s → ${selection.outSeconds.toFixed(1)}s] `;
        handleSend(ctx + input);
      } else {
        handleSend(input);
      }
    },
    [handleSend, selection]
  );

  return (
    <div className="flex h-screen" style={{ background: "var(--bg-base)" }}>
      {/* Left: Chat */}
      <div
        className="flex flex-col h-full"
        style={{
          width: "40%",
          minWidth: 360,
          borderRight: "1px solid var(--border-subtle)",
        }}
      >
        <ChatPanel
          activeSessionId={activeSessionId}
          messages={messages}
          isStreaming={isStreaming}
          onSend={handleSendWithContext}
          onStop={stop}
          selection={selection}
        />
      </div>

      {/* Right: Video Editor */}
      <div className="flex-1 h-full min-w-0">
        <VideoEditor
          activeSessionId={activeSessionId}
          onSelectionChange={setSelection}
        />
      </div>
    </div>
  );
}

"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import Preview, { type PreviewHandle } from "@/components/Preview";
import Timeline, { type Marker, type TimelineTrack } from "@/components/Timeline";
import ChatPanel from "@/components/ChatPanel";
import { useChat } from "@/lib/useChat";
import type { Session } from "@/lib/types";
import type { MediaItem } from "@/components/MediaBin";

const MediaBin = dynamic(() => import("@/components/MediaBin"), { ssr: false });

export default function Home() {
  // ─── Session ───
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/sessions");
        if (!res.ok) return;
        const sessions: Session[] = await res.json();
        if (sessions.length > 0) {
          setSessionId(sessions[0].id);
        } else {
          const r = await fetch("/api/sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: "New Session" }),
          });
          if (r.ok) setSessionId(((await r.json()) as Session).id);
        }
      } catch { /* ignore */ }
    })();
  }, []);

  const handleClaudeSessionId = useCallback(async (id: string) => {
    if (!sessionId) return;
    try {
      await fetch(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claudeSessionId: id }),
      });
    } catch { /* ignore */ }
  }, [sessionId]);

  const { messages, isStreaming, send, stop } = useChat({
    activeSessionId: sessionId,
    onClaudeSessionId: handleClaudeSessionId,
  });

  // ─── Media ───
  const [activeMedia, setActiveMedia] = useState<MediaItem | null>(null);
  const previewRef = useRef<PreviewHandle>(null);

  // ─── Playback ───
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // ─── Markers ───
  const [markers, setMarkers] = useState<Marker>({ inTime: null, outTime: null });

  const handleSeek = useCallback((t: number) => {
    previewRef.current?.seekTo(t);
    setCurrentTime(t);
  }, []);

  const handleSetIn = useCallback(() => {
    setMarkers((m) => ({ ...m, inTime: currentTime }));
  }, [currentTime]);

  const handleSetOut = useCallback(() => {
    setMarkers((m) => ({ ...m, outTime: currentTime }));
  }, [currentTime]);

  const handleClearMarkers = useCallback(() => {
    setMarkers({ inTime: null, outTime: null });
  }, []);

  // Reset on media change
  useEffect(() => {
    setMarkers({ inTime: null, outTime: null });
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
  }, [activeMedia]);

  // ─── Build timeline tracks from active media ───
  const tracks: TimelineTrack[] = useMemo(() => {
    if (!activeMedia || activeMedia.kind !== "video" || duration <= 0) return [];
    return [
      {
        id: "v1",
        type: "video",
        label: "V1",
        clips: [{
          id: `clip-${activeMedia.path}`,
          name: activeMedia.name,
          sourceIn: 0,
          sourceOut: duration,
        }],
      },
      {
        id: "a1",
        type: "audio",
        label: "A1",
        clips: [{
          id: `audio-${activeMedia.path}`,
          name: "Audio",
          sourceIn: 0,
          sourceOut: duration,
        }],
      },
    ];
  }, [activeMedia, duration]);

  // ─── Auto-load new agent output ───
  const handleNewOutput = useCallback((item: MediaItem) => {
    // Automatically switch to new agent output
    if (item.kind === "video") {
      setActiveMedia(item);
    }
  }, []);

  // ─── Keyboard shortcuts ───
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      switch (e.key) {
        case " ":
          e.preventDefault();
          previewRef.current?.toggle();
          break;
        case "i": case "I":
          e.preventDefault();
          handleSetIn();
          break;
        case "o": case "O":
          e.preventDefault();
          handleSetOut();
          break;
        case "ArrowLeft":
          e.preventDefault();
          handleSeek(Math.max(0, currentTime - (e.shiftKey ? 5 : 1 / 30)));
          break;
        case "ArrowRight":
          e.preventDefault();
          handleSeek(Math.min(duration, currentTime + (e.shiftKey ? 5 : 1 / 30)));
          break;
        case "Escape":
          handleClearMarkers();
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [currentTime, duration, handleSeek, handleSetIn, handleSetOut, handleClearMarkers]);

  // ─── Chat with selection context ───
  const selectionForChat = markers.inTime !== null && markers.outTime !== null && markers.inTime < markers.outTime
    ? { inSeconds: markers.inTime, outSeconds: markers.outTime }
    : null;

  const isFirstMsg = useRef(true);
  useEffect(() => { isFirstMsg.current = true; }, [sessionId]);

  const handleSend = useCallback((input: string) => {
    let msg = input;
    if (selectionForChat) {
      msg = `[Selection: ${selectionForChat.inSeconds.toFixed(2)}s → ${selectionForChat.outSeconds.toFixed(2)}s` +
        (activeMedia ? ` in ${activeMedia.name}` : "") + `] ${input}`;
    }
    send(msg);

    if (isFirstMsg.current && sessionId) {
      isFirstMsg.current = false;
      const title = input.slice(0, 40) + (input.length > 40 ? "..." : "");
      fetch(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      }).catch(() => {});
    }
  }, [send, selectionForChat, activeMedia, sessionId]);

  return (
    <div className="flex flex-col h-screen" style={{ background: "var(--bg-base)" }}>
      {/* Top: Media Bin + Preview */}
      <div className="flex flex-1 min-h-0">
        <div className="shrink-0" style={{ width: 200 }}>
          <MediaBin
            sessionId={sessionId}
            activeItem={activeMedia}
            onSelect={setActiveMedia}
            onNewOutput={handleNewOutput}
          />
        </div>
        <div className="flex-1 min-w-0">
          <Preview
            ref={previewRef}
            src={activeMedia?.kind === "video" ? activeMedia.url : null}
            onTimeUpdate={setCurrentTime}
            onDurationChange={setDuration}
            onPlayStateChange={setIsPlaying}
          />
        </div>
      </div>

      {/* Timeline */}
      <Timeline
        duration={duration}
        currentTime={currentTime}
        isPlaying={isPlaying}
        markers={markers}
        tracks={tracks}
        onSeek={handleSeek}
        onTogglePlay={() => previewRef.current?.toggle()}
        onSetIn={handleSetIn}
        onSetOut={handleSetOut}
        onClearMarkers={handleClearMarkers}
      />

      {/* Chat */}
      <div className="shrink-0" style={{ height: "35%", minHeight: 200, borderTop: "1px solid var(--border-subtle)" }}>
        <ChatPanel
          activeSessionId={sessionId}
          messages={messages}
          isStreaming={isStreaming}
          onSend={handleSend}
          onStop={stop}
          selection={selectionForChat}
        />
      </div>
    </div>
  );
}

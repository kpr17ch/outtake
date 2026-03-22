"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import Preview, { type PreviewHandle } from "@/components/Preview";
import Timeline, { type Marker, type TimelineTrack } from "@/components/Timeline";
import ChatPanel from "@/components/ChatPanel";
import { useChat, type EditorContext } from "@/lib/useChat";
import { buildSelectionRange, DEFAULT_FPS, normalizeFps, secondsToFrame } from "@/lib/timecode";
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
  const [allMediaFiles, setAllMediaFiles] = useState<{ name: string; path: string }[]>([]);
  const previewRef = useRef<PreviewHandle>(null);

  // ─── Playback ───
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [fps, setFps] = useState(DEFAULT_FPS);
  const [isTimingReady, setIsTimingReady] = useState(false);

  // ─── Markers ───
  const [markers, setMarkers] = useState<Marker>({ inFrame: null, outFrame: null });

  const syncCurrentTime = useCallback((nextTime: number) => {
    setCurrentTime(nextTime);
  }, []);

  const handlePreviewTimeUpdate = useCallback((nextTime: number) => {
    syncCurrentTime(nextTime);
  }, [syncCurrentTime]);

  const handleSeek = useCallback((t: number) => {
    previewRef.current?.seekTo(t);
    syncCurrentTime(t);
  }, [syncCurrentTime]);

  const handleSetIn = useCallback(() => {
    if (activeMedia?.kind === "video" && !isTimingReady) return;
    const exactTime = previewRef.current?.getCurrentTime() ?? currentTime;
    syncCurrentTime(exactTime);
    setMarkers((m) => ({ ...m, inFrame: secondsToFrame(exactTime, fps) }));
  }, [activeMedia?.kind, currentTime, fps, isTimingReady, syncCurrentTime]);

  const handleSetOut = useCallback(() => {
    if (activeMedia?.kind === "video" && !isTimingReady) return;
    const exactTime = previewRef.current?.getCurrentTime() ?? currentTime;
    syncCurrentTime(exactTime);
    setMarkers((m) => ({ ...m, outFrame: secondsToFrame(exactTime, fps) }));
  }, [activeMedia?.kind, currentTime, fps, isTimingReady, syncCurrentTime]);

  const handleClearMarkers = useCallback(() => {
    setMarkers({ inFrame: null, outFrame: null });
  }, []);

  // Reset on media change
  useEffect(() => {
    setMarkers({ inFrame: null, outFrame: null });
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    setIsTimingReady(false);
  }, [activeMedia]);

  useEffect(() => {
    if (!sessionId || activeMedia?.kind !== "video") {
      setFps(DEFAULT_FPS);
      setIsTimingReady(false);
      return;
    }

    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch(
          `/api/workspace/media-info?sessionId=${sessionId}&path=${encodeURIComponent(activeMedia.path)}`,
          { signal: controller.signal }
        );
        if (!res.ok) return;

        const data = await res.json() as { fps?: number | null };
        const nextFps = normalizeFps(data.fps);
        setFps(nextFps);
        setIsTimingReady(true);
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        setFps(DEFAULT_FPS);
        setIsTimingReady(false);
      }
    })();

    return () => controller.abort();
  }, [activeMedia, sessionId]);

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
          if (e.shiftKey) {
            handleSeek(Math.max(0, currentTime - 1));
          } else {
            previewRef.current?.stepBackward();
            syncCurrentTime(previewRef.current?.getCurrentTime() ?? currentTime);
          }
          break;
        case "ArrowRight":
          e.preventDefault();
          if (e.shiftKey) {
            handleSeek(Math.min(duration, currentTime + 1));
          } else {
            previewRef.current?.stepForward();
            syncCurrentTime(previewRef.current?.getCurrentTime() ?? currentTime);
          }
          break;
        case "Escape":
          handleClearMarkers();
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [currentTime, duration, handleSeek, handleSetIn, handleSetOut, handleClearMarkers, syncCurrentTime]);

  // ─── Chat with selection context ───
  const selectionForChat = useMemo(
    () => buildSelectionRange(markers.inFrame, markers.outFrame, fps),
    [fps, markers.inFrame, markers.outFrame]
  );

  const editorContext = useMemo<EditorContext>(() => ({
    activeVideo: activeMedia?.kind === "video" ? activeMedia.name : undefined,
    activeVideoPath: activeMedia?.kind === "video" ? activeMedia.path : undefined,
    selection: selectionForChat ?? undefined,
    duration: duration || undefined,
    fps: fps || undefined,
  }), [activeMedia, duration, fps, selectionForChat]);

  const isFirstMsg = useRef(true);
  useEffect(() => { isFirstMsg.current = true; }, [sessionId]);

  const handleSend = useCallback((input: string, referencedFiles?: string[]) => {
    const contextForSend: EditorContext = {
      ...editorContext,
      referencedFiles: referencedFiles?.length ? referencedFiles : undefined,
    };
    send(input, contextForSend);

    if (isFirstMsg.current && sessionId) {
      isFirstMsg.current = false;
      const title = input.slice(0, 40) + (input.length > 40 ? "..." : "");
      fetch(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      }).catch(() => {});
    }
  }, [editorContext, send, sessionId]);

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
            onItemsChange={setAllMediaFiles}
          />
        </div>
        <div className="flex-1 min-w-0">
          <Preview
            ref={previewRef}
            src={activeMedia?.kind === "video" ? activeMedia.url : null}
            fps={fps}
            onTimeUpdate={handlePreviewTimeUpdate}
            onDurationChange={setDuration}
            onPlayStateChange={setIsPlaying}
            onFpsDetected={setFps}
          />
        </div>
      </div>

      {/* Timeline */}
      <Timeline
        duration={duration}
        currentTime={currentTime}
        fps={fps}
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
          mediaFiles={allMediaFiles}
        />
      </div>
    </div>
  );
}

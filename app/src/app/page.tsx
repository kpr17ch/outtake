"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import Preview, { type PreviewHandle } from "@/components/Preview";
import Timeline, { type Marker, type TimelineTrack } from "@/components/Timeline";
import ChatPanel from "@/components/ChatPanel";
import { useChat, type EditorContext } from "@/lib/useChat";
import type { Session } from "@/lib/types";
import type { MediaItem } from "@/components/MediaBin";
import { createDefaultSequence, nextTrackLabel, sequenceToTimelineTracks, type Sequence } from "@/lib/sequence";

const MediaBin = dynamic(() => import("@/components/MediaBin"), { ssr: false });

function inferMediaKindFromPath(path: string): "video" | "audio" | null {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  if (["mp4", "mov", "webm", "mkv", "avi"].includes(ext)) return "video";
  if (["mp3", "wav", "aac", "ogg", "flac", "m4a"].includes(ext)) return "audio";
  return null;
}

export default function Home() {
  // ─── Session ───
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"editor" | "settings">("editor");
  const [provider, setProvider] = useState("openai");
  const [model, setModel] = useState("gpt-4o-mini");
  const [apiKey, setApiKey] = useState("");

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

  useEffect(() => {
    if (!sessionId) return;
    fetch(`/api/sessions/${sessionId}/settings`)
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (!s) return;
        if (typeof s.provider === "string") setProvider(s.provider);
        if (typeof s.model === "string") setModel(s.model);
      })
      .catch(() => {});
  }, [sessionId]);

  const saveSettings = useCallback(async () => {
    if (!sessionId) return;
    await fetch(`/api/sessions/${sessionId}/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, model, apiKey }),
    }).catch(() => {});
    setApiKey("");
  }, [sessionId, provider, model, apiKey]);

  const handleAgentSessionId = useCallback(async (id: string) => {
    if (!sessionId) return;
    try {
      await fetch(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentSessionId: id }),
      });
    } catch { /* ignore */ }
  }, [sessionId]);

  // Editor context sent to agent with every message
  const [editorCtx, setEditorCtx] = useState<EditorContext>({});

  const { messages, isStreaming, send, stop } = useChat({
    activeSessionId: sessionId,
    onAgentSessionId: handleAgentSessionId,
    editorContext: editorCtx,
  });

  // ─── Media ───
  const [activeMedia, setActiveMedia] = useState<MediaItem | null>(null);
  const [allMediaFiles, setAllMediaFiles] = useState<{ name: string; path: string }[]>([]);
  const [sequence, setSequence] = useState<Sequence>(() => createDefaultSequence(25));
  const previewRef = useRef<PreviewHandle>(null);

  // ─── Playback ───
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [fps, setFps] = useState(25);

  // ─── Markers ───
  const [markers, setMarkers] = useState<Marker>({ inTime: null, outTime: null });
  const timelineDuration = Math.max(duration || 0, sequence.duration || 0);

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

  const tracks: TimelineTrack[] = useMemo(() => sequenceToTimelineTracks(sequence), [sequence]);

  const upsertClipForActiveMedia = useCallback((media: MediaItem, clipDuration: number) => {
    const targetType = media.kind === "audio" ? "audio" : "video";
    setSequence((prev) => {
      const has = prev.tracks.some((t) => t.clips.some((c) => c.assetPath === media.path));
      if (has) return prev;
      const idx = prev.tracks.findIndex((t) => t.type === targetType);
      if (idx < 0) return prev;
      const tracksCopy = [...prev.tracks];
      const target = tracksCopy[idx];
      tracksCopy[idx] = {
        ...target,
        clips: [
          ...target.clips,
          {
            id: crypto.randomUUID(),
            name: media.name,
            assetPath: media.path,
            sourceIn: 0,
            sourceOut: Math.max(clipDuration, 0.1),
            timelineIn: 0,
            timelineOut: Math.max(clipDuration, 0.1),
          },
        ],
      };
      return { ...prev, tracks: tracksCopy, duration: Math.max(prev.duration, clipDuration), updatedAt: new Date().toISOString() };
    });
  }, []);

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
          }
          break;
        case "ArrowRight":
          e.preventDefault();
          if (e.shiftKey) {
            handleSeek(Math.min(timelineDuration, currentTime + 1));
          } else {
            previewRef.current?.stepForward();
          }
          break;
        case "Escape":
          handleClearMarkers();
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [currentTime, duration, handleSeek, handleSetIn, handleSetOut, handleClearMarkers]);

  useEffect(() => {
    if (!sessionId) return;
    try {
      const raw = localStorage.getItem(`outtake-sequence-${sessionId}`);
      if (raw) {
        const parsed = JSON.parse(raw) as Sequence;
        if (Array.isArray(parsed.tracks)) setSequence(parsed);
      }
    } catch {
      // ignore
    }
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    try {
      localStorage.setItem(`outtake-sequence-${sessionId}`, JSON.stringify(sequence));
    } catch {
      // ignore
    }
  }, [sessionId, sequence]);

  const addTrack = useCallback((type: "video" | "audio") => {
    setSequence((prev) => ({
      ...prev,
      tracks: [
        ...prev.tracks,
        {
          id: crypto.randomUUID(),
          type,
          label: nextTrackLabel(type, prev.tracks),
          muted: false,
          solo: false,
          locked: false,
          clips: [],
        },
      ],
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  const deleteTrack = useCallback((trackId: string) => {
    setSequence((prev) => {
      const nextTracks = prev.tracks.filter((t) => t.id !== trackId);
      if (!nextTracks.length) return prev;
      return { ...prev, tracks: nextTracks, updatedAt: new Date().toISOString() };
    });
  }, []);

  const toggleTrackMute = useCallback((trackId: string) => {
    setSequence((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) => (t.id === trackId ? { ...t, muted: !t.muted } : t)),
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  const toggleTrackSolo = useCallback((trackId: string) => {
    setSequence((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) => (t.id === trackId ? { ...t, solo: !t.solo } : t)),
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  const handleDeleteFile = useCallback(async (item: MediaItem) => {
    if (!sessionId) return;
    const res = await fetch(`/api/workspace/files/${item.path}?sessionId=${sessionId}`, { method: "DELETE" });
    if (!res.ok) return;
    if (activeMedia?.path === item.path) setActiveMedia(null);
    setSequence((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) => (c.assetPath === item.path ? { ...c, missing: true } : c)),
      })),
      updatedAt: new Date().toISOString(),
    }));
  }, [sessionId, activeMedia]);

  const addClipAtTime = useCallback(
    (trackId: string, media: { path: string; name: string; kind: "video" | "audio" }, atTime: number) => {
      const clipLen = 5;
      setSequence((prev) => {
        const idx = prev.tracks.findIndex((t) => t.id === trackId);
        if (idx < 0) return prev;
        const target = prev.tracks[idx];
        if (target.type !== media.kind) return prev;

        let start = Math.max(0, atTime);
        let safety = 0;
        while (safety < 50) {
          const end = start + clipLen;
          const overlap = target.clips.find(
            (c) => !c.missing && c.timelineIn < end && c.timelineOut > start
          );
          if (!overlap) break;
          start = overlap.timelineOut;
          safety++;
        }
        const end = start + clipLen;
        const clip = {
          id: crypto.randomUUID(),
          name: media.name,
          assetPath: media.path,
          sourceIn: start,
          sourceOut: end,
          timelineIn: start,
          timelineOut: end,
        };

        const tracksCopy = [...prev.tracks];
        tracksCopy[idx] = { ...target, clips: [...target.clips, clip] };
        return { ...prev, tracks: tracksCopy, duration: Math.max(prev.duration, end), updatedAt: new Date().toISOString() };
      });
    },
    []
  );

  const availableMediaOptions = useMemo(() => {
    return allMediaFiles
      .map((f) => {
        const kind = inferMediaKindFromPath(f.path);
        if (!kind) return null;
        return { path: f.path, name: f.name, kind };
      })
      .filter(Boolean) as Array<{ path: string; name: string; kind: "video" | "audio" }>;
  }, [allMediaFiles]);

  // ─── Sync editor context for agent ───
  useEffect(() => {
    const sel = markers.inTime !== null && markers.outTime !== null && markers.inTime < markers.outTime
      ? { inSeconds: markers.inTime, outSeconds: markers.outTime }
      : undefined;
    setEditorCtx((prev) => ({
      ...prev,
      activeVideo: activeMedia?.kind === "video" ? activeMedia.name : undefined,
      activeVideoPath: activeMedia?.kind === "video" ? activeMedia.path : undefined,
      selection: sel,
      duration: timelineDuration || undefined,
      fps: fps || undefined,
      tracks: sequence.tracks.map((t) => ({
        id: t.id,
        type: t.type,
        label: t.label,
        muted: t.muted,
        clips: t.clips.map((c) => ({
          id: c.id,
          name: c.name,
          assetPath: c.assetPath,
          timelineIn: c.timelineIn,
          timelineOut: c.timelineOut,
        })),
      })),
      playhead: currentTime,
    }));
  }, [activeMedia, markers, duration, fps, sequence, currentTime]);

  // ─── Chat with selection context ───
  const selectionForChat = markers.inTime !== null && markers.outTime !== null && markers.inTime < markers.outTime
    ? { inSeconds: markers.inTime, outSeconds: markers.outTime }
    : null;

  const isFirstMsg = useRef(true);
  useEffect(() => { isFirstMsg.current = true; }, [sessionId]);

  const handleSend = useCallback((input: string, referencedFiles?: string[]) => {
    const override = referencedFiles?.length ? { referencedFiles } : undefined;
    void send(input, override);

    if (isFirstMsg.current && sessionId) {
      isFirstMsg.current = false;
      const title = input.slice(0, 40) + (input.length > 40 ? "..." : "");
      fetch(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      }).catch(() => {});
    }
  }, [send, sessionId]);

  return (
    <div
      className="flex flex-col h-screen min-h-0 overflow-hidden"
      style={{ background: "var(--bg-base)" }}
    >
      {/* Tabs — shrink-0 + z-index so nothing in the flex body paints above / blocks clicks */}
      <header
        className="shrink-0 z-30 relative flex items-center gap-2 px-3 py-2 border-b pointer-events-auto"
        style={{ borderColor: "var(--border-subtle)", background: "var(--bg-base)" }}
      >
        <button
          type="button"
          onClick={() => setActiveTab("editor")}
          className="text-xs px-3 py-1 rounded border cursor-pointer"
          style={{ opacity: activeTab === "editor" ? 1 : 0.7 }}
        >
          Editor
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("settings")}
          className="text-xs px-3 py-1 rounded border cursor-pointer"
          style={{ opacity: activeTab === "settings" ? 1 : 0.7 }}
        >
          Settings
        </button>
      </header>

      {activeTab === "settings" ? (
        <div className="flex-1 min-h-0 overflow-auto p-4">
          <div className="max-w-xl space-y-3">
            <h2 className="text-sm font-semibold">Provider Settings</h2>
            <select value={provider} onChange={(e) => setProvider(e.target.value)} className="w-full text-sm px-2 py-2 rounded bg-transparent border">
              <option value="openai">openai</option>
              <option value="anthropic">anthropic</option>
              <option value="google">google</option>
              <option value="groq">groq</option>
            </select>
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="model"
              className="w-full text-sm px-2 py-2 rounded bg-transparent border"
            />
            <input
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="api key (optional update)"
              className="w-full text-sm px-2 py-2 rounded bg-transparent border"
              type="password"
            />
            <button type="button" onClick={saveSettings} className="text-sm px-3 py-2 rounded border cursor-pointer">
              Save Provider
            </button>
            {provider === "groq" ? (
              <p className="text-xs opacity-70 mt-2">
                Groq: not all models support tool calling. Recommended:{" "}
                <code className="text-[11px]">llama-3.3-70b-versatile</code>,{" "}
                <code className="text-[11px]">meta-llama/llama-4-scout-17b-16e-instruct</code>,{" "}
                <code className="text-[11px]">llama-3.1-8b-instant</code>.
                Models like kimi-k2 produce broken tool calls and will auto-fallback to llama-3.3-70b.
              </p>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
          <div className="flex flex-1 min-h-0 overflow-hidden">
            <div className="shrink-0 flex flex-col min-h-0 overflow-hidden" style={{ width: 200 }}>
              <MediaBin
                sessionId={sessionId}
                activeItem={activeMedia}
                onSelect={(m) => {
                  setActiveMedia(m);
                  if (duration > 0) upsertClipForActiveMedia(m, duration);
                }}
                onNewOutput={handleNewOutput}
                onItemsChange={setAllMediaFiles}
                onDeleteFile={handleDeleteFile}
              />
            </div>
            <div className="flex-1 min-w-0 min-h-0 overflow-hidden">
              <Preview
                ref={previewRef}
                sessionId={sessionId}
                src={activeMedia ? activeMedia.url : null}
                mediaKind={activeMedia?.kind ?? null}
                fps={fps}
                onTimeUpdate={setCurrentTime}
                onDurationChange={(d) => {
                  setDuration(d);
                  if (activeMedia) upsertClipForActiveMedia(activeMedia, d);
                }}
                onPlayStateChange={setIsPlaying}
                onFpsDetected={setFps}
              />
            </div>
          </div>

          <Timeline
            duration={timelineDuration}
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
            onAddTrack={addTrack}
            onDeleteTrack={deleteTrack}
            onToggleTrackMute={toggleTrackMute}
            onToggleTrackSolo={toggleTrackSolo}
            availableMedia={availableMediaOptions}
            onAddClipAtTime={addClipAtTime}
          />

          <div
            className="shrink-0 flex flex-col min-h-0 overflow-hidden"
            style={{
              height: "min(40vh, 360px)",
              minHeight: 180,
              maxHeight: "45vh",
              borderTop: "1px solid var(--border-subtle)",
            }}
          >
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
      )}
    </div>
  );
}

"use client";

import { useCallback, useMemo, useRef } from "react";

// ─── Types matching Person 3's domain model ───

export interface TimelineClip {
  id: string;
  name: string;
  sourceIn: number;  // seconds
  sourceOut: number;  // seconds
  color?: string;
}

export interface TimelineTrack {
  id: string;
  type: "video" | "audio";
  label: string;
  clips: TimelineClip[];
  muted?: boolean;
}

export interface Marker {
  inTime: number | null;
  outTime: number | null;
}

interface TimelineProps {
  duration: number;
  currentTime: number;
  fps: number;
  isPlaying: boolean;
  markers: Marker;
  tracks: TimelineTrack[];
  onSeek: (time: number) => void;
  onTogglePlay: () => void;
  onSetIn: () => void;
  onSetOut: () => void;
  onClearMarkers: () => void;
}

/** Format as MM:SS:FF (frame-based timecode) */
function fmt(seconds: number, fps: number): string {
  const totalFrames = Math.round(seconds * fps);
  const f = totalFrames % fps;
  const totalSec = Math.floor(totalFrames / fps);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}:${String(f).padStart(2, "0")}`;
}

function fmtShort(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function Timeline({
  duration,
  currentTime,
  fps,
  isPlaying,
  markers,
  tracks,
  onSeek,
  onTogglePlay,
  onSetIn,
  onSetOut,
  onClearMarkers,
}: TimelineProps) {
  const trackAreaRef = useRef<HTMLDivElement>(null);

  const pct = useMemo(() => (duration > 0 ? (currentTime / duration) * 100 : 0), [currentTime, duration]);
  const inPct = useMemo(() => (markers.inTime !== null && duration > 0 ? (markers.inTime / duration) * 100 : null), [markers.inTime, duration]);
  const outPct = useMemo(() => (markers.outTime !== null && duration > 0 ? (markers.outTime / duration) * 100 : null), [markers.outTime, duration]);

  const handleTrackClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      onSeek(x * duration);
    },
    [duration, onSeek]
  );

  // Timecode ticks
  const ticks = useMemo(() => {
    if (duration <= 0) return [];
    const step = duration <= 10 ? 1 : duration <= 60 ? 5 : duration <= 300 ? 15 : 30;
    const result: { pct: number; label: string }[] = [];
    for (let t = 0; t <= duration; t += step) {
      result.push({ pct: (t / duration) * 100, label: fmtShort(t) });
    }
    return result;
  }, [duration]);

  const selectionInfo = useMemo(() => {
    if (markers.inTime === null || markers.outTime === null) return null;
    return `${fmt(markers.inTime, fps)} → ${fmt(markers.outTime, fps)} (${(markers.outTime - markers.inTime).toFixed(1)}s)`;
  }, [markers]);

  const TRACK_COLORS: Record<string, { bg: string; border: string; text: string }> = {
    video: { bg: "rgba(59,130,246,0.12)", border: "rgba(59,130,246,0.35)", text: "var(--accent)" },
    audio: { bg: "rgba(34,197,94,0.08)", border: "rgba(34,197,94,0.25)", text: "var(--success)" },
  };

  return (
    <div className="shrink-0 select-none" style={{ borderTop: "1px solid var(--border-subtle)", background: "var(--bg-surface)" }}>
      {/* Controls */}
      <div className="flex items-center gap-3 px-4 py-1.5" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <button type="button" onClick={onTogglePlay} className="cursor-pointer w-7 h-7 flex items-center justify-center rounded transition-colors" style={{ color: "var(--text-secondary)", background: "var(--bg-elevated)" }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-overlay)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "var(--bg-elevated)"; }}
        >
          {isPlaying ? (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="3" y="2" width="3" height="10" rx="0.5" /><rect x="8" y="2" width="3" height="10" rx="0.5" /></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M4 2.5v9l7-4.5L4 2.5z" /></svg>
          )}
        </button>
        <span className="text-[11px] font-mono" style={{ color: "var(--text-secondary)" }}>{fmt(currentTime, fps)} / {fmt(duration, fps)}</span>
        <div className="flex-1" />
        <button type="button" onClick={onSetIn} className="text-[10px] font-mono px-2 py-0.5 rounded cursor-pointer" style={{
          background: markers.inTime !== null ? "var(--accent-surface)" : "var(--bg-elevated)",
          color: markers.inTime !== null ? "var(--accent)" : "var(--text-tertiary)",
          border: "1px solid var(--border-subtle)",
        }} title="Set In (I)">I {markers.inTime !== null ? fmt(markers.inTime, fps) : "—"}</button>
        <button type="button" onClick={onSetOut} className="text-[10px] font-mono px-2 py-0.5 rounded cursor-pointer" style={{
          background: markers.outTime !== null ? "var(--accent-surface)" : "var(--bg-elevated)",
          color: markers.outTime !== null ? "var(--accent)" : "var(--text-tertiary)",
          border: "1px solid var(--border-subtle)",
        }} title="Set Out (O)">O {markers.outTime !== null ? fmt(markers.outTime, fps) : "—"}</button>
        {(markers.inTime !== null || markers.outTime !== null) && (
          <button type="button" onClick={onClearMarkers} className="text-[10px] cursor-pointer" style={{ color: "var(--text-tertiary)" }}>✕</button>
        )}
      </div>

      {/* Timecode ruler */}
      <div className="relative h-4 mx-4 ml-12 mt-1" style={{ fontSize: 0 }}>
        {ticks.map((t, i) => (
          <span key={i} className="absolute text-[9px] font-mono" style={{ left: `${t.pct}%`, transform: "translateX(-50%)", color: "var(--text-tertiary)" }}>{t.label}</span>
        ))}
      </div>

      {/* Tracks */}
      <div ref={trackAreaRef} className="px-4 mt-1 mb-2">
        {tracks.map((track) => {
          const colors = TRACK_COLORS[track.type] || TRACK_COLORS.video;
          return (
            <div key={track.id} className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-mono w-6 shrink-0 text-right" style={{ color: "var(--text-tertiary)" }}>{track.label}</span>
              <div
                className="relative flex-1 h-7 rounded cursor-pointer"
                style={{ background: "var(--bg-elevated)" }}
                onClick={handleTrackClick}
              >
                {/* Clip blocks */}
                {track.clips.map((clip) => {
                  const clipDur = clip.sourceOut - clip.sourceIn;
                  const clipStart = clip.sourceIn;
                  const leftPct = duration > 0 ? (clipStart / duration) * 100 : 0;
                  const widthPct = duration > 0 ? (clipDur / duration) * 100 : 100;
                  return (
                    <div
                      key={clip.id}
                      className="absolute inset-y-0.5 rounded flex items-center px-2 overflow-hidden"
                      style={{
                        left: `${leftPct}%`,
                        width: `${widthPct}%`,
                        background: clip.color || colors.bg,
                        border: `1px solid ${colors.border}`,
                        minWidth: 2,
                      }}
                    >
                      <span className="text-[10px] truncate" style={{ color: colors.text }}>{clip.name}</span>
                    </div>
                  );
                })}

                {/* Selection range */}
                {inPct !== null && outPct !== null && (
                  <div className="absolute top-0 bottom-0 pointer-events-none" style={{
                    left: `${inPct}%`, width: `${outPct - inPct}%`,
                    background: "rgba(59,130,246,0.2)",
                    borderLeft: "2px solid var(--accent)", borderRight: "2px solid var(--accent)",
                  }} />
                )}

                {/* Playhead */}
                <div className="absolute top-0 bottom-0 w-px z-10 pointer-events-none" style={{ left: `${pct}%`, background: "#fff" }} />
              </div>
            </div>
          );
        })}

        {/* Empty state */}
        {tracks.length === 0 && (
          <div className="h-14 rounded flex items-center justify-center" style={{ background: "var(--bg-elevated)" }}>
            <span className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>Select a video to start editing</span>
          </div>
        )}
      </div>

      {/* Selection info */}
      <div className="flex items-center justify-between px-4 pb-2">
        {selectionInfo ? (
          <span className="text-[10px] font-mono" style={{ color: "var(--accent)" }}>Selection: {selectionInfo}</span>
        ) : <span />}
        <span className="text-[10px]" style={{ color: "var(--text-tertiary)", opacity: 0.4 }}>
          Space: play · I/O: in/out · ←→: seek · Esc: clear
        </span>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useMemo, useRef } from "react";

export interface Marker {
  inTime: number | null;
  outTime: number | null;
}

interface TimelineProps {
  duration: number;
  currentTime: number;
  isPlaying: boolean;
  markers: Marker;
  onSeek: (time: number) => void;
  onTogglePlay: () => void;
  onSetIn: () => void;
  onSetOut: () => void;
  onClearMarkers: () => void;
  videoName: string | null;
}

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toFixed(2).padStart(5, "0")}`;
}

function fmtShort(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

export default function Timeline({
  duration,
  currentTime,
  isPlaying,
  markers,
  onSeek,
  onTogglePlay,
  onSetIn,
  onSetOut,
  onClearMarkers,
  videoName,
}: TimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);

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

  // Timecode ruler ticks
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
    const dur = markers.outTime - markers.inTime;
    return `${fmt(markers.inTime)} → ${fmt(markers.outTime)} (${dur.toFixed(1)}s)`;
  }, [markers]);

  return (
    <div className="shrink-0 select-none" style={{ borderTop: "1px solid var(--border-subtle)", background: "var(--bg-surface)" }}>
      {/* Controls bar */}
      <div className="flex items-center gap-3 px-4 py-1.5" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <button onClick={onTogglePlay} className="text-sm cursor-pointer w-5 text-center" style={{ color: "var(--text-secondary)" }}>
          {isPlaying ? "⏸" : "▶"}
        </button>
        <span className="text-[11px] font-mono" style={{ color: "var(--text-secondary)" }}>
          {fmt(currentTime)} / {fmt(duration)}
        </span>
        <div className="flex-1" />
        <button onClick={onSetIn} className="text-[10px] font-mono px-2 py-0.5 rounded cursor-pointer" style={{
          background: markers.inTime !== null ? "var(--accent-surface)" : "var(--bg-elevated)",
          color: markers.inTime !== null ? "var(--accent)" : "var(--text-tertiary)",
          border: "1px solid var(--border-subtle)",
        }} title="Set In (I)">
          I {markers.inTime !== null ? fmtShort(markers.inTime) : "—"}
        </button>
        <button onClick={onSetOut} className="text-[10px] font-mono px-2 py-0.5 rounded cursor-pointer" style={{
          background: markers.outTime !== null ? "var(--accent-surface)" : "var(--bg-elevated)",
          color: markers.outTime !== null ? "var(--accent)" : "var(--text-tertiary)",
          border: "1px solid var(--border-subtle)",
        }} title="Set Out (O)">
          O {markers.outTime !== null ? fmtShort(markers.outTime) : "—"}
        </button>
        {(markers.inTime !== null || markers.outTime !== null) && (
          <button onClick={onClearMarkers} className="text-[10px] cursor-pointer" style={{ color: "var(--text-tertiary)" }}>✕</button>
        )}
      </div>

      {/* Timecode ruler */}
      <div className="relative h-4 mx-4 mt-1" style={{ fontSize: 0 }}>
        {ticks.map((t, i) => (
          <span key={i} className="absolute text-[9px] font-mono" style={{ left: `${t.pct}%`, transform: "translateX(-50%)", color: "var(--text-tertiary)" }}>
            {t.label}
          </span>
        ))}
      </div>

      {/* Video track */}
      <div className="px-4 mt-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-mono w-6 shrink-0" style={{ color: "var(--text-tertiary)" }}>V1</span>
          <div
            ref={trackRef}
            className="relative flex-1 h-7 rounded cursor-pointer"
            style={{ background: "var(--bg-elevated)" }}
            onClick={handleTrackClick}
          >
            {/* Video clip block */}
            {videoName && (
              <div className="absolute inset-y-0.5 left-0 right-0 rounded flex items-center px-2" style={{ background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)" }}>
                <span className="text-[10px] truncate" style={{ color: "var(--accent)" }}>{videoName}</span>
              </div>
            )}

            {/* Selection range */}
            {inPct !== null && outPct !== null && (
              <div className="absolute top-0 bottom-0" style={{
                left: `${inPct}%`, width: `${outPct - inPct}%`,
                background: "rgba(59,130,246,0.2)",
                borderLeft: "2px solid var(--accent)", borderRight: "2px solid var(--accent)",
              }} />
            )}

            {/* Playhead */}
            <div className="absolute top-0 bottom-0 w-px z-10" style={{ left: `${pct}%`, background: "var(--text-primary)" }} />
          </div>
        </div>
      </div>

      {/* Audio track */}
      <div className="px-4 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono w-6 shrink-0" style={{ color: "var(--text-tertiary)" }}>A1</span>
          <div
            className="relative flex-1 h-5 rounded cursor-pointer"
            style={{ background: "var(--bg-elevated)" }}
            onClick={handleTrackClick}
          >
            {/* Audio block (mirrors video) */}
            {videoName && (
              <div className="absolute inset-y-0.5 left-0 right-0 rounded flex items-center px-2" style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)" }}>
                <span className="text-[10px] truncate" style={{ color: "var(--success)" }}>Audio</span>
              </div>
            )}

            {/* Selection range */}
            {inPct !== null && outPct !== null && (
              <div className="absolute top-0 bottom-0" style={{
                left: `${inPct}%`, width: `${outPct - inPct}%`,
                background: "rgba(59,130,246,0.15)",
                borderLeft: "2px solid var(--accent)", borderRight: "2px solid var(--accent)",
              }} />
            )}

            {/* Playhead */}
            <div className="absolute top-0 bottom-0 w-px z-10" style={{ left: `${pct}%`, background: "var(--text-primary)" }} />
          </div>
        </div>
      </div>

      {/* Selection info + shortcuts hint */}
      <div className="flex items-center justify-between px-4 pb-2">
        {selectionInfo ? (
          <span className="text-[10px] font-mono" style={{ color: "var(--accent)" }}>Selection: {selectionInfo}</span>
        ) : (
          <span />
        )}
        <span className="text-[10px]" style={{ color: "var(--text-tertiary)", opacity: 0.4 }}>
          Space: play · I/O: in/out · ←→: seek · Esc: clear
        </span>
      </div>
    </div>
  );
}

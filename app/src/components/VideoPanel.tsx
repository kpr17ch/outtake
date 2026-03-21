"use client";

import { useState, useRef, useCallback } from "react";

export default function VideoPanel() {
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [panelWidth, setPanelWidth] = useState(400);
  const videoRef = useRef<HTMLVideoElement>(null);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setVideoSrc(url);
      setIsPlaying(false);
      setCurrentTime(0);
    }
  }, []);

  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  }, []);

  const handleSeek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!videoRef.current || !duration) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      videoRef.current.currentTime = pct * duration;
    },
    [duration]
  );

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      resizeRef.current = { startX: e.clientX, startWidth: panelWidth };

      const handleMouseMove = (ev: MouseEvent) => {
        if (!resizeRef.current) return;
        const diff = resizeRef.current.startX - ev.clientX;
        const newWidth = Math.max(300, Math.min(700, resizeRef.current.startWidth + diff));
        setPanelWidth(newWidth);
      };

      const handleMouseUp = () => {
        resizeRef.current = null;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [panelWidth]
  );

  return (
    <div className="flex h-full">
      {/* Resize handle */}
      <div
        className="w-1 cursor-col-resize hover:bg-[var(--accent)] transition-colors flex-shrink-0"
        style={{ background: "var(--border-subtle)" }}
        onMouseDown={handleResizeStart}
      />

      <aside
        className="flex flex-col h-full"
        style={{
          width: panelWidth,
          minWidth: 300,
          background: "var(--bg-surface)",
          borderLeft: "1px solid var(--border-subtle)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
            Preview
          </span>
          <label
            className="text-xs px-2.5 py-1 rounded cursor-pointer transition-colors"
            style={{
              background: "var(--bg-elevated)",
              color: "var(--text-secondary)",
              border: "1px solid var(--border-default)",
            }}
          >
            Upload
            <input
              type="file"
              accept="video/*"
              className="hidden"
              onChange={handleFileUpload}
            />
          </label>
        </div>

        {/* Video area */}
        <div className="flex-1 flex flex-col">
          {videoSrc ? (
            <>
              <div
                className="flex-1 flex items-center justify-center p-4"
                style={{ background: "#000" }}
              >
                <video
                  ref={videoRef}
                  src={videoSrc}
                  className="max-w-full max-h-full rounded"
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={() => {
                    if (videoRef.current) {
                      setDuration(videoRef.current.duration);
                    }
                  }}
                  onEnded={() => setIsPlaying(false)}
                />
              </div>

              {/* Controls */}
              <div
                className="px-4 py-3 border-t"
                style={{ borderColor: "var(--border-subtle)" }}
              >
                <div className="flex items-center gap-3 mb-2">
                  <button
                    onClick={togglePlay}
                    className="cursor-pointer"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {isPlaying ? (
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <rect x="3" y="2" width="4" height="12" rx="1" />
                        <rect x="9" y="2" width="4" height="12" rx="1" />
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M4 2.5v11l10-5.5z" />
                      </svg>
                    )}
                  </button>
                  <span
                    className="text-xs font-mono"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </span>
                </div>

                {/* Timeline */}
                <div
                  className="h-1.5 rounded-full cursor-pointer relative"
                  style={{ background: "var(--bg-overlay)" }}
                  onClick={handleSeek}
                >
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: duration ? `${(currentTime / duration) * 100}%` : "0%",
                      background: "var(--accent)",
                    }}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
              <div
                className="w-16 h-16 rounded-xl flex items-center justify-center"
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px dashed var(--border-default)",
                }}
              >
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 28 28"
                  fill="none"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  <rect
                    x="3"
                    y="6"
                    width="16"
                    height="16"
                    rx="2"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                  <path
                    d="M19 11l5-3v12l-5-3V11z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div className="text-center">
                <p
                  className="text-sm font-medium mb-1"
                  style={{ color: "var(--text-secondary)" }}
                >
                  No video loaded
                </p>
                <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                  Upload a video or let the AI load one
                </p>
              </div>
              <label
                className="text-xs px-4 py-2 rounded-md cursor-pointer transition-colors"
                style={{
                  background: "var(--accent-surface)",
                  color: "var(--accent)",
                  border: "1px solid var(--accent-dim)",
                }}
              >
                Choose file
                <input
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </label>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

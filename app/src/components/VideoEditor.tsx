"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { AbsoluteFill, OffthreadVideo, Img } from "remotion";

// ─── Generic composition that plays any video file by URL ───

const VideoComposition: React.FC<{ src: string }> = ({ src }) => (
  <AbsoluteFill style={{ backgroundColor: "#000" }}>
    <OffthreadVideo
      src={src}
      style={{ width: "100%", height: "100%", objectFit: "contain" }}
    />
  </AbsoluteFill>
);

const ImageComposition: React.FC<{ src: string }> = ({ src }) => (
  <AbsoluteFill style={{ backgroundColor: "#000" }}>
    <Img
      src={src}
      style={{ width: "100%", height: "100%", objectFit: "contain" }}
    />
  </AbsoluteFill>
);

// ─── Types ───

interface MediaFile {
  name: string;
  path: string;
  url: string;
  type: "video" | "image" | "audio" | "other";
  size: number;
}

interface Selection {
  inFrame: number;
  outFrame: number;
  inSeconds: number;
  outSeconds: number;
}

interface VideoEditorProps {
  activeSessionId: string | null;
  onSelectionChange?: (selection: Selection | null) => void;
}

// ─── Helpers ───

function formatTimecode(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

function getFileType(name: string): MediaFile["type"] {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (["mp4", "mov", "webm", "mkv", "avi"].includes(ext)) return "video";
  if (["jpg", "jpeg", "png", "gif", "webp", "bmp"].includes(ext)) return "image";
  if (["mp3", "wav", "aac", "ogg", "flac", "m4a"].includes(ext)) return "audio";
  return "other";
}

// ─── Component ───

export default function VideoEditor({
  activeSessionId,
  onSelectionChange,
}: VideoEditorProps) {
  const playerRef = useRef<PlayerRef>(null);
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [activeFile, setActiveFile] = useState<MediaFile | null>(null);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);

  // In/Out markers for selection
  const [inFrame, setInFrame] = useState<number | null>(null);
  const [outFrame, setOutFrame] = useState<number | null>(null);

  // Video metadata
  const [duration, setDuration] = useState(0);
  const [videoWidth, setVideoWidth] = useState(1920);
  const [videoHeight, setVideoHeight] = useState(1080);
  const fps = 30;

  const durationInFrames = useMemo(
    () => Math.max(1, Math.ceil(duration * fps)),
    [duration]
  );

  // Fetch workspace files
  const fetchFiles = useCallback(async () => {
    if (!activeSessionId) return;
    try {
      const res = await fetch(
        `/api/workspace/tree?sessionId=${activeSessionId}`
      );
      if (!res.ok) return;
      const data = await res.json();

      const mediaFiles: MediaFile[] = [];
      function walk(entries: Array<Record<string, unknown>>, prefix = "") {
        for (const entry of entries) {
          const name = entry.name as string;
          const path = entry.path as string;
          const type = entry.type as string;
          if (type === "dir" && Array.isArray(entry.children)) {
            walk(entry.children as Array<Record<string, unknown>>, path);
          } else if (type === "file") {
            const ft = getFileType(name);
            if (ft === "video" || ft === "image") {
              mediaFiles.push({
                name,
                path,
                url: `/api/workspace/files/${path}?sessionId=${activeSessionId}`,
                type: ft,
                size: (entry.size as number) || 0,
              });
            }
          }
        }
      }
      walk(data.tree || []);
      setFiles(mediaFiles);

      // Auto-select first video if nothing selected
      if (!activeFile && mediaFiles.length > 0) {
        const firstVideo = mediaFiles.find((f) => f.type === "video");
        if (firstVideo) setActiveFile(firstVideo);
      }
    } catch {
      // ignore
    }
  }, [activeSessionId, activeFile]);

  // Poll for files
  useEffect(() => {
    fetchFiles();
    const interval = setInterval(fetchFiles, 4000);
    return () => clearInterval(interval);
  }, [fetchFiles]);

  // Reset on session change
  useEffect(() => {
    setActiveFile(null);
    setFiles([]);
    setInFrame(null);
    setOutFrame(null);
    setCurrentFrame(0);
  }, [activeSessionId]);

  // Probe video metadata when file changes
  useEffect(() => {
    if (!activeFile || activeFile.type !== "video") return;
    const video = document.createElement("video");
    video.preload = "metadata";
    video.src = activeFile.url;
    video.onloadedmetadata = () => {
      setDuration(video.duration || 10);
      setVideoWidth(video.videoWidth || 1920);
      setVideoHeight(video.videoHeight || 1080);
      setInFrame(null);
      setOutFrame(null);
      setCurrentFrame(0);
    };
    return () => {
      video.src = "";
    };
  }, [activeFile]);

  // Frame update listener
  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    const handler = () => {
      const frame = p.getCurrentFrame();
      setCurrentFrame(frame);
    };
    p.addEventListener("frameupdate", handler);
    return () => p.removeEventListener("frameupdate", handler);
  }, [activeFile, durationInFrames]);

  // Notify parent of selection changes
  useEffect(() => {
    if (inFrame !== null && outFrame !== null && inFrame < outFrame) {
      onSelectionChange?.({
        inFrame,
        outFrame,
        inSeconds: inFrame / fps,
        outSeconds: outFrame / fps,
      });
    } else {
      onSelectionChange?.(null);
    }
  }, [inFrame, outFrame, fps, onSelectionChange]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLInputElement
      )
        return;

      switch (e.key) {
        case " ":
          e.preventDefault();
          playerRef.current?.toggle();
          setIsPlaying((p) => !p);
          break;
        case "i":
        case "I":
          e.preventDefault();
          setInFrame(currentFrame);
          break;
        case "o":
        case "O":
          e.preventDefault();
          setOutFrame(currentFrame);
          break;
        case "ArrowLeft":
          e.preventDefault();
          playerRef.current?.seekTo(Math.max(0, currentFrame - (e.shiftKey ? 10 : 1)));
          break;
        case "ArrowRight":
          e.preventDefault();
          playerRef.current?.seekTo(
            Math.min(durationInFrames - 1, currentFrame + (e.shiftKey ? 10 : 1))
          );
          break;
        case "Escape":
          setInFrame(null);
          setOutFrame(null);
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [currentFrame, durationInFrames]);

  // Upload handler
  const handleUpload = useCallback(
    async (fileList: FileList) => {
      if (!activeSessionId || !fileList.length) return;
      setUploading(true);
      const formData = new FormData();
      for (const file of Array.from(fileList)) {
        formData.append("files", file);
      }
      formData.append("sessionId", activeSessionId);
      try {
        await fetch("/api/upload", { method: "POST", body: formData });
        await fetchFiles();
      } finally {
        setUploading(false);
      }
    },
    [activeSessionId, fetchFiles]
  );

  // Timeline click handler
  const handleTimelineClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const frame = Math.round(pct * (durationInFrames - 1));
      playerRef.current?.seekTo(frame);
    },
    [durationInFrames]
  );

  const selectionText = useMemo(() => {
    if (inFrame === null || outFrame === null) return null;
    const inSec = inFrame / fps;
    const outSec = outFrame / fps;
    return `${formatTimecode(inSec)} → ${formatTimecode(outSec)} (${(outSec - inSec).toFixed(1)}s)`;
  }, [inFrame, outFrame, fps]);

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: "var(--bg-base)" }}
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={(e) => {
        e.preventDefault();
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        handleUpload(e.dataTransfer.files);
      }}
    >
      {/* ─── File Tabs ─── */}
      <div
        className="flex items-center gap-1 px-3 py-1.5 overflow-x-auto shrink-0"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        {files.map((f) => (
          <button
            key={f.path}
            onClick={() => setActiveFile(f)}
            className="px-2.5 py-1 text-xs rounded shrink-0 cursor-pointer transition-colors"
            style={{
              background: f.path === activeFile?.path ? "var(--bg-elevated)" : "transparent",
              color: f.path === activeFile?.path ? "var(--text-primary)" : "var(--text-tertiary)",
              border: f.path === activeFile?.path ? "1px solid var(--border-default)" : "1px solid transparent",
            }}
          >
            {f.name}
          </button>
        ))}
        <label className="px-2 py-1 text-xs cursor-pointer shrink-0" style={{ color: "var(--text-tertiary)" }}>
          {uploading ? "..." : "+"}
          <input type="file" className="hidden" accept="video/*,image/*" multiple onChange={(e) => e.target.files && handleUpload(e.target.files)} />
        </label>
      </div>

      {/* ─── Player Area ─── */}
      <div className="flex-1 flex items-center justify-center min-h-0 relative">
        {isDragOver && (
          <div
            className="absolute inset-0 z-50 flex items-center justify-center"
            style={{ background: "rgba(10,10,10,0.85)", border: "2px dashed var(--accent)", margin: 4, borderRadius: 8 }}
          >
            <p className="text-sm" style={{ color: "var(--accent)" }}>Drop files to upload</p>
          </div>
        )}

        {activeFile?.type === "video" && duration > 0 ? (
          <div className="w-full h-full flex items-center justify-center p-4">
            <Player
              ref={playerRef}
              component={VideoComposition}
              inputProps={{ src: activeFile.url }}
              durationInFrames={durationInFrames}
              compositionWidth={videoWidth}
              compositionHeight={videoHeight}
              fps={fps}
              style={{
                width: "100%",
                maxHeight: "100%",
                aspectRatio: `${videoWidth}/${videoHeight}`,
              }}
              controls={false}
              loop
              clickToPlay={false}
            />
          </div>
        ) : activeFile?.type === "image" ? (
          <div className="w-full h-full flex items-center justify-center p-4">
            <Player
              component={ImageComposition}
              inputProps={{ src: activeFile.url }}
              durationInFrames={1}
              compositionWidth={1920}
              compositionHeight={1080}
              fps={1}
              style={{ width: "100%", maxHeight: "100%" }}
              controls={false}
            />
          </div>
        ) : (
          <div className="text-center" style={{ color: "var(--text-tertiary)" }}>
            <p className="text-sm">Drop a video here or upload via chat</p>
            <p className="text-xs mt-1 opacity-60">Supports MP4, MOV, WebM</p>
          </div>
        )}
      </div>

      {/* ─── Timeline + Controls ─── */}
      {activeFile?.type === "video" && duration > 0 && (
        <div className="shrink-0 px-4 pb-3 pt-2" style={{ borderTop: "1px solid var(--border-subtle)" }}>
          {/* Playback controls */}
          <div className="flex items-center gap-3 mb-2">
            <button
              onClick={() => { playerRef.current?.toggle(); setIsPlaying((p) => !p); }}
              className="text-xs font-mono cursor-pointer"
              style={{ color: "var(--text-secondary)" }}
            >
              {isPlaying ? "⏸" : "▶"}
            </button>
            <span className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>
              {formatTimecode(currentFrame / fps)} / {formatTimecode(duration)}
            </span>
            <span className="text-xs font-mono" style={{ color: "var(--text-tertiary)" }}>
              F{currentFrame}
            </span>
            <div className="flex-1" />
            {/* In/Out buttons */}
            <button
              onClick={() => setInFrame(currentFrame)}
              className="text-[10px] font-mono px-1.5 py-0.5 rounded cursor-pointer"
              style={{
                background: inFrame !== null ? "var(--accent-surface)" : "transparent",
                color: inFrame !== null ? "var(--accent)" : "var(--text-tertiary)",
                border: "1px solid var(--border-subtle)",
              }}
              title="Set In point (I)"
            >
              IN {inFrame !== null ? formatTimecode(inFrame / fps) : "—"}
            </button>
            <button
              onClick={() => setOutFrame(currentFrame)}
              className="text-[10px] font-mono px-1.5 py-0.5 rounded cursor-pointer"
              style={{
                background: outFrame !== null ? "var(--accent-surface)" : "transparent",
                color: outFrame !== null ? "var(--accent)" : "var(--text-tertiary)",
                border: "1px solid var(--border-subtle)",
              }}
              title="Set Out point (O)"
            >
              OUT {outFrame !== null ? formatTimecode(outFrame / fps) : "—"}
            </button>
            {(inFrame !== null || outFrame !== null) && (
              <button
                onClick={() => { setInFrame(null); setOutFrame(null); }}
                className="text-[10px] font-mono px-1 cursor-pointer"
                style={{ color: "var(--text-tertiary)" }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Timeline bar */}
          <div
            className="relative h-8 rounded cursor-pointer"
            style={{ background: "var(--bg-surface)" }}
            onClick={handleTimelineClick}
          >
            {/* Selection range highlight */}
            {inFrame !== null && outFrame !== null && (
              <div
                className="absolute top-0 bottom-0 rounded"
                style={{
                  left: `${(inFrame / durationInFrames) * 100}%`,
                  width: `${((outFrame - inFrame) / durationInFrames) * 100}%`,
                  background: "var(--accent-surface)",
                  borderLeft: "2px solid var(--accent)",
                  borderRight: "2px solid var(--accent)",
                }}
              />
            )}

            {/* In marker */}
            {inFrame !== null && (
              <div
                className="absolute top-0 bottom-0 w-0.5"
                style={{
                  left: `${(inFrame / durationInFrames) * 100}%`,
                  background: "var(--accent)",
                }}
              />
            )}

            {/* Out marker */}
            {outFrame !== null && (
              <div
                className="absolute top-0 bottom-0 w-0.5"
                style={{
                  left: `${(outFrame / durationInFrames) * 100}%`,
                  background: "var(--accent)",
                }}
              />
            )}

            {/* Playhead */}
            <div
              className="absolute top-0 bottom-0 w-0.5"
              style={{
                left: `${(currentFrame / durationInFrames) * 100}%`,
                background: "var(--text-primary)",
              }}
            />
          </div>

          {/* Selection info */}
          {selectionText && (
            <div className="mt-1.5 text-[10px] font-mono" style={{ color: "var(--accent)" }}>
              Selection: {selectionText}
            </div>
          )}

          {/* Keyboard hint */}
          <div className="mt-1 text-[10px]" style={{ color: "var(--text-tertiary)", opacity: 0.5 }}>
            Space: play/pause · I/O: in/out · ←→: frame step · Shift+←→: 10 frames · Esc: clear
          </div>
        </div>
      )}
    </div>
  );
}

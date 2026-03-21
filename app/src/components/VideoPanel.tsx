"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useWorkspace, type FileEntry } from "@/lib/useWorkspace";

// --- Icons ---

function FolderIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ color: "var(--text-tertiary)", flexShrink: 0 }}>
      <path d="M1.5 3.5a1 1 0 011-1h3l1.5 1.5h4a1 1 0 011 1v5a1 1 0 01-1 1h-8.5a1 1 0 01-1-1v-6.5z" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ color: "var(--accent)", flexShrink: 0 }}>
      <rect x="1.5" y="3" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <path d="M9.5 5.5l3-1.5v6l-3-1.5" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

function AudioIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ color: "#a78bfa", flexShrink: 0 }}>
      <path d="M7 2v10M4 5v4M10 4v6M1.5 6v2M12.5 5.5v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ color: "#34d399", flexShrink: 0 }}>
      <rect x="1.5" y="2.5" width="11" height="9" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="4.5" cy="5.5" r="1" fill="currentColor" />
      <path d="M1.5 9.5l3-3 2 2 2-2 4 3" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ color: "var(--text-tertiary)", flexShrink: 0 }}>
      <path d="M3.5 1.5h4.5l3 3v7a1 1 0 01-1 1h-6.5a1 1 0 01-1-1v-9a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.2" />
      <path d="M8 1.5v3h3" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="12" height="12" viewBox="0 0 12 12" fill="none"
      style={{
        color: "var(--text-tertiary)",
        flexShrink: 0,
        transform: open ? "rotate(90deg)" : "rotate(0deg)",
        transition: "transform 0.15s",
      }}
    >
      <path d="M4.5 3l3 3-3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// --- Helpers ---

function getFileCategory(mimeType?: string): "video" | "audio" | "image" | "other" {
  if (!mimeType) return "other";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("image/")) return "image";
  return "other";
}

function getFileIcon(entry: FileEntry) {
  if (entry.type === "dir") return <FolderIcon />;
  const cat = getFileCategory(entry.mimeType);
  if (cat === "video") return <VideoIcon />;
  if (cat === "audio") return <AudioIcon />;
  if (cat === "image") return <ImageIcon />;
  return <FileIcon />;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function isPreviewable(entry: FileEntry): boolean {
  const cat = getFileCategory(entry.mimeType);
  return cat === "video" || cat === "audio" || cat === "image";
}

// --- File Tree Node ---

function FileTreeNode({
  entry,
  activeFile,
  onSelect,
  isOutputDir,
  depth,
}: {
  entry: FileEntry;
  activeFile: string | null;
  onSelect: (entry: FileEntry) => void;
  isOutputDir: boolean;
  depth: number;
}) {
  const [open, setOpen] = useState(isOutputDir || depth === 0);

  if (entry.type === "dir") {
    return (
      <div>
        <button
          className="flex items-center gap-1 w-full text-left py-0.5 cursor-pointer"
          style={{ paddingLeft: depth * 12 + 4, color: "var(--text-secondary)" }}
          onClick={() => setOpen(!open)}
        >
          <ChevronIcon open={open} />
          <FolderIcon />
          <span className="text-xs truncate">{entry.name}</span>
          {entry.name === "output" && (
            <span
              className="text-[10px] px-1 rounded ml-auto"
              style={{ background: "var(--accent-surface)", color: "var(--accent)" }}
            >
              output
            </span>
          )}
        </button>
        {open && entry.children && (
          <div>
            {entry.children.map((child) => (
              <FileTreeNode
                key={child.path}
                entry={child}
                activeFile={activeFile}
                onSelect={onSelect}
                isOutputDir={entry.name === "output"}
                depth={depth + 1}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const isActive = activeFile === entry.path;
  const canPreview = isPreviewable(entry);

  return (
    <button
      className="flex items-center gap-1.5 w-full text-left py-0.5 rounded transition-colors"
      style={{
        paddingLeft: depth * 12 + 20,
        paddingRight: 8,
        background: isActive ? "var(--accent-surface)" : "transparent",
        color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
        opacity: canPreview ? 1 : 0.5,
        cursor: canPreview ? "pointer" : "default",
      }}
      onClick={() => canPreview && onSelect(entry)}
    >
      {getFileIcon(entry)}
      <span className="text-xs truncate flex-1">{entry.name}</span>
      {isOutputDir && (
        <span
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ background: "var(--accent)" }}
        />
      )}
      <span className="text-[10px] flex-shrink-0" style={{ color: "var(--text-tertiary)" }}>
        {formatSize(entry.size)}
      </span>
    </button>
  );
}

// --- Main VideoPanel ---

export default function VideoPanel() {
  const { tree, isLoading, refresh, newOutputFiles } = useWorkspace();
  const [activeFile, setActiveFile] = useState<FileEntry | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [panelWidth, setPanelWidth] = useState(420);
  const [fileBrowserOpen, setFileBrowserOpen] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const fileUrl = activeFile ? `/api/workspace/files/${activeFile.path}` : null;
  const fileCategory = activeFile ? getFileCategory(activeFile.mimeType) : null;

  // Auto-select new output files
  useEffect(() => {
    if (newOutputFiles.length > 0) {
      // Find the FileEntry for the newest output file
      const findEntry = (entries: FileEntry[], targetPath: string): FileEntry | null => {
        for (const e of entries) {
          if (e.path === targetPath) return e;
          if (e.children) {
            const found = findEntry(e.children, targetPath);
            if (found) return found;
          }
        }
        return null;
      };
      const newest = newOutputFiles[newOutputFiles.length - 1];
      const entry = findEntry(tree, newest);
      if (entry && isPreviewable(entry)) {
        setActiveFile(entry);
      }
    }
  }, [newOutputFiles, tree]);

  // Upload to raw/
  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // For now, use object URL as fallback since we don't have an upload API yet
      // In production, this would POST to an upload endpoint
      const url = URL.createObjectURL(file);
      setActiveFile({
        name: file.name,
        path: `__local__/${file.name}`,
        type: "file",
        size: file.size,
        modified: new Date().toISOString(),
        mimeType: file.type,
      });
      // Store the blob URL so we can use it
      ((window as unknown) as Record<string, unknown>).__localFileUrl = url;
      setIsPlaying(false);
      setCurrentTime(0);
    },
    []
  );

  const getPreviewUrl = useCallback(() => {
    if (!activeFile) return null;
    if (activeFile.path.startsWith("__local__/")) {
      return ((window as unknown) as Record<string, unknown>).__localFileUrl as string;
    }
    return `/api/workspace/files/${activeFile.path}`;
  }, [activeFile]);

  const handleSelectFile = useCallback((entry: FileEntry) => {
    setActiveFile(entry);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, []);

  const togglePlay = useCallback(() => {
    const mediaEl = videoRef.current || audioRef.current;
    if (!mediaEl) return;
    if (isPlaying) {
      mediaEl.pause();
    } else {
      mediaEl.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  const handleTimeUpdate = useCallback(() => {
    const mediaEl = videoRef.current || audioRef.current;
    if (mediaEl) {
      setCurrentTime(mediaEl.currentTime);
    }
  }, []);

  const handleSeek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const mediaEl = videoRef.current || audioRef.current;
      if (!mediaEl || !duration) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      mediaEl.currentTime = pct * duration;
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
        const newWidth = Math.max(320, Math.min(700, resizeRef.current.startWidth + diff));
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

  const previewUrl = getPreviewUrl();
  const hasMedia = activeFile && (fileCategory === "video" || fileCategory === "audio");

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
          minWidth: 320,
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
          <div className="flex items-center gap-2">
            <button
              className="text-xs px-2 py-1 rounded cursor-pointer transition-colors"
              style={{
                background: fileBrowserOpen ? "var(--accent-surface)" : "var(--bg-elevated)",
                color: fileBrowserOpen ? "var(--accent)" : "var(--text-secondary)",
                border: `1px solid ${fileBrowserOpen ? "var(--accent-dim)" : "var(--border-default)"}`,
              }}
              onClick={() => setFileBrowserOpen(!fileBrowserOpen)}
            >
              Files
            </button>
            <label
              className="text-xs px-2 py-1 rounded cursor-pointer transition-colors"
              style={{
                background: "var(--bg-elevated)",
                color: "var(--text-secondary)",
                border: "1px solid var(--border-default)",
              }}
            >
              Upload
              <input
                type="file"
                accept="video/*,audio/*,image/*"
                className="hidden"
                onChange={handleFileUpload}
              />
            </label>
          </div>
        </div>

        {/* File browser */}
        {fileBrowserOpen && (
          <div
            className="overflow-y-auto border-b"
            style={{
              borderColor: "var(--border-subtle)",
              maxHeight: 220,
              minHeight: 80,
            }}
          >
            {isLoading ? (
              <div className="flex items-center justify-center py-6">
                <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                  Loading workspace...
                </span>
              </div>
            ) : tree.length === 0 ? (
              <div className="flex items-center justify-center py-6">
                <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                  No files in workspace
                </span>
              </div>
            ) : (
              <div className="py-1">
                {tree.map((entry) => (
                  <FileTreeNode
                    key={entry.path}
                    entry={entry}
                    activeFile={activeFile?.path ?? null}
                    onSelect={handleSelectFile}
                    isOutputDir={entry.name === "output"}
                    depth={0}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Preview area */}
        <div className="flex-1 flex flex-col min-h-0">
          {activeFile && fileCategory === "video" && previewUrl ? (
            <>
              <div
                className="flex-1 flex items-center justify-center p-4 min-h-0"
                style={{ background: "#000" }}
              >
                <video
                  ref={videoRef}
                  src={previewUrl}
                  className="max-w-full max-h-full rounded"
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={() => {
                    if (videoRef.current) {
                      setDuration(videoRef.current.duration);
                    }
                  }}
                  onEnded={() => setIsPlaying(false)}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                />
              </div>

              {/* Controls */}
              <div className="px-4 py-3 border-t" style={{ borderColor: "var(--border-subtle)" }}>
                <div className="flex items-center gap-3 mb-2">
                  <button onClick={togglePlay} className="cursor-pointer" style={{ color: "var(--text-primary)" }}>
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
                  <span className="text-xs font-mono" style={{ color: "var(--text-tertiary)" }}>
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </span>
                  <span className="text-xs truncate ml-auto" style={{ color: "var(--text-tertiary)" }}>
                    {activeFile.name}
                  </span>
                </div>
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
          ) : activeFile && fileCategory === "audio" && previewUrl ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 gap-6">
              <div
                className="w-20 h-20 rounded-2xl flex items-center justify-center"
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border-default)",
                }}
              >
                <AudioIcon />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium mb-1" style={{ color: "var(--text-primary)" }}>
                  {activeFile.name}
                </p>
                <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                  {formatSize(activeFile.size)}
                </p>
              </div>
              <audio
                ref={audioRef}
                src={previewUrl}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={() => {
                  if (audioRef.current) setDuration(audioRef.current.duration);
                }}
                onEnded={() => setIsPlaying(false)}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
              />
              <div className="w-full max-w-xs">
                <div className="flex items-center gap-3 mb-2">
                  <button onClick={togglePlay} className="cursor-pointer" style={{ color: "var(--text-primary)" }}>
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
                  <span className="text-xs font-mono" style={{ color: "var(--text-tertiary)" }}>
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </span>
                </div>
                <div
                  className="h-1.5 rounded-full cursor-pointer relative"
                  style={{ background: "var(--bg-overlay)" }}
                  onClick={handleSeek}
                >
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: duration ? `${(currentTime / duration) * 100}%` : "0%",
                      background: "#a78bfa",
                    }}
                  />
                </div>
              </div>
            </div>
          ) : activeFile && fileCategory === "image" && previewUrl ? (
            <div className="flex-1 flex flex-col min-h-0">
              <div
                className="flex-1 flex items-center justify-center p-4 min-h-0"
                style={{ background: "#000" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl}
                  alt={activeFile.name}
                  className="max-w-full max-h-full rounded object-contain"
                />
              </div>
              <div
                className="px-4 py-2 border-t flex items-center justify-between"
                style={{ borderColor: "var(--border-subtle)" }}
              >
                <span className="text-xs truncate" style={{ color: "var(--text-secondary)" }}>
                  {activeFile.name}
                </span>
                <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                  {formatSize(activeFile.size)}
                </span>
              </div>
            </div>
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
                  <rect x="3" y="6" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M19 11l5-3v12l-5-3V11z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                  No file selected
                </p>
                <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                  Select a file from the browser or upload one
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
                  accept="video/*,audio/*,image/*"
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

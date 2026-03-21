"use client";

import { useState, useRef, useCallback, useEffect } from "react";

interface WorkspaceFile {
  name: string;
  size: number;
  type: string;
  modified: string;
}

interface UploadProgress {
  filename: string;
  progress: number; // 0-100
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(type: string) {
  if (type.startsWith("video/")) return "V";
  if (type.startsWith("audio/")) return "A";
  if (type.startsWith("image/")) return "I";
  return "F";
}

function fileIconColor(type: string) {
  if (type.startsWith("video/")) return "var(--accent)";
  if (type.startsWith("audio/")) return "var(--success)";
  if (type.startsWith("image/")) return "#a78bfa";
  return "var(--text-tertiary)";
}

export default function VideoPanel() {
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploads, setUploads] = useState<UploadProgress[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [panelWidth, setPanelWidth] = useState(400);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const fetchFiles = useCallback(async () => {
    try {
      const res = await fetch("/api/workspace");
      if (res.ok) {
        const data = await res.json();
        setFiles(data.files || []);
      }
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const uploadFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const formData = new FormData();
      const filesToUpload = Array.from(fileList);

      if (!filesToUpload.length) return;

      // Show progress indicators
      setUploads(filesToUpload.map((f) => ({ filename: f.name, progress: 0 })));

      for (const file of filesToUpload) {
        formData.append("files", file);
      }

      try {
        // Simulate progress (XHR would be needed for real progress, but fetch is simpler)
        setUploads((prev) =>
          prev.map((u) => ({ ...u, progress: 50 }))
        );

        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (res.ok) {
          setUploads((prev) =>
            prev.map((u) => ({ ...u, progress: 100 }))
          );
          // Brief delay to show 100% then clear
          setTimeout(() => setUploads([]), 600);
          await fetchFiles();
        } else {
          const data = await res.json();
          console.error("[upload] failed:", data.error);
          setUploads([]);
        }
      } catch (err) {
        console.error("[upload] error:", err);
        setUploads([]);
      }
    },
    [fetchFiles]
  );

  // Drag & drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only leave if we're actually leaving the panel
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      if (e.dataTransfer.files.length) {
        uploadFiles(e.dataTransfer.files);
      }
    },
    [uploadFiles]
  );

  // File selection
  const handleSelectFile = useCallback((name: string) => {
    setSelectedFile(name);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, []);

  const selectedFileData = files.find((f) => f.name === selectedFile);
  const fileUrl = selectedFile ? `/api/files?name=${encodeURIComponent(selectedFile)}` : null;

  // Playback controls
  const togglePlay = useCallback(() => {
    const media = videoRef.current || audioRef.current;
    if (!media) return;
    if (isPlaying) {
      media.pause();
    } else {
      media.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  const handleTimeUpdate = useCallback(() => {
    const media = videoRef.current || audioRef.current;
    if (media) setCurrentTime(media.currentTime);
  }, []);

  const handleSeek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const media = videoRef.current || audioRef.current;
      if (!media || !duration) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      media.currentTime = pct * duration;
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

  const isVideo = selectedFileData?.type.startsWith("video/");
  const isAudio = selectedFileData?.type.startsWith("audio/");
  const isImage = selectedFileData?.type.startsWith("image/");
  const hasMediaControls = isVideo || isAudio;

  return (
    <div className="flex h-full">
      {/* Resize handle */}
      <div
        className="w-1 cursor-col-resize hover:bg-[var(--accent)] transition-colors flex-shrink-0"
        style={{ background: "var(--border-subtle)" }}
        onMouseDown={handleResizeStart}
      />

      <aside
        className="flex flex-col h-full relative"
        style={{
          width: panelWidth,
          minWidth: 300,
          background: "var(--bg-surface)",
          borderLeft: "1px solid var(--border-subtle)",
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Drag overlay */}
        {isDragOver && (
          <div
            className="absolute inset-0 z-50 flex items-center justify-center"
            style={{
              background: "rgba(10, 10, 10, 0.85)",
              border: "2px dashed var(--accent)",
              borderRadius: 8,
              margin: 4,
            }}
          >
            <div className="text-center">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                className="mx-auto mb-2"
                style={{ color: "var(--accent)" }}
              >
                <path
                  d="M12 16V4m0 0l-4 4m4-4l4 4M4 14v4a2 2 0 002 2h12a2 2 0 002-2v-4"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <p className="text-sm font-medium" style={{ color: "var(--accent)" }}>
                Drop files to upload
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
                Video, audio, images
              </p>
            </div>
          </div>
        )}

        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
            Workspace
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchFiles}
              className="text-xs px-2 py-1 rounded cursor-pointer transition-colors"
              style={{
                background: "var(--bg-elevated)",
                color: "var(--text-secondary)",
                border: "1px solid var(--border-default)",
              }}
            >
              Refresh
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
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) uploadFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        </div>

        {/* Preview area */}
        {selectedFile && fileUrl && (
          <div className="flex-shrink-0">
            {isVideo && (
              <div
                className="flex items-center justify-center"
                style={{ background: "#000", maxHeight: 240 }}
              >
                <video
                  ref={videoRef}
                  src={fileUrl}
                  className="max-w-full max-h-[240px]"
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={() => {
                    if (videoRef.current) setDuration(videoRef.current.duration);
                  }}
                  onEnded={() => setIsPlaying(false)}
                />
              </div>
            )}

            {isImage && (
              <div
                className="flex items-center justify-center p-4"
                style={{ background: "#000", maxHeight: 240 }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={fileUrl}
                  alt={selectedFile}
                  className="max-w-full max-h-[208px] object-contain"
                />
              </div>
            )}

            {isAudio && (
              <div
                className="flex items-center justify-center p-6"
                style={{ background: "var(--bg-elevated)" }}
              >
                <audio
                  ref={audioRef}
                  src={fileUrl}
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={() => {
                    if (audioRef.current) setDuration(audioRef.current.duration);
                  }}
                  onEnded={() => setIsPlaying(false)}
                />
                <div className="text-center">
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-2"
                    style={{ background: "var(--bg-overlay)" }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ color: "var(--success)" }}>
                      <path
                        d="M9 18V5l12-2v13M9 18a3 3 0 11-6 0 3 3 0 016 0zm12-2a3 3 0 11-6 0 3 3 0 016 0z"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <p className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>
                    {selectedFile}
                  </p>
                </div>
              </div>
            )}

            {/* Playback controls */}
            {hasMediaControls && (
              <div
                className="px-4 py-3 border-b"
                style={{ borderColor: "var(--border-subtle)" }}
              >
                <div className="flex items-center gap-3 mb-2">
                  <button
                    onClick={togglePlay}
                    className="cursor-pointer"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {isPlaying ? (
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                        <rect x="3" y="2" width="4" height="12" rx="1" />
                        <rect x="9" y="2" width="4" height="12" rx="1" />
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
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
                  <span
                    className="text-xs font-mono ml-auto truncate max-w-[120px]"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    {selectedFile}
                  </span>
                </div>

                {/* Timeline */}
                <div
                  className="h-1 rounded-full cursor-pointer relative"
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
            )}
          </div>
        )}

        {/* Upload progress */}
        {uploads.length > 0 && (
          <div className="px-4 py-2 border-b flex-shrink-0" style={{ borderColor: "var(--border-subtle)" }}>
            {uploads.map((u) => (
              <div key={u.filename} className="flex items-center gap-2 py-1">
                <div className="flex-1 h-1 rounded-full" style={{ background: "var(--bg-overlay)" }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${u.progress}%`,
                      background: "var(--accent)",
                    }}
                  />
                </div>
                <span className="text-xs font-mono truncate max-w-[100px]" style={{ color: "var(--text-tertiary)" }}>
                  {u.filename}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* File list */}
        <div className="flex-1 overflow-y-auto">
          {files.length === 0 && uploads.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 p-8">
              <div
                className="w-14 h-14 rounded-xl flex items-center justify-center"
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px dashed var(--border-default)",
                }}
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  <path
                    d="M12 16V4m0 0l-4 4m4-4l4 4M4 14v4a2 2 0 002 2h12a2 2 0 002-2v-4"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                  No files yet
                </p>
                <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                  Drag & drop files here or click Upload
                </p>
              </div>
            </div>
          ) : (
            <div className="py-1">
              {files.map((file) => (
                <button
                  key={file.name}
                  onClick={() => handleSelectFile(file.name)}
                  className="w-full text-left px-4 py-2 flex items-center gap-3 cursor-pointer transition-colors"
                  style={{
                    background:
                      selectedFile === file.name
                        ? "var(--bg-elevated)"
                        : "transparent",
                  }}
                  onMouseEnter={(e) => {
                    if (selectedFile !== file.name) {
                      e.currentTarget.style.background = "var(--bg-elevated)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedFile !== file.name) {
                      e.currentTarget.style.background = "transparent";
                    }
                  }}
                >
                  <span
                    className="text-xs font-mono font-bold w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                    style={{
                      color: fileIconColor(file.type),
                      background: "var(--bg-overlay)",
                    }}
                  >
                    {fileIcon(file.type)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-xs font-mono truncate"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {file.name}
                    </p>
                    <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                      {formatBytes(file.size)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

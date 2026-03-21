"use client";

import { useState, useCallback, useEffect } from "react";

export interface MediaItem {
  name: string;
  path: string;
  url: string;
  kind: "video" | "audio" | "image" | "other";
  size: number;
}

interface MediaBinProps {
  sessionId: string | null;
  activeItem: MediaItem | null;
  onSelect: (item: MediaItem) => void;
}

function classifyFile(name: string): MediaItem["kind"] {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (["mp4", "mov", "webm", "mkv", "avi"].includes(ext)) return "video";
  if (["mp3", "wav", "aac", "ogg", "flac", "m4a"].includes(ext)) return "audio";
  if (["jpg", "jpeg", "png", "gif", "webp", "bmp"].includes(ext)) return "image";
  return "other";
}

const KIND_ICONS: Record<MediaItem["kind"], string> = {
  video: "🎬",
  audio: "🎵",
  image: "🖼",
  other: "📄",
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export default function MediaBin({ sessionId, activeItem, onSelect }: MediaBinProps) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);

  const fetchItems = useCallback(async () => {
    if (!sessionId) { setItems([]); return; }
    try {
      const res = await fetch(`/api/workspace/tree?sessionId=${sessionId}`);
      if (!res.ok) return;
      const data = await res.json();
      const result: MediaItem[] = [];
      function walk(entries: Array<Record<string, unknown>>) {
        for (const e of entries) {
          if (e.type === "dir" && Array.isArray(e.children)) {
            walk(e.children as Array<Record<string, unknown>>);
          } else if (e.type === "file") {
            const name = e.name as string;
            const path = e.path as string;
            const kind = classifyFile(name);
            if (kind !== "other") {
              result.push({
                name,
                path,
                url: `/api/workspace/files/${path}?sessionId=${sessionId}`,
                kind,
                size: (e.size as number) || 0,
              });
            }
          }
        }
      }
      walk(data.tree || []);
      setItems(result);
    } catch { /* ignore */ }
  }, [sessionId]);

  useEffect(() => {
    fetchItems();
    const iv = setInterval(fetchItems, 5000);
    return () => clearInterval(iv);
  }, [fetchItems]);

  useEffect(() => { setItems([]); }, [sessionId]);

  const upload = useCallback(async (files: FileList) => {
    if (!sessionId || !files.length) return;
    setUploading(true);
    const fd = new FormData();
    for (const f of Array.from(files)) fd.append("files", f);
    fd.append("sessionId", sessionId);
    try {
      await fetch("/api/upload", { method: "POST", body: fd });
      await fetchItems();
    } finally { setUploading(false); }
  }, [sessionId, fetchItems]);

  return (
    <div
      className="flex flex-col h-full select-none"
      style={{ borderRight: "1px solid var(--border-subtle)" }}
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={(e) => {
        e.preventDefault();
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false);
      }}
      onDrop={(e) => { e.preventDefault(); setIsDragOver(false); upload(e.dataTransfer.files); }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 shrink-0" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Media</span>
        <label className="text-xs cursor-pointer px-1.5 py-0.5 rounded" style={{ color: "var(--text-tertiary)", background: "var(--bg-elevated)" }}>
          {uploading ? "..." : "+ Add"}
          <input type="file" className="hidden" accept="video/*,audio/*,image/*" multiple onChange={(e) => e.target.files && upload(e.target.files)} />
        </label>
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto px-1.5 py-1.5 relative">
        {isDragOver && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded" style={{ background: "rgba(10,10,10,0.9)", border: "2px dashed var(--accent)", margin: 4 }}>
            <p className="text-xs" style={{ color: "var(--accent)" }}>Drop to import</p>
          </div>
        )}
        {items.length === 0 && !isDragOver && (
          <p className="text-xs text-center py-6" style={{ color: "var(--text-tertiary)" }}>
            Drop media files here
          </p>
        )}
        {items.map((item) => (
          <button
            key={item.path}
            onClick={() => onSelect(item)}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left cursor-pointer transition-colors mb-0.5"
            style={{
              background: item.path === activeItem?.path ? "var(--bg-elevated)" : "transparent",
              color: item.path === activeItem?.path ? "var(--text-primary)" : "var(--text-secondary)",
            }}
          >
            <span className="text-xs shrink-0">{KIND_ICONS[item.kind]}</span>
            <span className="text-xs truncate flex-1">{item.name}</span>
            <span className="text-[10px] shrink-0" style={{ color: "var(--text-tertiary)" }}>{formatSize(item.size)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { OUTTAKE_UPLOAD_COMPLETE_EVENT } from "@/components/Preview";

export interface MediaItem {
  name: string;
  path: string;
  url: string;
  kind: "video" | "audio" | "image" | "other";
  size: number;
  group: "source" | "result";
}

interface MediaBinProps {
  sessionId: string | null;
  activeItem: MediaItem | null;
  onSelect: (item: MediaItem) => void;
  onNewOutput?: (item: MediaItem) => void;
  onItemsChange?: (items: { name: string; path: string }[]) => void;
}

function classifyFile(name: string): MediaItem["kind"] {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (["mp4", "mov", "webm", "mkv", "avi"].includes(ext)) return "video";
  if (["mp3", "wav", "aac", "ogg", "flac", "m4a"].includes(ext)) return "audio";
  if (["jpg", "jpeg", "png", "gif", "webp", "bmp"].includes(ext)) return "image";
  return "other";
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export default function MediaBin({ sessionId, activeItem, onSelect, onNewOutput, onItemsChange }: MediaBinProps) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => {
    const clear = () => setIsDragOver(false);
    window.addEventListener("dragend", clear);
    window.addEventListener("drop", clear);
    return () => {
      window.removeEventListener("dragend", clear);
      window.removeEventListener("drop", clear);
    };
  }, []);
  const [uploading, setUploading] = useState(false);
  const prevOutputPaths = useRef<Set<string>>(new Set());

  const fetchItems = useCallback(async () => {
    if (!sessionId) { setItems([]); return; }
    try {
      const res = await fetch(`/api/workspace/tree?sessionId=${sessionId}`);
      if (!res.ok) return;
      const data = await res.json();
      const result: MediaItem[] = [];

      for (const topDir of (data.tree || []) as Array<Record<string, unknown>>) {
        const dirName = topDir.name as string;
        if (topDir.type !== "dir" || !["input", "output"].includes(dirName)) continue;
        const group: MediaItem["group"] = dirName === "input" ? "source" : "result";

        for (const entry of (topDir.children || []) as Array<Record<string, unknown>>) {
          if (entry.type !== "file") continue;
          const name = entry.name as string;
          const path = entry.path as string;
          const kind = classifyFile(name);
          if (kind === "other") continue;
          const endpoint = kind === "video"
            ? `/api/workspace/proxy/${path}?sessionId=${sessionId}`
            : `/api/workspace/files/${path}?sessionId=${sessionId}`;
          result.push({ name, path, url: endpoint, kind, size: (entry.size as number) || 0, group });
        }
      }

      setItems(result);
      onItemsChange?.(result.map((i) => ({ name: i.name, path: i.path })));

      // Detect new output files
      const currentOutputPaths = new Set(result.filter(i => i.group === "result").map(i => i.path));
      for (const p of currentOutputPaths) {
        if (!prevOutputPaths.current.has(p)) {
          const newItem = result.find(i => i.path === p);
          if (newItem) onNewOutput?.(newItem);
        }
      }
      prevOutputPaths.current = currentOutputPaths;
    } catch { /* ignore */ }
  }, [sessionId, onNewOutput]);

  useEffect(() => {
    fetchItems();
    const iv = setInterval(fetchItems, 3000);
    return () => clearInterval(iv);
  }, [fetchItems]);

  useEffect(() => {
    const onRemoteUpload = () => {
      void fetchItems();
    };
    window.addEventListener(OUTTAKE_UPLOAD_COMPLETE_EVENT, onRemoteUpload);
    return () => window.removeEventListener(OUTTAKE_UPLOAD_COMPLETE_EVENT, onRemoteUpload);
  }, [fetchItems]);

  useEffect(() => { setItems([]); prevOutputPaths.current = new Set(); }, [sessionId]);

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

  const sources = items.filter(i => i.group === "source");
  const results = items.filter(i => i.group === "result");

  return (
    <div
      className="flex flex-col h-full select-none"
      style={{ borderRight: "1px solid var(--border-subtle)" }}
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={(e) => { e.preventDefault(); if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false); }}
      onDrop={(e) => { e.preventDefault(); setIsDragOver(false); upload(e.dataTransfer.files); }}
    >
      <div className="flex items-center justify-between px-3 py-2 shrink-0" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Media</span>
        <label
          htmlFor="mediabin-file-upload"
          className="text-xs cursor-pointer px-1.5 py-0.5 rounded pointer-events-auto"
          style={{ color: "var(--text-tertiary)", background: "var(--bg-elevated)" }}
          aria-label="Upload media files"
        >
          {uploading ? "..." : "+"}
          <input
            id="mediabin-file-upload"
            type="file"
            className="hidden"
            accept="video/*,audio/*,image/*"
            multiple
            onChange={(e) => e.target.files && upload(e.target.files)}
          />
        </label>
      </div>

      <div className="flex-1 overflow-y-auto px-1.5 py-1 relative">
        {isDragOver && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded" style={{ background: "rgba(10,10,10,0.9)", border: "2px dashed var(--accent)", margin: 4 }}>
            <p className="text-xs" style={{ color: "var(--accent)" }}>Drop to import</p>
          </div>
        )}

        {items.length === 0 && !isDragOver && (
          <p className="text-xs text-center py-6" style={{ color: "var(--text-tertiary)" }}>Drop media files here</p>
        )}

        {/* Source files */}
        {sources.length > 0 && (
          <>
            <div className="px-2 pt-2 pb-1">
              <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>Source</span>
            </div>
            {sources.map((item) => (
              <FileRow key={item.path} item={item} active={item.path === activeItem?.path} onSelect={onSelect} />
            ))}
          </>
        )}

        {/* Results */}
        {results.length > 0 && (
          <>
            <div className="px-2 pt-3 pb-1">
              <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: "var(--success)" }}>Results</span>
            </div>
            {results.map((item) => (
              <FileRow key={item.path} item={item} active={item.path === activeItem?.path} onSelect={onSelect} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function FileRow({ item, active, onSelect }: { item: MediaItem; active: boolean; onSelect: (i: MediaItem) => void }) {
  const icon = item.kind === "video" ? "🎬" : item.kind === "audio" ? "🎵" : "🖼";
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left cursor-pointer transition-colors mb-0.5"
      style={{
        background: active ? "var(--bg-elevated)" : "transparent",
        color: active ? "var(--text-primary)" : "var(--text-secondary)",
      }}
    >
      <span className="text-xs shrink-0">{icon}</span>
      <span className="text-xs truncate flex-1">{item.name}</span>
      <span className="text-[10px] shrink-0" style={{ color: "var(--text-tertiary)" }}>{formatSize(item.size)}</span>
    </button>
  );
}

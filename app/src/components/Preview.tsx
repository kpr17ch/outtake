"use client";

import { useRef, useEffect, useCallback, forwardRef, useImperativeHandle, useState } from "react";

/** Dispatched after a successful /api/upload from Preview or elsewhere; MediaBin listens to refresh. */
export const OUTTAKE_UPLOAD_COMPLETE_EVENT = "outtake-upload-complete";

export interface PreviewHandle {
  seekTo: (seconds: number) => void;
  getCurrentTime: () => number;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  stepForward: () => void;
  stepBackward: () => void;
}

interface PreviewProps {
  src: string | null;
  /** When no video is selected, enables upload in the empty state (same API as media bin). */
  sessionId?: string | null;
  fps?: number;
  onTimeUpdate?: (time: number) => void;
  onDurationChange?: (duration: number) => void;
  onPlayStateChange?: (playing: boolean) => void;
  onFpsDetected?: (fps: number) => void;
}

function PreviewEmpty({ sessionId }: { sessionId: string | null }) {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const clear = () => setDragOver(false);
    window.addEventListener("dragend", clear);
    window.addEventListener("drop", clear);
    return () => {
      window.removeEventListener("dragend", clear);
      window.removeEventListener("drop", clear);
    };
  }, []);

  const upload = useCallback(
    async (files: FileList) => {
      if (!sessionId || !files.length) return;
      setUploading(true);
      const fd = new FormData();
      for (const f of Array.from(files)) fd.append("files", f);
      fd.append("sessionId", sessionId);
      try {
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        if (res.ok) window.dispatchEvent(new CustomEvent(OUTTAKE_UPLOAD_COMPLETE_EVENT));
      } finally {
        setUploading(false);
      }
    },
    [sessionId]
  );

  return (
    <div
      className="relative w-full h-full flex flex-col items-center justify-center gap-3 px-4"
      style={{ background: "#000" }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        upload(e.dataTransfer.files);
      }}
    >
      <p className="text-xs text-center max-w-sm" style={{ color: "var(--text-tertiary)" }}>
        Drag files here or click below — or use <strong style={{ color: "var(--text-secondary)" }}>+</strong> in the
        media bin
      </p>
      {sessionId ? (
        <>
          <label
            htmlFor="preview-empty-upload"
            className="text-xs px-3 py-1.5 rounded border cursor-pointer"
            style={{ borderColor: "var(--border-default)", color: "var(--text-secondary)" }}
          >
            {uploading ? "Uploading…" : "Choose video / media"}
          </label>
          <input
            id="preview-empty-upload"
            type="file"
            className="hidden"
            accept="video/*,audio/*,image/*"
            multiple
            onChange={(e) => e.target.files && upload(e.target.files)}
          />
        </>
      ) : (
        <p className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
          Preparing workspace…
        </p>
      )}
      {dragOver && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none"
          style={{ background: "rgba(10,10,10,0.88)", border: "2px dashed var(--accent)" }}
        >
          <p className="text-xs" style={{ color: "var(--accent)" }}>
            Drop to upload
          </p>
        </div>
      )}
    </div>
  );
}

const Preview = forwardRef<PreviewHandle, PreviewProps>(
  (
    {
      src,
      sessionId = null,
      fps = 25,
      onTimeUpdate,
      onDurationChange,
      onPlayStateChange,
      onFpsDetected: _onFpsDetected,
    },
    ref
  ) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const playStateRef = useRef(onPlayStateChange);
    playStateRef.current = onPlayStateChange;

    useImperativeHandle(ref, () => ({
      seekTo: (s: number) => {
        if (videoRef.current) videoRef.current.currentTime = s;
      },
      getCurrentTime: () => videoRef.current?.currentTime ?? 0,
      play: () => {
        videoRef.current?.play();
      },
      pause: () => {
        videoRef.current?.pause();
      },
      toggle: () => {
        const v = videoRef.current;
        if (!v) return;
        v.paused ? v.play() : v.pause();
      },
      stepForward: () => {
        const v = videoRef.current;
        if (!v || !v.paused) return;
        v.currentTime = Math.min(v.duration, v.currentTime + 1 / fps);
      },
      stepBackward: () => {
        const v = videoRef.current;
        if (!v || !v.paused) return;
        v.currentTime = Math.max(0, v.currentTime - 1 / fps);
      },
    }));

    const handleTimeUpdate = useCallback(() => {
      if (videoRef.current) onTimeUpdate?.(videoRef.current.currentTime);
    }, [onTimeUpdate]);

    const handleLoadedMetadata = useCallback(() => {
      const v = videoRef.current;
      if (!v) return;
      onDurationChange?.(v.duration);
    }, [onDurationChange]);

    useEffect(() => {
      const v = videoRef.current;
      if (!v) return;
      const onPlay = () => playStateRef.current?.(true);
      const onPause = () => playStateRef.current?.(false);
      v.addEventListener("play", onPlay);
      v.addEventListener("pause", onPause);
      playStateRef.current?.(false);
      return () => {
        v.removeEventListener("play", onPlay);
        v.removeEventListener("pause", onPause);
      };
    }, [src]);

    if (!src) {
      return <PreviewEmpty sessionId={sessionId} />;
    }

    return (
      <div
        className="w-full h-full flex items-center justify-center cursor-pointer"
        style={{ background: "#000" }}
        onClick={() => {
          const v = videoRef.current;
          if (v) v.paused ? v.play() : v.pause();
        }}
      >
        <video
          ref={videoRef}
          src={src}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          className="max-w-full max-h-full pointer-events-none"
          style={{ objectFit: "contain" }}
          preload="auto"
        />
      </div>
    );
  }
);

Preview.displayName = "Preview";
export default Preview;

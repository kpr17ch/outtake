"use client";

import { useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";

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
  fps?: number;
  onTimeUpdate?: (time: number) => void;
  onDurationChange?: (duration: number) => void;
  onPlayStateChange?: (playing: boolean) => void;
  onFpsDetected?: (fps: number) => void;
}

const Preview = forwardRef<PreviewHandle, PreviewProps>(
  ({ src, fps = 25, onTimeUpdate, onDurationChange, onPlayStateChange, onFpsDetected }, ref) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    // Store callback in ref so event listeners always see latest
    const playStateRef = useRef(onPlayStateChange);
    playStateRef.current = onPlayStateChange;

    useImperativeHandle(ref, () => ({
      seekTo: (s: number) => {
        if (videoRef.current) videoRef.current.currentTime = s;
      },
      getCurrentTime: () => videoRef.current?.currentTime ?? 0,
      play: () => { videoRef.current?.play(); },
      pause: () => { videoRef.current?.pause(); },
      toggle: () => {
        const v = videoRef.current;
        if (!v) return;
        v.paused ? v.play() : v.pause();
      },
      stepForward: () => {
        const v = videoRef.current;
        if (!v || !v.paused) return;
        // Use exact frame duration for stepping
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

    // Play/pause events — use ref to avoid stale closures
    useEffect(() => {
      const v = videoRef.current;
      if (!v) return;
      const onPlay = () => playStateRef.current?.(true);
      const onPause = () => playStateRef.current?.(false);
      v.addEventListener("play", onPlay);
      v.addEventListener("pause", onPause);
      // Also fire initial state
      playStateRef.current?.(false);
      return () => {
        v.removeEventListener("play", onPlay);
        v.removeEventListener("pause", onPause);
      };
    }, [src]); // Re-register when src changes (new video element content)

    if (!src) {
      return (
        <div className="w-full h-full flex items-center justify-center" style={{ background: "#000" }}>
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>Select a video from the media bin</p>
        </div>
      );
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

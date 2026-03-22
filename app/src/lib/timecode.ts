export const DEFAULT_FPS = 25;

export interface SelectionRange {
  inFrame: number;
  outFrame: number;
  inSeconds: number;
  outSeconds: number;
  timecodeIn: string;
  timecodeOut: string;
  durationFrames: number;
  durationSeconds: number;
  fps: number;
}

export function normalizeFps(fps?: number | null): number {
  if (!Number.isFinite(fps) || !fps || fps <= 0) {
    return DEFAULT_FPS;
  }

  return fps;
}

export function secondsToFrame(seconds: number, fps?: number | null): number {
  return Math.max(0, Math.round(seconds * normalizeFps(fps)));
}

export function frameToSeconds(frame: number, fps?: number | null): number {
  return Math.max(0, frame) / normalizeFps(fps);
}

export function formatTimecode(frame: number, fps?: number | null): string {
  const safeFrame = Math.max(0, frame);
  const rate = normalizeFps(fps);
  const displayFps = Math.max(1, Math.round(rate));

  let wholeSeconds = Math.floor(safeFrame / rate);
  let framePart = Math.round((safeFrame / rate - wholeSeconds) * displayFps);

  if (framePart >= displayFps) {
    wholeSeconds += 1;
    framePart = 0;
  }

  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const seconds = wholeSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}:${String(framePart).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}:${String(framePart).padStart(2, "0")}`;
}

export function buildSelectionRange(
  inFrame: number | null,
  outFrame: number | null,
  fps?: number | null
): SelectionRange | null {
  if (inFrame === null || outFrame === null || outFrame <= inFrame) {
    return null;
  }

  const safeFps = normalizeFps(fps);
  const inSeconds = frameToSeconds(inFrame, safeFps);
  const outSeconds = frameToSeconds(outFrame, safeFps);

  return {
    inFrame,
    outFrame,
    inSeconds,
    outSeconds,
    timecodeIn: formatTimecode(inFrame, safeFps),
    timecodeOut: formatTimecode(outFrame, safeFps),
    durationFrames: outFrame - inFrame,
    durationSeconds: outSeconds - inSeconds,
    fps: safeFps,
  };
}

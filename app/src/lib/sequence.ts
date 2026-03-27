export type TrackType = "video" | "audio";

export interface SequenceClip {
  id: string;
  name: string;
  assetPath: string;
  timelineIn: number;
  timelineOut: number;
  sourceIn: number;
  sourceOut: number;
  missing?: boolean;
}

export interface SequenceTrack {
  id: string;
  type: TrackType;
  label: string;
  muted: boolean;
  solo: boolean;
  locked: boolean;
  clips: SequenceClip[];
}

export interface Sequence {
  id: string;
  duration: number;
  fps: number;
  tracks: SequenceTrack[];
  updatedAt: string;
}

export function createDefaultSequence(fps = 25): Sequence {
  return {
    id: crypto.randomUUID(),
    duration: 0,
    fps,
    tracks: [
      { id: "v1", type: "video", label: "V1", muted: false, solo: false, locked: false, clips: [] },
      { id: "a1", type: "audio", label: "A1", muted: false, solo: false, locked: false, clips: [] },
    ],
    updatedAt: new Date().toISOString(),
  };
}

export function sequenceToTimelineTracks(seq: Sequence) {
  return seq.tracks.map((t) => ({
    id: t.id,
    type: t.type,
    label: t.label,
    muted: t.muted,
    clips: t.clips.map((c) => ({
      id: c.id,
      name: c.missing ? `${c.name} (missing)` : c.name,
      sourceIn: c.timelineIn,
      sourceOut: c.timelineOut,
      color: c.missing ? "rgba(239,68,68,0.2)" : undefined,
    })),
  }));
}

export function nextTrackLabel(type: TrackType, tracks: SequenceTrack[]): string {
  const n = tracks.filter((t) => t.type === type).length + 1;
  return `${type === "video" ? "V" : "A"}${n}`;
}


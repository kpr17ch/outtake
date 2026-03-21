#!/bin/bash
#
# probe-segment.sh — Extract detailed frame-by-frame info for a video segment
#
# Usage: ./probe-segment.sh <input_video> <start_time> <end_time> [output_dir]
#
# Used to refine timestamps before cutting. Extracts:
#   - Keyframe positions (I-frames) in the segment
#   - Frame-by-frame images (every 0.5s) for visual inspection
#   - Audio waveform data for the segment
#
# This helps the agent find the exact best cut points within a rough range.

set -euo pipefail

INPUT="$1"
START="$2"
END="$3"
OUTPUT_DIR="${4:-probe_output}"

if [ -z "$INPUT" ] || [ -z "$START" ] || [ -z "$END" ]; then
  echo "Usage: $0 <input_video> <start_time> <end_time> [output_dir]"
  echo "  Times can be: HH:MM:SS.mmm or seconds (e.g., 65.5)"
  exit 1
fi

mkdir -p "$OUTPUT_DIR/frames"

# Calculate duration
DURATION=$(python3 -c "
def parse_time(t):
    if ':' in t:
        parts = t.split(':')
        return int(parts[0])*3600 + int(parts[1])*60 + float(parts[2])
    return float(t)
print(f'{parse_time(\"$END\") - parse_time(\"$START\"):.3f}')
")

echo "[probe] Probing segment: $START → $END (${DURATION}s)"

# ─────────────────────────────────────────────
# 1. Extract frames every 0.5s for visual inspection
# ─────────────────────────────────────────────
echo "[probe] Extracting frames (every 0.5s)..."
ffmpeg -y -hide_banner -loglevel warning \
  -ss "$START" -i "$INPUT" -t "$DURATION" \
  -vf "fps=2,scale=480:-2" \
  -q:v 3 \
  "$OUTPUT_DIR/frames/frame_%04d.jpg" 2>/dev/null || true

FRAME_COUNT=$(find "$OUTPUT_DIR/frames" -name "*.jpg" 2>/dev/null | wc -l | tr -d ' ')
echo "[probe] Extracted $FRAME_COUNT frames"

# Generate frame index with precise timestamps
python3 -c "
import json, os, glob

start_sec = 0
frames = sorted(glob.glob('$OUTPUT_DIR/frames/frame_*.jpg'))
index = []
for i, f in enumerate(frames):
    ts = i * 0.5
    index.append({
        'frame': os.path.basename(f),
        'offset_sec': round(ts, 1),
        'absolute_timecode': '$START'
    })

with open('$OUTPUT_DIR/frames/index.json', 'w') as f:
    json.dump(index, f, indent=2)
" 2>/dev/null

# ─────────────────────────────────────────────
# 2. Find keyframe (I-frame) positions
# ─────────────────────────────────────────────
echo "[probe] Finding keyframe positions..."
ffprobe -v quiet -select_streams v:0 \
  -show_entries frame=pts_time,pict_type,key_frame \
  -read_intervals "$START%+$DURATION" \
  -of json "$INPUT" 2>/dev/null | python3 -c "
import json, sys

data = json.load(sys.stdin)
frames = data.get('frames', [])
keyframes = [
    {'pts_time': float(f['pts_time']), 'type': f.get('pict_type', '?')}
    for f in frames
    if f.get('key_frame') == 1 or f.get('pict_type') == 'I'
]

with open('$OUTPUT_DIR/keyframes.json', 'w') as out:
    json.dump(keyframes, out, indent=2)

print(f'[probe] Found {len(keyframes)} keyframes in segment')
for kf in keyframes:
    print(f'  I-frame at {kf[\"pts_time\"]:.3f}s')
" 2>/dev/null || echo "[probe] Keyframe detection skipped"

# ─────────────────────────────────────────────
# 3. Audio energy for the segment
# ─────────────────────────────────────────────
echo "[probe] Analyzing segment audio..."
ffmpeg -y -hide_banner -loglevel warning \
  -ss "$START" -i "$INPUT" -t "$DURATION" \
  -af "astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=$OUTPUT_DIR/audio_raw.txt" \
  -f null - 2>/dev/null || true

if [ -f "$OUTPUT_DIR/audio_raw.txt" ]; then
  python3 -c "
import json, re

entries = []
current_ts = None
with open('$OUTPUT_DIR/audio_raw.txt') as f:
    for line in f:
        line = line.strip()
        ts_match = re.match(r'frame:.*pts_time:([0-9.]+)', line)
        val_match = re.match(r'lavfi\.astats\.Overall\.RMS_level=(-?[0-9.inf]+)', line)
        if ts_match:
            current_ts = float(ts_match.group(1))
        elif val_match and current_ts is not None:
            val = val_match.group(1)
            db = -100.0 if val in ('-inf', 'inf') else float(val)
            entries.append({'offset_sec': round(current_ts, 2), 'db': round(db, 1)})
            current_ts = None

with open('$OUTPUT_DIR/audio_energy.json', 'w') as f:
    json.dump(entries, f, indent=2)

loud = [e for e in entries if e['db'] > -30]
quiet = [e for e in entries if e['db'] <= -40]
print(f'[probe] Audio: {len(entries)} samples, {len(loud)} loud, {len(quiet)} quiet')
" 2>/dev/null
  rm -f "$OUTPUT_DIR/audio_raw.txt"
fi

echo "[probe] Segment probe complete: $OUTPUT_DIR"

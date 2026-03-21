#!/bin/bash
#
# execute-cuts.sh — Execute a cut plan JSON with FFmpeg
#
# Usage: ./execute-cuts.sh <cut_plan.json> [output_dir]
#
# Reads a cut plan and:
#   1. Extracts each clip with frame-accurate seeking
#   2. Re-encodes clips to uniform format for clean concatenation
#   3. Concatenates all clips in order
#   4. Normalizes audio to target LUFS
#   5. Outputs final video
#
# The cut plan JSON must have this structure:
# {
#   "project": "name",
#   "source_files": ["raw/input.mp4"],
#   "output_format": "16:9" | "9:16" | "1:1",
#   "target_duration_sec": 60,
#   "clips": [
#     { "id": "clip-1", "source": "raw/input.mp4", "start": "00:01:23.400", "end": "00:01:45.200" }
#   ],
#   "transitions": [
#     { "between": ["clip-1", "clip-2"], "type": "cut" | "crossfade", "duration": 0.5 }
#   ],
#   "audio": { "normalize_lufs": -14 }
# }

set -euo pipefail

PLAN="$1"
OUTPUT_DIR="${2:-output}"

if [ -z "$PLAN" ] || [ ! -f "$PLAN" ]; then
  echo "[cut] Error: Cut plan not found: $PLAN"
  exit 1
fi

PROJECT=$(python3 -c "import json; print(json.load(open('$PLAN'))['project'])")
CLIP_COUNT=$(python3 -c "import json; print(len(json.load(open('$PLAN'))['clips']))")
OUTPUT_FORMAT=$(python3 -c "import json; p=json.load(open('$PLAN')); print(p.get('output_format', '16:9'))")
NORMALIZE_LUFS=$(python3 -c "import json; p=json.load(open('$PLAN')); print(p.get('audio', {}).get('normalize_lufs', -14))")

echo "[cut] Project: $PROJECT"
echo "[cut] Clips: $CLIP_COUNT"
echo "[cut] Output format: $OUTPUT_FORMAT"
echo "[cut] Audio normalization: ${NORMALIZE_LUFS} LUFS"

# Create temp working directory
WORK_DIR=$(mktemp -d)
trap 'rm -rf "$WORK_DIR"' EXIT
mkdir -p "$OUTPUT_DIR"

# ─────────────────────────────────────────────
# Determine output resolution & filter based on format
# ─────────────────────────────────────────────
case "$OUTPUT_FORMAT" in
  "9:16")
    # Vertical: 1080x1920
    SCALE_FILTER="scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black"
    OUT_W=1080
    OUT_H=1920
    ;;
  "1:1")
    # Square: 1080x1080
    SCALE_FILTER="scale=1080:1080:force_original_aspect_ratio=decrease,pad=1080:1080:(ow-iw)/2:(oh-ih)/2:black"
    OUT_W=1080
    OUT_H=1080
    ;;
  *)
    # Landscape: 1920x1080 (default)
    SCALE_FILTER="scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black"
    OUT_W=1920
    OUT_H=1080
    ;;
esac

# ─────────────────────────────────────────────
# Step 1: Extract each clip with frame-accurate cutting
# ─────────────────────────────────────────────
echo "[cut] Extracting clips..."

CONCAT_LIST="$WORK_DIR/concat.txt"
> "$CONCAT_LIST"

for i in $(seq 0 $((CLIP_COUNT - 1))); do
  CLIP_ID=$(python3 -c "import json; print(json.load(open('$PLAN'))['clips'][$i]['id'])")
  SOURCE=$(python3 -c "import json; print(json.load(open('$PLAN'))['clips'][$i]['source'])")
  START=$(python3 -c "import json; print(json.load(open('$PLAN'))['clips'][$i]['start'])")
  END=$(python3 -c "import json; print(json.load(open('$PLAN'))['clips'][$i]['end'])")

  CLIP_FILE="$WORK_DIR/${CLIP_ID}.mp4"

  echo "[cut]   $CLIP_ID: $SOURCE [$START → $END]"

  # Frame-accurate extraction with re-encode
  # -ss before -i for fast seek, then -ss 0 -to with duration for precision
  # Using -accurate_seek (default) with input seeking for best balance
  DURATION=$(python3 -c "
import sys
def tc_to_sec(tc):
    parts = tc.split(':')
    h, m = int(parts[0]), int(parts[1])
    s = float(parts[2])
    return h * 3600 + m * 60 + s
start = tc_to_sec('$START')
end = tc_to_sec('$END')
print(f'{end - start:.3f}')
")

  ffmpeg -y -hide_banner -loglevel warning \
    -ss "$START" -i "$SOURCE" \
    -t "$DURATION" \
    -vf "$SCALE_FILTER" \
    -c:v libx264 -preset fast -crf 18 \
    -c:a aac -b:a 192k -ar 48000 -ac 2 \
    -movflags +faststart \
    -avoid_negative_ts make_zero \
    -async 1 \
    "$CLIP_FILE"

  echo "file '${CLIP_FILE}'" >> "$CONCAT_LIST"
done

echo "[cut] All clips extracted"

# ─────────────────────────────────────────────
# Step 2: Check for crossfade transitions
# ─────────────────────────────────────────────
HAS_CROSSFADE=$(python3 -c "
import json
p = json.load(open('$PLAN'))
transitions = p.get('transitions', [])
has = any(t.get('type') == 'crossfade' for t in transitions)
print('yes' if has else 'no')
")

if [ "$HAS_CROSSFADE" = "yes" ]; then
  echo "[cut] Applying crossfade transitions..."

  # Build complex filter for crossfades
  python3 << 'PYEOF' > "$WORK_DIR/crossfade_cmd.sh"
import json, subprocess, sys, os

plan = json.load(open(os.environ['PLAN']))
clips = plan['clips']
transitions = {tuple(t['between']): t for t in plan.get('transitions', []) if t.get('type') == 'crossfade'}
work_dir = os.environ['WORK_DIR']
output_dir = os.environ['OUTPUT_DIR']
project = plan['project']

if not transitions:
    sys.exit(0)

# For crossfades we need to use xfade filter
inputs = []
for clip in clips:
    inputs.extend(['-i', f"{work_dir}/{clip['id']}.mp4"])

# Build xfade filter chain
filter_parts = []
n = len(clips)

# Calculate clip durations
durations = []
for clip in clips:
    result = subprocess.run(
        ['ffprobe', '-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0',
         f"{work_dir}/{clip['id']}.mp4"],
        capture_output=True, text=True
    )
    durations.append(float(result.stdout.strip()))

# Build xfade chain
current_offset = 0
prev_label = "[0:v]"
prev_alabel = "[0:a]"
vid_filters = []
aud_filters = []

for i in range(1, n):
    pair = (clips[i-1]['id'], clips[i]['id'])
    trans = transitions.get(pair, {})
    xfade_dur = trans.get('duration', 0.5)

    current_offset += durations[i-1] - xfade_dur
    out_label = f"[v{i}]" if i < n-1 else "[vout]"
    aout_label = f"[a{i}]" if i < n-1 else "[aout]"

    vid_filters.append(f"{prev_label}[{i}:v]xfade=transition=fade:duration={xfade_dur}:offset={current_offset:.3f}{out_label}")
    aud_filters.append(f"{prev_alabel}[{i}:a]acrossfade=d={xfade_dur}{aout_label}")

    prev_label = out_label
    prev_alabel = aout_label

filter_complex = ";".join(vid_filters + aud_filters)

cmd = ['ffmpeg', '-y', '-hide_banner', '-loglevel', 'warning']
cmd.extend(inputs)
cmd.extend([
    '-filter_complex', filter_complex,
    '-map', '[vout]', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
    '-c:a', 'aac', '-b:a', '192k',
    '-movflags', '+faststart',
    f"{work_dir}/concatenated.mp4"
])

print(" ".join(f"'{c}'" if ' ' in c else c for c in cmd))
PYEOF

  PLAN="$PLAN" WORK_DIR="$WORK_DIR" OUTPUT_DIR="$OUTPUT_DIR" \
    bash "$WORK_DIR/crossfade_cmd.sh" 2>/dev/null && \
    echo "[cut] Crossfade transitions applied" || \
    echo "[cut] Crossfade failed, falling back to hard cuts"
fi

# ─────────────────────────────────────────────
# Step 3: Concatenate clips (if no crossfade or crossfade failed)
# ─────────────────────────────────────────────
if [ ! -f "$WORK_DIR/concatenated.mp4" ]; then
  echo "[cut] Concatenating $CLIP_COUNT clips..."

  ffmpeg -y -hide_banner -loglevel warning \
    -f concat -safe 0 -i "$CONCAT_LIST" \
    -c copy \
    -movflags +faststart \
    "$WORK_DIR/concatenated.mp4"

  echo "[cut] Concatenation complete"
fi

# ─────────────────────────────────────────────
# Step 4: Normalize audio (two-pass loudnorm)
# ─────────────────────────────────────────────
echo "[cut] Normalizing audio to ${NORMALIZE_LUFS} LUFS (two-pass)..."

# Pass 1: Measure
LOUDNORM_STATS=$(ffmpeg -hide_banner -i "$WORK_DIR/concatenated.mp4" \
  -af "loudnorm=I=${NORMALIZE_LUFS}:TP=-1.5:LRA=11:print_format=json" \
  -f null - 2>&1 | python3 -c "
import sys, json
lines = sys.stdin.read()
# Find the JSON block from loudnorm output
start = lines.rfind('{')
end = lines.rfind('}') + 1
if start >= 0 and end > start:
    stats = json.loads(lines[start:end])
    print(json.dumps(stats))
else:
    print('{}')
")

if [ -n "$LOUDNORM_STATS" ] && [ "$LOUDNORM_STATS" != "{}" ]; then
  INPUT_I=$(echo "$LOUDNORM_STATS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('input_i', '-24'))")
  INPUT_TP=$(echo "$LOUDNORM_STATS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('input_tp', '-2'))")
  INPUT_LRA=$(echo "$LOUDNORM_STATS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('input_lra', '7'))")
  INPUT_THRESH=$(echo "$LOUDNORM_STATS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('input_thresh', '-34'))")

  # Pass 2: Apply with measured values
  ffmpeg -y -hide_banner -loglevel warning \
    -i "$WORK_DIR/concatenated.mp4" \
    -af "loudnorm=I=${NORMALIZE_LUFS}:TP=-1.5:LRA=11:measured_I=${INPUT_I}:measured_TP=${INPUT_TP}:measured_LRA=${INPUT_LRA}:measured_thresh=${INPUT_THRESH}:linear=true" \
    -c:v copy \
    -c:a aac -b:a 192k \
    -movflags +faststart \
    "$WORK_DIR/normalized.mp4"

  echo "[cut] Audio normalized"
else
  echo "[cut] Loudnorm measurement failed, copying without normalization"
  cp "$WORK_DIR/concatenated.mp4" "$WORK_DIR/normalized.mp4"
fi

# ─────────────────────────────────────────────
# Step 5: Move to output
# ─────────────────────────────────────────────
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
OUTPUT_FILE="$OUTPUT_DIR/${PROJECT}_${TIMESTAMP}.mp4"
cp "$WORK_DIR/normalized.mp4" "$OUTPUT_FILE"

# ─────────────────────────────────────────────
# Step 6: Verify output
# ─────────────────────────────────────────────
echo ""
echo "[cut] ═══════════════════════════════════════"
echo "[cut] Output: $OUTPUT_FILE"
FINAL_DURATION=$(ffprobe -v quiet -show_entries format=duration -of csv=p=0 "$OUTPUT_FILE" | head -1)
FINAL_SIZE=$(du -h "$OUTPUT_FILE" | cut -f1)
FINAL_RES=$(ffprobe -v quiet -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "$OUTPUT_FILE" | head -1)
echo "[cut] Duration: ${FINAL_DURATION}s"
echo "[cut] Resolution: $FINAL_RES"
echo "[cut] Size: $FINAL_SIZE"
echo "[cut] ═══════════════════════════════════════"
echo "[cut] Done!"

#!/bin/bash
#
# analyze-video.sh — Extract rich context from a video file
#
# Usage: ./analyze-video.sh <input_video> <output_dir>
#
# Creates:
#   output_dir/
#     metadata.json      — ffprobe metadata
#     keyframes/         — one frame every 3 seconds
#     scenes/            — frames at scene changes
#     audio_energy.json  — loudness per second
#     analysis.json      — combined summary for the AI agent
#

set -euo pipefail

INPUT="$1"
OUTPUT_DIR="$2"

if [ -z "$INPUT" ] || [ -z "$OUTPUT_DIR" ]; then
  echo "Usage: $0 <input_video> <output_dir>"
  exit 1
fi

if [ ! -f "$INPUT" ]; then
  echo "Error: File not found: $INPUT"
  exit 1
fi

FILENAME=$(basename "$INPUT")
echo "[analyze] Starting analysis of: $FILENAME"

# Create output directories
mkdir -p "$OUTPUT_DIR/keyframes"
mkdir -p "$OUTPUT_DIR/scenes"

# ─────────────────────────────────────────────
# 1. Metadata via ffprobe
# ─────────────────────────────────────────────
echo "[analyze] Extracting metadata..."
ffprobe -v quiet -print_format json -show_format -show_streams "$INPUT" > "$OUTPUT_DIR/metadata.json"

# Extract key values for summary
DURATION=$(ffprobe -v quiet -show_entries format=duration -of csv=p=0 "$INPUT" | head -1)
RESOLUTION=$(ffprobe -v quiet -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "$INPUT" 2>/dev/null | head -1)
FPS=$(ffprobe -v quiet -select_streams v:0 -show_entries stream=r_frame_rate -of csv=p=0 "$INPUT" 2>/dev/null | head -1)
CODEC=$(ffprobe -v quiet -select_streams v:0 -show_entries stream=codec_name -of csv=p=0 "$INPUT" 2>/dev/null | head -1)
AUDIO_CODEC=$(ffprobe -v quiet -select_streams a:0 -show_entries stream=codec_name -of csv=p=0 "$INPUT" 2>/dev/null | head -1)
AUDIO_CHANNELS=$(ffprobe -v quiet -select_streams a:0 -show_entries stream=channels -of csv=p=0 "$INPUT" 2>/dev/null | head -1)

echo "[analyze] Duration: ${DURATION}s, Resolution: $RESOLUTION, FPS: $FPS"

# Check if file has video stream
HAS_VIDEO=$(ffprobe -v quiet -select_streams v:0 -show_entries stream=codec_type -of csv=p=0 "$INPUT" 2>/dev/null | head -1)

# ─────────────────────────────────────────────
# 2. Keyframes every 3 seconds (video only)
# ─────────────────────────────────────────────
KEYFRAME_COUNT=0
if [ -n "$HAS_VIDEO" ]; then
  echo "[analyze] Extracting keyframes (every 3s)..."
  ffmpeg -v quiet -i "$INPUT" \
    -vf "fps=1/3,scale=640:-2" \
    -q:v 3 \
    "$OUTPUT_DIR/keyframes/frame_%04d.jpg" \
    -y 2>/dev/null || true

  KEYFRAME_COUNT=$(find "$OUTPUT_DIR/keyframes" -name "*.jpg" 2>/dev/null | wc -l | tr -d ' ')
  echo "[analyze] Extracted $KEYFRAME_COUNT keyframes"
else
  echo "[analyze] No video stream — skipping keyframe extraction"
  echo "[]" > "$OUTPUT_DIR/keyframes/index.json"
fi

# Generate keyframe index with timestamps (only if we have keyframes)
if [ "$KEYFRAME_COUNT" -gt 0 ] 2>/dev/null; then
  KEYFRAME_INDEX="$OUTPUT_DIR/keyframes/index.json"
  echo "[" > "$KEYFRAME_INDEX"
  FIRST=true
  for f in "$OUTPUT_DIR/keyframes/"frame_*.jpg; do
    [ -f "$f" ] || continue
    NUM=$(basename "$f" | sed 's/frame_0*\([0-9]*\)\.jpg/\1/')
    TIMESTAMP=$(echo "($NUM - 1) * 3" | bc)
    MINUTES=$(echo "$TIMESTAMP / 60" | bc)
    SECONDS=$(echo "$TIMESTAMP % 60" | bc)
    TC=$(printf "%02d:%02d:%02d" 0 "$MINUTES" "$SECONDS")
    if [ "$FIRST" = true ]; then
      FIRST=false
    else
      echo "," >> "$KEYFRAME_INDEX"
    fi
    printf '  {"frame": "%s", "timestamp_sec": %s, "timecode": "%s"}' "$(basename "$f")" "$TIMESTAMP" "$TC" >> "$KEYFRAME_INDEX"
  done
  echo "" >> "$KEYFRAME_INDEX"
  echo "]" >> "$KEYFRAME_INDEX"
fi

# ─────────────────────────────────────────────
# 3. Scene change detection (video only)
# ─────────────────────────────────────────────
SCENE_COUNT=0
SCENE_TIMESTAMPS=""
if [ -n "$HAS_VIDEO" ]; then
  echo "[analyze] Detecting scene changes..."

  # Detect scene changes and save timestamps
  SCENE_TIMESTAMPS=$(ffmpeg -v quiet -i "$INPUT" \
    -vf "select='gt(scene,0.3)',showinfo" \
    -vsync vfq \
    -f null - 2>&1 | grep "showinfo" | sed -n 's/.*pts_time:\([0-9.]*\).*/\1/p' || true)

  # Extract scene change frames
  ffmpeg -v quiet -i "$INPUT" \
    -vf "select='gt(scene,0.3)',scale=640:-2" \
    -vsync vfq \
    -q:v 3 \
    "$OUTPUT_DIR/scenes/scene_%04d.jpg" \
    -y 2>/dev/null || true

  SCENE_COUNT=$(find "$OUTPUT_DIR/scenes" -name "*.jpg" 2>/dev/null | wc -l | tr -d ' ')
  echo "[analyze] Detected $SCENE_COUNT scene changes"
else
  echo "[analyze] No video stream — skipping scene detection"
  echo "[]" > "$OUTPUT_DIR/scenes/index.json"
fi

# Generate scene index (only if we have scenes)
if [ "$SCENE_COUNT" -gt 0 ] 2>/dev/null; then
  SCENE_INDEX="$OUTPUT_DIR/scenes/index.json"
  echo "[" > "$SCENE_INDEX"
  FIRST=true
  IDX=1
  for ts in $SCENE_TIMESTAMPS; do
    MINUTES=$(echo "$ts / 60" | bc)
    SECONDS=$(printf "%.0f" $(echo "$ts - $MINUTES * 60" | bc))
    TC=$(printf "%02d:%02d:%02d" 0 "$MINUTES" "$SECONDS")
    FNAME=$(printf "scene_%04d.jpg" "$IDX")
    if [ "$FIRST" = true ]; then
      FIRST=false
    else
      echo "," >> "$SCENE_INDEX"
    fi
    printf '  {"frame": "%s", "timestamp_sec": %.2f, "timecode": "%s"}' "$FNAME" "$ts" "$TC" >> "$SCENE_INDEX"
    IDX=$((IDX + 1))
  done
  echo "" >> "$SCENE_INDEX"
  echo "]" >> "$SCENE_INDEX"
fi

# ─────────────────────────────────────────────
# 4. Audio energy analysis (loudness per second)
# ─────────────────────────────────────────────
echo "[analyze] Analyzing audio energy..."

# Use astats filter to get RMS level per second
ffmpeg -v quiet -i "$INPUT" \
  -af "astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=$OUTPUT_DIR/audio_raw.txt" \
  -f null - 2>/dev/null || true

# Parse into JSON array
if [ -f "$OUTPUT_DIR/audio_raw.txt" ]; then
  python3 -c "
import json, re, sys

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
            if val == '-inf' or val == 'inf':
                db = -100.0
            else:
                db = float(val)
            entries.append({'t': round(current_ts, 1), 'db': round(db, 1)})
            current_ts = None

# Downsample to 1 per second
by_sec = {}
for e in entries:
    sec = int(e['t'])
    if sec not in by_sec or e['db'] > by_sec[sec]['db']:
        by_sec[sec] = e

result = sorted(by_sec.values(), key=lambda x: x['t'])

# Find peaks (top 10% loudest moments)
if result:
    sorted_by_db = sorted(result, key=lambda x: x['db'], reverse=True)
    top_count = max(1, len(sorted_by_db) // 10)
    peak_times = set(e['t'] for e in sorted_by_db[:top_count])
    for e in result:
        e['is_peak'] = e['t'] in peak_times

with open('$OUTPUT_DIR/audio_energy.json', 'w') as f:
    json.dump(result, f, indent=2)

print(f'[analyze] Audio energy: {len(result)} data points, {sum(1 for e in result if e.get(\"is_peak\"))} peaks')
" 2>/dev/null || echo "[analyze] Audio energy extraction skipped (no audio track)"
  rm -f "$OUTPUT_DIR/audio_raw.txt"
else
  echo "[]" > "$OUTPUT_DIR/audio_energy.json"
  echo "[analyze] No audio track found"
fi

# ─────────────────────────────────────────────
# 5. Silence/pause detection
# ─────────────────────────────────────────────
echo "[analyze] Detecting silences..."
SILENCES=$(ffmpeg -v quiet -i "$INPUT" \
  -af "silencedetect=noise=-30dB:d=1.0" \
  -f null - 2>&1 | grep "silence_" || true)

python3 -c "
import json, re, sys

silences = []
starts = []
text = '''$SILENCES'''

for line in text.split('\n'):
    start_match = re.search(r'silence_start: ([0-9.]+)', line)
    end_match = re.search(r'silence_end: ([0-9.]+).*silence_duration: ([0-9.]+)', line)
    if start_match:
        starts.append(float(start_match.group(1)))
    elif end_match and starts:
        s = starts.pop(0)
        e = float(end_match.group(1))
        d = float(end_match.group(2))
        silences.append({
            'start': round(s, 2),
            'end': round(e, 2),
            'duration': round(d, 2)
        })

with open('$OUTPUT_DIR/silences.json', 'w') as f:
    json.dump(silences, f, indent=2)

print(f'[analyze] Found {len(silences)} silent segments')
" 2>/dev/null || echo "[]" > "$OUTPUT_DIR/silences.json"

# ─────────────────────────────────────────────
# 6. Combined analysis summary
# ─────────────────────────────────────────────
echo "[analyze] Generating summary..."

python3 -c "
import json

metadata = {}
try:
    with open('$OUTPUT_DIR/metadata.json') as f:
        metadata = json.load(f)
except: pass

keyframes = []
try:
    with open('$OUTPUT_DIR/keyframes/index.json') as f:
        keyframes = json.load(f)
except: pass

scenes = []
try:
    with open('$OUTPUT_DIR/scenes/index.json') as f:
        scenes = json.load(f)
except: pass

audio = []
try:
    with open('$OUTPUT_DIR/audio_energy.json') as f:
        audio = json.load(f)
except: pass

silences = []
try:
    with open('$OUTPUT_DIR/silences.json') as f:
        silences = json.load(f)
except: pass

peaks = [e for e in audio if e.get('is_peak')]

summary = {
    'source_file': '$FILENAME',
    'duration_sec': float('${DURATION}' or 0),
    'resolution': '${RESOLUTION}'.replace(',', 'x') if '${RESOLUTION}' else 'unknown',
    'fps': '${FPS}',
    'video_codec': '${CODEC}',
    'audio_codec': '${AUDIO_CODEC}',
    'audio_channels': '${AUDIO_CHANNELS}',
    'keyframe_count': len(keyframes),
    'scene_change_count': len(scenes),
    'scene_changes': scenes,
    'audio_peaks': peaks[:20],
    'silences': silences,
    'keyframes_dir': 'keyframes/',
    'scenes_dir': 'scenes/',
}

with open('$OUTPUT_DIR/analysis.json', 'w') as f:
    json.dump(summary, f, indent=2)

print('[analyze] Summary written to analysis.json')
print(f'[analyze] Done! {len(keyframes)} keyframes, {len(scenes)} scenes, {len(peaks)} audio peaks, {len(silences)} silences')
"

echo "[analyze] Analysis complete: $OUTPUT_DIR"

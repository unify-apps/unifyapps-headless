#!/bin/bash
# Turns a screen recording into evidence: frames at a fixed rate plus a timeline of every visible change.
# usage: frames.sh <video.mp4> <outdir> [fps=10] [threshold=0.004]
#   <outdir>/f-<seconds>.png   one frame per 1/fps second, named by its time
#   <outdir>/changes.txt       "t=<seconds> score=<0..1>" for each frame that differs from the one before
# A tap's response time is the first change after the tap; "settled" is the last change of the burst.
# A short spike that reverts (blank, flash) shows as two big scores close together.
set -euo pipefail
VIDEO="$1"; OUT="$2"; FPS="${3:-10}"; THRESHOLD="${4:-0.004}"
mkdir -p "$OUT"
ffmpeg -loglevel error -y -i "$VIDEO" -vf "fps=$FPS,scale=iw/2:-1" -frame_pts 1 "$OUT/raw-%06d.png"
for FRAME in "$OUT"/raw-*.png; do
  INDEX=$((10#$(basename "$FRAME" .png | sed 's/raw-//')))
  mv "$FRAME" "$OUT/f-$(awk -v index_="$INDEX" -v fps="$FPS" 'BEGIN{printf "%07.2f", index_/fps}').png"
done
ffmpeg -loglevel info -i "$VIDEO" -vf "select='gt(scene,$THRESHOLD)',metadata=print" -an -f null - 2>&1 \
  | awk '/pts_time/{match($0,/pts_time:[0-9.]+/); t=substr($0,RSTART+9,RLENGTH-9)} /scene_score/{split($0,kv,"="); printf "t=%.3f score=%.4f\n", t, kv[2]}' \
  > "$OUT/changes.txt"
echo "frames: $(ls "$OUT"/f-*.png | wc -l | tr -d ' ')  changes: $(wc -l < "$OUT/changes.txt" | tr -d ' ')  -> $OUT"

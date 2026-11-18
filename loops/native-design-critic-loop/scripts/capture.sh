#!/bin/bash
# One call per capture: full-resolution screenshot, verbatim describe tree and (optionally) layout.json.
# usage: capture.sh --udid <id> --out <path-without-extension> --screen <W>x<H> [--platform ios|android] [--layout] [--burst 0,1,3]
#   --screen is in points (iOS) or dp (Android), never pixels.
#   --burst takes small screenshots <out>-t<sec>.png at those seconds after the call starts, then the settled full-res capture.
set -euo pipefail
SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PLATFORM=ios; LAYOUT=0; BURST=""
while [ $# -gt 0 ]; do
  case "$1" in
    --udid) UDID="$2"; shift 2 ;;
    --out) OUT="$2"; shift 2 ;;
    --screen) SCREEN="$2"; shift 2 ;;
    --platform) PLATFORM="$2"; shift 2 ;;
    --layout) LAYOUT=1; shift ;;
    --burst) BURST="$2"; shift 2 ;;
    *) echo "unknown flag $1" >&2; exit 2 ;;
  esac
done
: "${UDID:?--udid required}" "${OUT:?--out required}" "${SCREEN:?--screen required (points/dp)}"
mkdir -p "$(dirname "$OUT")"

if [ -n "$BURST" ]; then
  START=$(date +%s)
  for SEC in ${BURST//,/ }; do
    while [ $(( $(date +%s) - START )) -lt "$SEC" ]; do sleep 0.2; done
    argent run screenshot --udid "$UDID" --scale 0.4 --out "$OUT-t$SEC.png" >/dev/null 2>&1 || echo "burst t$SEC failed" >&2
  done
fi

argent run screenshot --udid "$UDID" --scale 1 --out "$OUT.png" >/dev/null
argent run describe --udid "$UDID" --json \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);process.stdout.write((j.description??j.result?.description??JSON.stringify(j))+"\n")})' \
  > "$OUT.txt"
[ "$LAYOUT" = 1 ] && node "$SKILL_DIR/scripts/layout.mjs" "$OUT.txt" --screen "$SCREEN" --platform "$PLATFORM" > "$(dirname "$OUT")/layout.json"
echo "saved $OUT.png $OUT.txt ($(wc -l < "$OUT.txt") tree lines)"

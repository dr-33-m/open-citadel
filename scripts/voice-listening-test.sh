#!/usr/bin/env bash
#
# The listening test, and a probe of what each maker really sends back.
#
# Reads the same two paragraphs through every cloud voice model, in its default
# voice, straight from OpenRouter with YOUR key (not the server's), and writes
# one mp3 per model to a folder so they can be heard side by side.
#
# It also answers the questions the build could not, because it had no key:
#
#   1. What content type and sample rate each maker's PCM reply carries.
#      The app plays PCM at the rate the server reads from this header; a
#      maker that says nothing is assumed to be 24 kHz mono.
#   2. Whether OpenRouter's generation record reports a cost for speech
#      (X-Generation-Id, then GET /api/v1/generation). If it never does, every
#      piece is charged at the listed price instead of the real one.
#   3. Whether each maker takes `speed`. Only Kokoro is marked as taking it;
#      a 400 here for one marked true means turning it off.
#
# Costs a few cents. Usage (prefix with a space to keep the key out of history):
#    OPENROUTER_API_KEY='sk-or-...' ./scripts/voice-listening-test.sh [folder]
set -euo pipefail

[ -n "${OPENROUTER_API_KEY:-}" ] || { echo "Set OPENROUTER_API_KEY to your own key." >&2; exit 1; }

OUT_DIR="${1:-listening-test/$(date +%Y%m%d-%H%M%S)}"
mkdir -p "$OUT_DIR"
API="https://openrouter.ai/api/v1"

PASSAGE="The house stood at the end of a long lane, and in the evenings the light came through the elms in long gold bars. Nobody had lived there for years, and yet the garden was kept, the gate was oiled, and on the kitchen table there was always a loaf of bread that had not been there the day before.

She read the letter twice before she understood it. Then she folded it along its old creases, put it in the drawer with the others, and went out to stand by the gate until it was too dark to see the road."

SENTENCE="She read the letter twice before she understood it."

# id, default voice
MODELS=(
  "hexgrad/kokoro-82m af_heart"
  "google/gemini-3.8-flash-lite-tts Kore"
  "google/gemini-3.8-flash-tts Kore"
  "elevenlabs/eleven-v4-turbo george"
  "elevenlabs/eleven-v4 george"
)

body() { # <model> <voice> <text> <format> [speed]
  python3 -c '
import json, sys
model, voice, text, fmt = sys.argv[1:5]
body = {"model": model, "voice": voice, "input": text, "response_format": fmt, "provider": {"zdr": True}}
if len(sys.argv) > 5:
    body["speed"] = float(sys.argv[5])
print(json.dumps(body))' "$@"
}

speak() { # <out file> <headers file> <json body>
  curl -s -o "$1" -D "$2" -w '%{http_code}' -X POST "$API/audio/speech" \
    -H "Authorization: Bearer $OPENROUTER_API_KEY" -H 'Content-Type: application/json' -d "$3"
}

header() { # <headers file> <name>
  grep -i "^$2:" "$1" | tail -1 | cut -d' ' -f2- | tr -d '\r' || true
}

for entry in "${MODELS[@]}"; do
  read -r MODEL VOICE <<<"$entry"
  NAME="${MODEL//\//_}"
  echo "== $MODEL ($VOICE)"

  code=$(speak "$OUT_DIR/$NAME.mp3" "$OUT_DIR/$NAME.mp3.headers" "$(body "$MODEL" "$VOICE" "$PASSAGE" mp3)")
  echo "  passage, mp3:  HTTP $code, $(wc -c <"$OUT_DIR/$NAME.mp3") bytes -> $OUT_DIR/$NAME.mp3"

  code=$(speak "$OUT_DIR/$NAME.pcm" "$OUT_DIR/$NAME.pcm.headers" "$(body "$MODEL" "$VOICE" "$SENTENCE" pcm)")
  CT=$(header "$OUT_DIR/$NAME.pcm.headers" content-type)
  GEN=$(header "$OUT_DIR/$NAME.pcm.headers" x-generation-id)
  BYTES=$(wc -c <"$OUT_DIR/$NAME.pcm")
  echo "  sentence, pcm: HTTP $code, $BYTES bytes, Content-Type: ${CT:-none}"
  echo "                 X-Generation-Id: ${GEN:-none}"

  if [ -n "$GEN" ]; then
    COST=""
    for wait in 1 2 4 8; do
      sleep "$wait"
      COST=$(curl -s "$API/generation?id=$GEN" -H "Authorization: Bearer $OPENROUTER_API_KEY" \
        | python3 -c 'import json,sys
try:
    d = json.load(sys.stdin).get("data") or {}
    print(d.get("total_cost", ""))
except Exception:
    print("")')
      [ -n "$COST" ] && break
    done
    CHARS=${#SENTENCE}
    echo "  cost lookup:   total_cost=${COST:-NOT REPORTED} for $CHARS characters"
  fi

  code=$(speak /dev/null "$OUT_DIR/$NAME.speed.headers" "$(body "$MODEL" "$VOICE" "$SENTENCE" pcm 1.25)")
  echo "  speed 1.25:    HTTP $code (200 means taken or ignored; listen to $NAME.speed.mp3 to tell)"
  speak "$OUT_DIR/$NAME.speed.mp3" /dev/null "$(body "$MODEL" "$VOICE" "$SENTENCE" mp3 1.25)" >/dev/null
  echo
done

echo "Done. The files are in $OUT_DIR. A PCM file can be played with:"
echo "  ffplay -f s16le -ar <rate> -ch_layout mono $OUT_DIR/<model>.pcm"

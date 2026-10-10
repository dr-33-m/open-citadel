#!/usr/bin/env bash
#
# Have Samwell Cloud read one short sample in every cloud voice.
#
# The server makes them itself, with its own OpenRouter key, and keeps them on
# the data volume beside the database (VOICE_SAMPLES_DIR, /data/voice-samples
# in the container), so nothing is uploaded from here. It skips any voice that
# already has a sample; pass --force to make them all again.
#
# Costs the house a few cents in total (about 140 voices, a sentence each),
# once. Readers trying voices afterwards cost nothing: the samples are served
# as files by GET /tts/samples/<model>/<voice>, with no sign-in. MP3 where the
# maker makes it; WAV for a maker that answers PCM alone (Gemini). Run
# register-cloud-voices.sh first after a format change, since the run asks
# each maker for what the catalogue says it takes.
#
# Usage:
#    ADMIN_API_KEY='...' ./scripts/generate-voice-samples.sh [--force]
set -euo pipefail

if [ -z "${ADMIN_API_KEY:-}" ]; then
  printf 'ADMIN_API_KEY (from the Coolify app env, input hidden): ' >&2
  while IFS= read -rs line </dev/tty; do
    line="${line//$'\e[200~'/}"
    line="${line//$'\e[201~'/}"
    line="${line//[[:space:]]/}"
    if [ -n "$line" ]; then ADMIN_API_KEY="$line"; break; fi
  done
  unset line
  echo >&2
fi
[ -n "${ADMIN_API_KEY:-}" ] || { echo "No admin key given, nothing to do." >&2; exit 1; }

SAMWELL_CLOUD_URL="${SAMWELL_CLOUD_URL:-https://api.open-citadel.online}"
BASE="${SAMWELL_CLOUD_URL%/}"
QUERY=""
[ "${1:-}" = "--force" ] && QUERY="?force=1"

# The server makes them in the background, since a run takes minutes and the
# proxy in front of it would cut a request that long. Start, then ask how far
# it has got every ten seconds until it is done.
curl -s -o /dev/null -X POST "$BASE/admin/voices/samples$QUERY" -H "x-admin-key: $ADMIN_API_KEY"
echo "Making samples on the server (a few minutes; the voices are read one at a time)..."
while true; do
  sleep 10
  STATUS=$(curl -s "$BASE/admin/voices/samples" -H "x-admin-key: $ADMIN_API_KEY")
  if printf '%s' "$STATUS" | python3 -c 'import json,sys;sys.exit(0 if json.load(sys.stdin).get("running") else 1)'; then
    printf '.'
    continue
  fi
  echo
  printf '%s' "$STATUS" | python3 -c "
import sys, json
d = json.load(sys.stdin)
if d.get('error'):
    print(' The run failed:', d['error'])
r = d.get('result') or {}
print(' made:', r.get('made'), ' already there:', r.get('skipped'))
for f in r.get('failed', []):
    print(' FAILED', f['modelId'], f['voice'], f['status'])
"
  break
done
echo
echo "Check one of each plays (expect audio/mpeg, then audio/wav):"
echo "  curl -s -o /tmp/sample.mp3 -w '%{http_code} %{content_type}\n' $BASE/tts/samples/hexgrad/kokoro-82m/af_heart"
echo "  curl -s -o /tmp/sample.wav -w '%{http_code} %{content_type}\n' $BASE/tts/samples/google/gemini-3.8-flash-tts/Kore"

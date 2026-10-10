#!/usr/bin/env bash
#
# Register the cloud reading voices on Samwell Cloud, plan by plan.
#
# WHY THIS EXISTS
#
# `cloud_voice_models` seeds itself from samwell-shared when it is EMPTY, so a
# fresh deploy already has these five. Running this anyway is the safe step:
# it re-pulls each model's price and voice list from OpenRouter, fixes a tier
# that was changed by hand, turns on `speedSupported` only where it is meant
# to be, and sets the formats each maker answers in (`formats`: MP3 where it
# has been heard to work; Gemini answers PCM alone and refuses anything else).
# It is idempotent, so running it twice changes nothing.
#
# Placement (access is cumulative):
#   Maester        Kokoro
#   Grand Maester  + Gemini Flash Lite, Gemini Flash
#   Archmaester    + ElevenLabs v4 Turbo, ElevenLabs v4
#
# Left out on purpose: Grok Voice (the owner's call) and Fish Audio (no fixed
# voices on OpenRouter; a voice there is made from uploaded audio, and cloned
# voices are not in this version).
#
# Confirm with:
#
#   curl -s "$SAMWELL_CLOUD_URL/health" | jq '{voicesByPlan, voicesMissingPrices}'
#
# Usage, from your machine (prefix with a space to keep the key out of history):
#   ./scripts/register-cloud-voices.sh            (prompts for the key, hidden)
#    ADMIN_API_KEY='...' ./scripts/register-cloud-voices.sh
set -euo pipefail

# The same careful read as register-cloud-models.sh: a pasted key often starts
# with a newline, and a single `read` would take that as the whole answer.
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
OUT="$(mktemp)"
trap 'rm -f "$OUT"' EXIT

register() { # <json body>
  local id
  id=$(printf '%s' "$1" | python3 -c 'import json,sys;print(json.load(sys.stdin)["id"])')
  printf '  %-36s ' "$id"
  code=$(curl -s -o "$OUT" -w '%{http_code}' -X POST "$BASE/admin/voices" \
    -H 'Content-Type: application/json' \
    -H "x-admin-key: $ADMIN_API_KEY" \
    -d "$1")
  if [ "$code" = "200" ]; then echo "ok"; else echo "FAILED ($code): $(head -c 200 "$OUT")"; fi
}

echo "Maester"
register '{"id":"hexgrad/kokoro-82m","minPlan":"maester","label":"Kokoro","maker":"Kokoro","description":"The same Kokoro voices, read from the cloud so the phone does not strain.","defaultVoice":"af_heart","speedSupported":true,"formats":["mp3","pcm"]}'

echo "Grand Maester"
register '{"id":"google/gemini-3.8-flash-lite-tts","minPlan":"grand_maester","label":"Gemini Flash Lite","maker":"Google","description":"Clear and natural, and it lasts.","defaultVoice":"Kore","speedSupported":false,"formats":["pcm"]}'
register '{"id":"google/gemini-3.8-flash-tts","minPlan":"grand_maester","label":"Gemini Flash","maker":"Google","description":"Richer reading, with more feeling in it.","defaultVoice":"Kore","speedSupported":false,"formats":["pcm"]}'

echo "Archmaester"
register '{"id":"elevenlabs/eleven-v4-turbo","minPlan":"archmaester","label":"Eleven v4 Turbo","maker":"ElevenLabs","description":"Lifelike voices that start quickly.","defaultVoice":"george","speedSupported":false,"formats":["mp3","pcm"]}'
register '{"id":"elevenlabs/eleven-v4","minPlan":"archmaester","label":"Eleven v4","maker":"ElevenLabs","description":"The most expressive reading in the app, and the dearest.","defaultVoice":"george","speedSupported":false,"formats":["mp3","pcm"]}'

echo
echo "Voices now:"
curl -s "$BASE/health" | python3 -c "import sys,json;d=json.load(sys.stdin);print(' voicesByPlan:',d.get('voicesByPlan'));print(' missing prices:',d.get('voicesMissingPrices'))"

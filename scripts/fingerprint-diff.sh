#!/usr/bin/env bash
# Shows why a local build says "Runtime version mismatch".
#
# `eas build --local` copies the project to a temp directory, installs fresh and
# fingerprints that, then refuses to build if the result differs from this
# checkout's fingerprint. It skips printing the diff outside EAS's servers, so
# this does the same thing and prints the sources that differ.
#
#   scripts/fingerprint-diff.sh [android|ios] [APP_VARIANT]
#
# Defaults to android and development. See TODO-ANDROID.md.
set -euo pipefail

platform="${1:-android}"
variant="${2:-development}"
root="$(git rev-parse --show-toplevel)"
clone="$(mktemp -d)"
trap 'rm -rf "$clone"' EXIT

echo "Copying the project, as git sees it, to $clone"
git -C "$root" ls-files -z --cached --others --exclude-standard | rsync -a --from0 --files-from=- "$root/" "$clone/"

echo "Installing fresh (this takes a minute)"
(cd "$clone" && pnpm install --frozen-lockfile >/dev/null)

# Both sides run with the EAS environment of the same name as the variant, as
# the build does. The checkout also reads .env (gitignored, so the fresh copy
# never has it), but the environment wins over .env: without it, a checkout
# with a .env shows `differs: expoConfig` that the real build never sees.
generate() {
  local cmd="APP_VARIANT=$variant pnpm exec fingerprint fingerprint:generate --platform $platform"
  if command -v eas >/dev/null; then
    # eas may print its own header to stdout; keep only the fingerprint's JSON line.
    (cd "$1" && eas env:exec "$variant" "$cmd" 2>/dev/null | grep -E '^(\[stdout\] )?\{' | sed 's/^\[stdout\] //')
  else
    echo "eas not found: comparing without the EAS environment" >&2
    (cd "$1" && eval "$cmd" 2>/dev/null | grep -E '^(\[stdout\] )?\{' | sed 's/^\[stdout\] //')
  fi
}
generate "$root" >"$clone/.fp-local.json"
generate "$clone" >"$clone/.fp-fresh.json"

if node - "$clone/.fp-local.json" "$clone/.fp-fresh.json" <<'EOF'; then exit 0; fi
const [local, fresh] = process.argv.slice(2).map((p) => require(p));
console.log(`checkout: ${local.hash}\nfresh:    ${fresh.hash}`);
if (local.hash === fresh.hash) {
  console.log("Match.");
  process.exit(0);
}
const key = (s) => s.filePath ?? s.id;
const byKey = (f) => new Map(f.sources.map((s) => [key(s), s]));
const a = byKey(local), b = byKey(fresh);
for (const [k, s] of a) {
  if (!b.has(k)) console.log(`only in checkout: ${k}`);
  else if (b.get(k).hash !== s.hash) console.log(`differs: ${k}`);
}
for (const k of b.keys()) if (!a.has(k)) console.log(`only in fresh install: ${k}`);
process.exit(1);
EOF

# Keep the fresh install so a differing directory can be narrowed down.
trap - EXIT
echo "Fresh install kept at $clone. For a directory: diff -rq \"$root/<dir>\" \"$clone/<dir>\""

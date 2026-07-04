#!/usr/bin/env bash
# Style and quality checks for the adash repo. Run locally (./scripts/lint.sh)
# or in CI. Exits non-zero if any check fails.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1
fail=0
note() { printf '\n== %s ==\n' "$1"; }

# Shell scripts: *.sh plus the extensionless client.
mapfile -t shells < <(git ls-files '*.sh' 'plugins/adash/bin/adash')

note "shell: shellcheck"
if command -v shellcheck >/dev/null 2>&1; then
  shellcheck -x "${shells[@]}" || fail=1
else
  echo "shellcheck not found; skipping (CI provides it)"
fi

note "shell: bash -n syntax"
for f in "${shells[@]}"; do bash -n "$f" || fail=1; done

note "node: --check on *.mjs"
while IFS= read -r f; do node --check "$f" || fail=1; done < <(git ls-files '*.mjs')

note "json: jq parse"
while IFS= read -r f; do jq -e . "$f" >/dev/null || { echo "invalid JSON: $f"; fail=1; }; done < <(git ls-files '*.json')

# AI-tell / Korean guard. Pattern uses \x escapes so this file has no literal
# offending characters (which would otherwise flag itself): em dash 2014, en
# dash 2013, ellipsis 2026, middot 00B7, right arrow 2192, Hangul AC00-D7A3.
note "style: no em dash / ellipsis / middot / arrow / Hangul"
if git ls-files '*.md' '*.mjs' '*.sh' '*.json' '*.html' '*.yml' 'plugins/adash/bin/adash' \
  | xargs grep -nP '[\x{2014}\x{2013}\x{2026}\x{00B7}\x{2192}\x{AC00}-\x{D7A3}]' 2>/dev/null; then
  echo "found AI-tell or Korean characters (see above)"
  fail=1
else
  echo "clean"
fi

if [ "$fail" = 0 ]; then
  printf '\nAll checks passed.\n'
else
  printf '\nSome checks FAILED.\n'
fi
exit "$fail"

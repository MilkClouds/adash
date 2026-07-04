#!/usr/bin/env bash
# SessionStart hook: inject the adash reporting discipline into the session as
# standing context, so no edit to the user's CLAUDE.md is needed. The behavior
# comes and goes with the plugin.
set -uo pipefail

read -r -d '' CTX <<'TXT' || true
Agent dashboard is active. You have an `adash` command available in your shell.
- At natural breakpoints (a step finished, a change of direction), run: adash report "<one line of status>". A manager model tidies it into a card on the researcher's dashboard, so you do not need to write it well.
- If a line tagged [Dashboard message] appears in your context, it is from the researcher or the manager (for example asking you to clarify a report): act on it when relevant, otherwise keep going.
TXT

if command -v jq >/dev/null 2>&1; then
  jq -nc --arg c "$CTX" '{hookSpecificOutput:{hookEventName:"SessionStart", additionalContext:$c}}'
fi

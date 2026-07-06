#!/usr/bin/env bash
# SessionStart hook: inject the adash reporting discipline into the session as
# standing context, so no edit to the user's CLAUDE.md is needed. The behavior
# comes and goes with the plugin.
set -uo pipefail

# Per-session on/off: an explicit `adash on/off` state file wins, else $ADASH (default on).
# When off, inject nothing. Set at launch (ADASH=0 claude) or toggle in-session (adash off).
input="$(cat 2>/dev/null || true)"
sid="${input#*\"session_id\":\"}"; sid="${sid%%\"*}"
DASH="${AGENT_DASHBOARD_DIR:-$HOME/.agent-dashboard}"
st="${ADASH:-1}"
case "$sid" in ''|*[!A-Za-z0-9._-]*) sid="";; esac
[ -n "$sid" ] && [ -f "$DASH/state/$sid" ] && st="$(cat "$DASH/state/$sid" 2>/dev/null || echo on)"
case "$st" in 0|off|OFF|Off|false|FALSE|False|no|NO|No) exit 0;; esac

read -r -d '' CTX <<'TXT' || true
Agent dashboard is active. You have an `adash` command available in your shell.
- At natural breakpoints (a step finished, a change of direction), run: adash report "<one line of status>". A manager model tidies it into a card on the researcher's dashboard, so you do not need to write it well.
- If a line tagged [Dashboard message] appears in your context, it is from the researcher or the manager (for example asking you to clarify a report): act on it when relevant, otherwise keep going.
TXT

if command -v jq >/dev/null 2>&1; then
  jq -nc --arg c "$CTX" '{hookSpecificOutput:{hookEventName:"SessionStart", additionalContext:$c}}'
fi

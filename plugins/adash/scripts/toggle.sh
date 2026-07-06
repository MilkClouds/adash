#!/usr/bin/env bash
# Internal helper for the /adash:on, /adash:off, /adash:status slash commands.
# Not on PATH; invoked only by those commands. Reads and writes this session's
# on/off state file ($DATA/state/<sid>), which the hooks and `adash report` consult.
set -euo pipefail
DATA="${AGENT_DASHBOARD_DIR:-$HOME/.agent-dashboard}"
sid="${CODEX_COMPANION_SESSION_ID:-}"
case "$sid" in ''|*[!A-Za-z0-9._-]*) echo "adash: no session id available (is the codex plugin active?)"; exit 0;; esac
sf="$DATA/state/$sid"

resolve(){ local v; if [ -f "$sf" ]; then v="$(cat "$sf" 2>/dev/null || echo on)"; else v="${ADASH:-1}"; fi
  case "$v" in 0|off|OFF|Off|false|FALSE|False|no|NO|No) echo off;; *) echo on;; esac; }

case "${1:-status}" in
  on)  mkdir -p "$DATA/state"; printf 'on\n' > "$sf"
       echo 'adash reporting is now ON for this session. Report at natural breakpoints (a step finished, a change of direction) with: adash report "<one line>".' ;;
  off) mkdir -p "$DATA/state"; printf 'off\n' > "$sf"
       echo 'adash reporting is now OFF for this session. No reports go out and no dashboard messages come in until it is turned back on.' ;;
  status) echo "adash reporting is currently $(resolve) for this session." ;;
  *) echo "usage: toggle.sh on|off|status" >&2; exit 2 ;;
esac

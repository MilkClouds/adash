#!/usr/bin/env bash
# Back-channel delivery: drain this session's inbox and inject the messages into
# the running worker as additionalContext (non-blocking). Wired to PostToolUse
# (live delivery) and Stop (idle-boundary delivery). Silent when inbox is empty.
# Hot path (empty inbox, the common case) avoids jq entirely.
set -uo pipefail
DASH="${AGENT_DASHBOARD_DIR:-$HOME/.agent-dashboard}"
input="$(cat)"
# fast session_id extract without spawning jq
sid="${input#*\"session_id\":\"}"; sid="${sid%%\"*}"
case "$sid" in ''|*[!A-Za-z0-9._-]*) exit 0;; esac
# per-session on/off: an explicit `adash on/off` state file wins, else $ADASH (default on)
st="${ADASH:-1}"; [ -f "$DASH/state/$sid" ] && st="$(cat "$DASH/state/$sid" 2>/dev/null || echo on)"
case "$st" in 0|off|OFF|Off|false|FALSE|False|no|NO|No) exit 0;; esac
inbox="$DASH/inbox/$sid.jsonl"
[ -s "$inbox" ] || exit 0            # cheap common-case exit, no jq, no work
# --- something to deliver: now do the heavier formatting ---
event="${input#*\"hook_event_name\":\"}"; event="${event%%\"*}"
case "$event" in ''|*[!A-Za-z]*) event="PostToolUse";; esac
claim="$DASH/tmp/$sid.inbox.$$"
mkdir -p "$DASH/tmp"
mv "$inbox" "$claim" 2>/dev/null || exit 0
ctx="$(jq -rs 'map("• ["+(.from//"dashboard")+"] "+((.text//"")|gsub("\n";" ")))|join("\n")' "$claim" 2>/dev/null || true)"
cat "$claim" >> "$DASH/inbox/$sid.consumed" 2>/dev/null || true
rm -f "$claim"
[ -n "$ctx" ] || exit 0
msg="[Dashboard message from the researcher/manager. Act on it if relevant, otherwise keep going.]
$ctx"
jq -nc --arg e "$event" --arg c "$msg" '{hookSpecificOutput:{hookEventName:$e, additionalContext:$c}}'

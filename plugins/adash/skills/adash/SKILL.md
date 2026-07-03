---
name: adash
description: Reference for the adash agent dashboard. Use when the user or agent asks how to report status to the dashboard, surface a decision to the researcher, run the dashboard server, or what adash report/consult/serve do.
---

# adash

`adash` reports agent status to a local dashboard and surfaces decisions to the researcher. A cheap "manager" model turns terse reports into readable per-session cards.

## Commands

- `adash report "<one line>"`: append a status report. The manager rewrites it into a card; you do not need to write it well. Report at natural breakpoints (a step finished, a change of direction).
- `adash consult "<question, with the tradeoff>"`: record a decision point verbatim and ping the researcher on Discord. Use at A-vs-B forks, ambiguous scope, or risky/irreversible steps. Keep working on anything not blocked by it.
- `adash serve`: start the dashboard web server. The researcher runs this, not the worker.

## Back-channel

If a line tagged `[Dashboard message]` appears in your context, it is from the researcher or the manager. Act on it when relevant, otherwise keep going. Delivery is automatic through the plugin's PostToolUse hook.

## Notes

- Session attribution uses `$CODEX_COMPANION_SESSION_ID` (set by the codex plugin).
- The dashboard is at http://127.0.0.1:4319 by default. The manager uses `codex exec` with a cheap model (`gpt-5.4-mini`), so reports cost a fraction of a cent each.
- The manager reads only your short reports plus the prior card, never your full transcript.

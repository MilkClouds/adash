---
name: adash
description: Report an agent's progress and surface its decisions to a researcher watching the session, through the adash tool (adash report, adash consult, adash serve). Use this skill whenever a worker or user wants to log or report a finished step, checkpoint, or status to a dashboard someone is monitoring, tell or notify or update whoever is watching the session, raise a decision or fork or tradeoff and ask the observer which way to go, or start or run or view the agent dashboard server. Trigger even when the request only mentions a dashboard, reporting progress, letting the researcher know, or asking the person watching, and even when it never says adash by name. Do not trigger for building data-visualization or monitoring dashboards such as React, Grafana, or sales charts, for writing a status-report document, for adding a status column, for reporting a software bug, or for the user asking for your own opinion.
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

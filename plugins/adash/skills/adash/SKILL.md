---
name: adash
description: Report an agent's progress to a researcher's live dashboard using the adash tool (adash report, adash serve). Use this skill whenever a worker or user wants to log or report a finished step, checkpoint, or status to a dashboard someone is monitoring, tell or notify or update whoever is watching the session, or start or run or view the agent dashboard server. Trigger even when the request only mentions a dashboard, reporting progress, or letting the researcher know, and even when it never says adash by name. Do not trigger for building data-visualization or monitoring dashboards such as React, Grafana, or sales charts, for writing a status-report document, for adding a status column, or for reporting a software bug.
---

# adash

`adash` reports agent status to a local dashboard. A cheap "manager" model turns terse reports into readable per-session cards.

## Commands

- `adash report "<one line>"`: append a status report. The manager rewrites it into a card; you do not need to write it well. Report at natural breakpoints (a step finished, a change of direction).
- `adash serve`: start the dashboard web server. The researcher runs this, not the worker.

## Back-channel

If a line tagged `[Dashboard message]` appears in your context, it is from the researcher or the manager (for example, asking you to clarify a report). Act on it when relevant, otherwise keep going. Delivery is automatic through the plugin's PostToolUse hook.

## Notes

- Session attribution uses `$CODEX_COMPANION_SESSION_ID` (set by the codex plugin).
- The researcher can pause this session with `/adash:off` (resume with `/adash:on`). While paused, `adash report` is a no-op and no dashboard messages arrive; that is expected, keep working.
- The dashboard is at http://127.0.0.1:4319 by default. The manager uses `codex exec` with a cheap model (`gpt-5.4-mini`), so reports cost a fraction of a cent each.
- The manager reads only your short reports plus the prior card, never your full transcript.

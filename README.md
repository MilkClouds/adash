# adash

A minimal status dashboard for Claude Code agent sessions, packaged as a Claude Code plugin.

Terse agents (for example fable5) rarely say what they are doing or surface the decisions they
should ask about. `adash` gives each worker session a one-line way to report, has a cheap model tidy
those reports into a readable card, shows everything on a local web page, and lets you send a message
back into a running worker without switching to its terminal.

## How it works

```
report:  worker --( adash report )-->  feed  --( codex manager )-->  card  ---\
                                                     \--( missing detail )--> inbox --> worker
consult: worker --( adash consult )--> feed  + Discord push to the researcher ----\-->  web UI
inbox:   web UI  --( type a message )-->  inbox  --( PostToolUse hook )-->  worker context
```

- The worker pushes short reports with `adash report`. It never has to write good prose.
- A manager (`codex exec` with a cheap model, default `gpt-5.4-mini`) rewrites each report into a
  clear per-session card. If a report is too vague, the manager asks the worker one specific question
  through the back-channel instead of guessing.
- `adash consult` records a decision verbatim and pings the researcher immediately.
- The dashboard shows all cards plus open consults, and has a box per worker to inject a message into
  that worker's next step.

The manager reads only the worker's short reports plus the prior card, never the full transcript, so
cost stays around a fraction of a cent per report.

## Install (Claude Code plugin)

```
/plugin marketplace add ~/GitHub/adash
/plugin install adash@adash
```

Installing wires the session side automatically, with no edit to your CLAUDE.md or settings.json:

- `adash` is placed on the session's shell PATH (from the plugin `bin/`).
- A SessionStart hook injects the reporting instruction (report at breakpoints, consult at decisions)
  as standing context.
- A PostToolUse hook delivers dashboard messages back into the worker.
- A skill provides on-demand help.

Scope it with `--scope user|project|local` if you do not want it in every session.

## Run the dashboard server (separate, long-running)

The server is a standing process, so it lives outside the plugin lifecycle. Run it once, for example
in tmux or a systemd user unit. For convenience on the shell PATH:

```
ln -sf ~/GitHub/adash/plugins/adash/bin/adash ~/.local/bin/adash
adash serve                                # http://127.0.0.1:4319
AGENT_DASHBOARD_HOST=0.0.0.0 adash serve   # expose on the LAN (trusted networks only)
```

Or without a symlink: `node ~/GitHub/adash/plugins/adash/server/server.mjs`.

## Use (inside a worker session)

```
adash report  "started 12-layer transformer run, data roughly prepared"
adash consult "AdamW vs Lion for the 7B run? Lion saves memory but is unproven at this scale"
```

## Configuration (environment)

| var | default | meaning |
|-----|---------|---------|
| `AGENT_DASHBOARD_DIR`  | `~/.agent-dashboard` | runtime data (feed, cards, inbox) |
| `AGENT_DASHBOARD_HOST` | `127.0.0.1`          | server bind address |
| `AGENT_DASHBOARD_PORT` | `4319`               | server port |
| `MGR_MODEL`            | `gpt-5.4-mini`       | manager model |
| `MGR_EFFORT`           | `low`                | manager reasoning effort |
| `MGR_CONCURRENCY`      | `2`                  | max concurrent manager passes |

## Uninstall

```
/plugin uninstall adash@adash    # removes hooks, skill, and the PATH bin
```

Runtime data in `~/.agent-dashboard` is left in place; remove it by hand if you want. If you added the
server symlink, remove it with `rm ~/.local/bin/adash`.

## Requirements

- Node 18 or newer, `jq`, and the `codex` CLI (logged in, with a cheap model such as `gpt-5.4-mini`)
- Optional: a Discord relay at `~/.claude/hooks/discord-notification.sh` for consult pings
- Sessions are identified by `$CODEX_COMPANION_SESSION_ID` (set by the codex Claude Code plugin)

## Layout

```
.claude-plugin/marketplace.json    marketplace listing
plugins/adash/
  .claude-plugin/plugin.json       plugin manifest
  bin/adash                        client and server launcher (report / consult / serve)
  hooks/hooks.json                 SessionStart inject + PostToolUse back-channel
  hooks/session-inject.sh          injects the reporting instruction at session start
  hooks/drain-inbox.sh             delivers dashboard messages into the worker
  skills/adash/SKILL.md            on-demand help
  server/server.mjs                always-on server: HTTP UI, manager scheduler, aging
  server/improve.mjs               one manager pass (report + prior card to improved card)
  server/index.html                dashboard UI
```

## Security note

Binding to `0.0.0.0` or a LAN address exposes `/state.json` (what your agents are doing) and `/inbox`
(message injection into workers) to that network. Only do it on a trusted network.

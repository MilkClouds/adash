# adash

A minimal status dashboard for Claude Code agent sessions, packaged as a Claude Code plugin.

Terse agents (for example fable5) rarely say what they are doing. `adash` gives each worker session a
one-line way to report, has a cheap model tidy those reports into a readable card, shows everything on
a local web page, and lets you send a message back into a running worker without switching to its
terminal.

## How it works

```
report:  worker --( adash report )-->  feed  --( codex manager )-->  card  --> web UI
                                                     \--( missing detail )--> inbox --> worker
inbox:   web UI  --( type a message )-->  inbox  --( PostToolUse hook )-->  worker context
```

- The worker pushes short reports with `adash report`. It never has to write good prose.
- A manager (`codex exec` with a cheap model, default `gpt-5.4-mini`) rewrites each report into a
  clear per-session card. If a report is too vague, the manager asks the worker one specific question
  through the back-channel instead of guessing.
- The dashboard shows all cards, and has a box per worker to inject a message into that worker's next
  step.

The manager reads only the worker's short reports plus the prior card, never the full transcript, so
cost stays around a fraction of a cent per report.

## Install (Claude Code plugin)

```
/plugin marketplace add MilkClouds/adash
/plugin install adash@adash
```

Installing wires the session side automatically, with no edit to your CLAUDE.md or settings.json:

- `adash` is placed on the session's shell PATH (from the plugin `bin/`).
- A SessionStart hook injects the reporting instruction (report at natural breakpoints) as standing
  context.
- A PostToolUse hook delivers dashboard messages back into the worker.
- A skill provides on-demand help.

Scope it with `--scope user|project|local` if you do not want it in every session.

## Turn it on or off per session

Reporting is on by default. There are two levers, and an explicit command always wins over the
environment default.

At launch, set `ADASH`:

```
claude                     # default: reporting on
ADASH=0 claude             # start this session silenced
```

Inside a running session, use the slash commands:

```
/adash:off       # pause: no reports go out, no dashboard messages come in
/adash:on        # resume reporting
/adash:status    # show the current state
```

To flip the default to off and watch only chosen sessions, export `ADASH=0` in your shell profile,
then turn on the ones you want with `ADASH=1 claude` or `/adash:on` mid-session.

## Run the dashboard server (separate, long-running)

The dashboard is one long-running process that lives outside the plugin lifecycle. With Node
installed you can start it straight from GitHub, no clone needed:

```
npx -y github:MilkClouds/adash serve                              # http://127.0.0.1:4319
AGENT_DASHBOARD_HOST=0.0.0.0 npx -y github:MilkClouds/adash serve  # expose on the LAN (trusted networks only)
```

Run it under tmux or a systemd user unit so it stays up; npx caches the fetch after the first run.
Inside a session that already has the plugin installed, `adash` is on your PATH, so `adash serve`
works too.

## Use (inside a worker session)

```
adash report "started 12-layer transformer run, data roughly prepared"
adash report "epoch 3 done, val loss 0.42, moving to fine-tune"
```

## Removing stale sessions

There is no automatic dead-session detection. Each card shows how long since its last update and dims
when stale, so you can see which are old. Click the × on a card to remove that session (its feed, card,
inbox, and state are purged). If the session is actually still alive, it reappears on its next report,
so removing is safe.

## Configuration (environment)

| var | default | meaning |
|-----|---------|---------|
| `ADASH`                | `1` (on)             | per-session switch (worker side); `0`/`off` silences the session |
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
- Sessions are identified by `$CODEX_COMPANION_SESSION_ID` (set by the codex Claude Code plugin)

## Layout

```
.claude-plugin/marketplace.json    marketplace listing
plugins/adash/
  .claude-plugin/plugin.json       plugin manifest
  bin/adash                        client and server launcher (report / serve)
  hooks/hooks.json                 SessionStart inject + PostToolUse back-channel
  hooks/session-inject.sh          injects the reporting instruction at session start
  hooks/drain-inbox.sh             delivers dashboard messages into the worker
  commands/                        slash commands: /adash:on /adash:off /adash:status
  scripts/toggle.sh                writes this session's on/off state (used by the commands)
  skills/adash/SKILL.md            on-demand help
  server/server.mjs                always-on server: HTTP UI, manager scheduler, delete
  server/improve.mjs               one manager pass (report + prior card to improved card)
  server/index.html                dashboard UI
```

## Security note

Binding to `0.0.0.0` or a LAN address exposes `/state.json` (what your agents are doing) and `/inbox`
(message injection into workers) to that network. Only do it on a trusted network.

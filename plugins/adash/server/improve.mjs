#!/usr/bin/env node
// Manager pass: read new feed lines + prior card -> codex (cheap) -> improved
// Status Card. Routes a "## Needs from you" block to the worker's inbox once.
// Invoked by the web server (serialized per sid), or standalone: node improve.mjs <sid>
import { readFileSync, writeFileSync, existsSync, renameSync, mkdirSync, appendFileSync, unlinkSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import path from 'node:path';

const DASH = process.env.AGENT_DASHBOARD_DIR || path.join(homedir(), '.agent-dashboard');
const MODEL = process.env.MGR_MODEL || 'gpt-5.4-mini';
const EFFORT = process.env.MGR_EFFORT || 'low';
const MAX_NEW = 40;    // cap events fed per pass
const CLIP = 1200;     // clip each event's text

const sid = process.argv[2];
if (!sid || !/^[A-Za-z0-9._-]+$/.test(sid)) { console.error('usage: improve.mjs <sid>'); process.exit(2); }

const feedFile = path.join(DASH, 'feed', `${sid}.jsonl`);
const cardFile = path.join(DASH, 'cards', `${sid}.md`);
const atFile   = path.join(DASH, 'tmp', `${sid}.at`);
const reqHashF = path.join(DASH, 'tmp', `${sid}.reqhash`);
const inboxF   = path.join(DASH, 'inbox', `${sid}.jsonl`);
const tmpCard  = path.join(DASH, 'tmp', `${sid}.card.${process.pid}`);
const tmpOut   = path.join(DASH, 'tmp', `${sid}.out.${process.pid}`);

if (!existsSync(feedFile)) process.exit(0);
for (const d of ['tmp','cards','inbox']) mkdirSync(path.join(DASH,d), {recursive:true});

const allLines = readFileSync(feedFile,'utf8').split('\n').filter(Boolean);
const total = allLines.length;
const at = existsSync(atFile) ? (parseInt(readFileSync(atFile,'utf8'),10)||0) : 0;
if (total <= at) process.exit(0);                    // nothing new
const newLines = allLines.slice(at, total);

const clip = (s,n=CLIP)=>{ s=String(s??''); return s.length>n ? s.slice(0,n)+`...[+${s.length-n}c]` : s; };
const hhmm = ts=>{ const d=new Date(Number(ts)); return isNaN(d.getTime())?'--:--':d.toISOString().slice(11,16); };
const events = newLines.slice(-MAX_NEW).map(l=>{
  let o; try{ o=JSON.parse(l); }catch{ return null; }
  return `[${hhmm(o.ts)} report] ${clip(o.text)}`;
}).filter(Boolean).join('\n');

const prior = existsSync(cardFile) ? readFileSync(cardFile,'utf8') : '(none, create the first card)';
const nowISO = new Date().toISOString();

const prompt = `You are the Manager of a live agent-status dashboard. A research agent ("the worker") posts terse status reports. Maintain ONE clear STATUS CARD for it and improve the worker's terse/messy reports into something a researcher reads at a glance.

Output the FULL updated card and NOTHING else. Write the entire card in plain English (translate the worker's reports if they are in another language). Do NOT use em dashes or other AI-tell stylistic patterns; use commas, colons, or short sentences. Rules:
- Start with a YAML frontmatter block, then the body. Use EXACTLY this shape, with the closing --- on its own line before the body. Do NOT wrap the whole card in ---; the fences enclose ONLY these four keys:
---
session: ${sid}
status: <one of active|waiting|blocked|done>
headline: <one line: what it is doing now>
updated: ${nowISO}
---
- Body sections in order (after the closing ---):
  "## Now": 1-3 lines, current focus.
  "## History": newest first, at most 8 bullets, each "HH:MM  fact"; merge or drop the oldest to stay at 8.
  "## Needs from you": the worker reports tersely and vaguely. If a report mentions something concrete but omits detail a researcher would want (e.g. "ran a sweep" without how many configs or which model; "results look off" without which metric or the actual numbers; "reduced batch" without whether it helped), ask ONE short specific question as a bullet. At most 2 bullets, only when the answer would materially improve the card; else write "none".
- Keep the whole card under about 2500 characters. This card is your only memory: compress, preserve durable facts (goal, decisions, blockers) from the prior card, drop stale minutiae.
- Improve clarity and structure of the worker's reports, but NEVER invent facts. If something important is missing, do NOT guess; ask for it under "## Needs from you".

=== PRIOR CARD ===
${prior}

=== NEW REPORTS (oldest first) ===
${events}
`;

const args = ['exec','-m',MODEL,'-c',`model_reasoning_effort=${EFFORT}`,'--skip-git-repo-check','--sandbox','read-only','-o',tmpOut,'-'];
const res = await new Promise(resolve=>{
  const ch = spawn('codex', args, {stdio:['pipe','ignore','pipe'], timeout:120000, killSignal:'SIGKILL'});
  let err='';
  ch.stderr.on('data', d=> err+=d);
  ch.on('error', e=> resolve({ok:false, code:-1, err:String(e)}));
  ch.on('close', code=> resolve({ok:code===0, code, err}));
  ch.stdin.write(prompt); ch.stdin.end();
});
if (!res.ok) { console.error(`[improve ${sid}] codex failed (${res.code}): ${res.err.slice(-300)}`); safeUnlink(tmpOut); process.exit(1); }

let card = existsSync(tmpOut) ? readFileSync(tmpOut,'utf8').trim() : '';
const fm = card.indexOf('---');
if (fm > 0) card = card.slice(fm);                    // strip any accidental preamble
if (!card.startsWith('---') || card.length < 20) { console.error(`[improve ${sid}] bad card output; keeping prior`); safeUnlink(tmpOut); process.exit(1); }
card = normalizeCard(card);                            // tolerate codex mis-fencing the frontmatter

writeFileSync(tmpCard, card+'\n');
renameSync(tmpCard, cardFile);                         // atomic
writeFileSync(atFile, String(total));                 // advance watermark

// route "## Needs from you" -> inbox, once per distinct request
const m = card.match(/##\s*Needs from you\s*\n([\s\S]*?)(?:\n##\s|\s*$)/i);
const needs = m ? m[1].trim() : '';
const isNone = !needs || /^(-\s*)?none\.?$/i.test(needs.replace(/\s+/g,' ').trim());
if (!isNone) {
  const h = createHash('sha256').update(needs).digest('hex').slice(0,16);
  const prevH = existsSync(reqHashF) ? readFileSync(reqHashF,'utf8').trim() : '';
  if (h !== prevH) {
    appendFileSync(inboxF, JSON.stringify({kind:'request', ts:Date.now(), from:'manager', text:needs})+'\n');
    writeFileSync(reqHashF, h);
  }
}
safeUnlink(tmpOut);
process.exit(0);

function safeUnlink(f){ try{ if(existsSync(f)) unlinkSync(f); }catch{} }

// Force well-formed frontmatter. codex sometimes fails to close the --- fence and
// wraps the whole card, which makes the server read an empty body. Rebuild it:
// keep the leading key:value lines as frontmatter, everything from the first ## as
// body, and drop a stray trailing --- fence.
function normalizeCard(raw){
  const lines = raw.replace(/\r/g,'').split('\n');
  let i = 0;
  if (lines[i] !== undefined && lines[i].trim() === '---') i++;   // drop opening fence
  const fm = [];
  for (; i < lines.length; i++){
    const l = lines[i];
    if (l.trim() === '---') { i++; break; }                        // explicit close
    if (/^\s*#{1,6}\s/.test(l)) break;                             // body started with no close
    if (/^[A-Za-z_][\w -]*:\s?/.test(l.trim())) fm.push(l.trim()); // a frontmatter key
    else if (l.trim() === '') continue;
    else break;                                                    // unexpected -> body starts
  }
  const body = lines.slice(i).join('\n').trim().replace(/\n?-{3,}\s*$/,'').trim();
  return `---\n${fm.join('\n')}\n---\n\n${body}`;
}

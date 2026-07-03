#!/usr/bin/env node
// Agent dashboard server: the single always-on process.
//  - serves the dashboard UI + /state.json
//  - watches feed/ and runs the Manager (improve.mjs) per session (cap N, per-sid serial)
//  - POST /inbox/<sid> (human intervention), /resolve/<sid>/<id>, /poke/<sid>
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, appendFileSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import path from 'node:path';

const DASH = process.env.AGENT_DASHBOARD_DIR || path.join(homedir(), '.agent-dashboard');
const PORT = Number(process.env.AGENT_DASHBOARD_PORT || 4319);
const HOST = process.env.AGENT_DASHBOARD_HOST || '127.0.0.1';
const MAXN = Number(process.env.MGR_CONCURRENCY || 2);
const HERE = path.dirname(new URL(import.meta.url).pathname);
const improvePath = path.join(HERE, 'improve.mjs');
const stateFile = path.join(DASH, 'web', 'state.json');
for (const d of ['feed','cards','inbox','tmp','web']) mkdirSync(path.join(DASH,d), {recursive:true});

const sidRe = /^[A-Za-z0-9._-]+$/;
const rd = f => { try { return readFileSync(f,'utf8'); } catch { return ''; } };
const lines = s => s.split('\n').filter(Boolean);
const jparse = l => { try { return JSON.parse(l); } catch { return null; } };
const listSids = dir => { try { return readdirSync(path.join(DASH,dir)).filter(f=>f.endsWith('.jsonl')||f.endsWith('.md')).map(f=>f.replace(/\.(jsonl|md)$/,'')).filter(s=>sidRe.test(s)); } catch { return []; } };

// ---- persistent state (resolved consults) ----
let state = { resolved: {} };
try { state = JSON.parse(rd(stateFile)) || state; } catch {}
const saveState = () => { try { writeFileSync(stateFile, JSON.stringify(state)); } catch {} };

// ---- Manager scheduler: feed lines > watermark -> run improve (cap N, per-sid serial) ----
const running = new Set();
const feedCount = sid => lines(rd(path.join(DASH,'feed',`${sid}.jsonl`))).length;
const watermark = sid => parseInt(rd(path.join(DASH,'tmp',`${sid}.at`)),10) || 0;
function runImprove(sid){
  if (running.has(sid) || running.size >= MAXN) return;
  running.add(sid);
  const ch = spawn('node', [improvePath, sid], { cwd: DASH, stdio: ['ignore','ignore','inherit'] });
  ch.on('error', e => { console.error(`[server] improve spawn error ${sid}:`, e.message); running.delete(sid); });
  ch.on('close', () => { running.delete(sid); if (feedCount(sid) > watermark(sid)) setTimeout(scan, 50); });
}
function scan(){
  for (const sid of listSids('feed')) {
    if (running.size >= MAXN) break;
    if (!running.has(sid) && feedCount(sid) > watermark(sid)) runImprove(sid);
  }
}
setInterval(scan, 2000);
scan();

// ---- state aggregation for the UI ----
function parseCard(md){
  const m = md.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { fm:{}, body: md.trim() };
  const fm = {};
  for (const ln of m[1].split('\n')) { const i = ln.indexOf(':'); if (i>0) fm[ln.slice(0,i).trim()] = ln.slice(i+1).trim(); }
  return { fm, body: m[2].trim() };
}
function buildState(){
  const now = Date.now();
  const workers = [];
  const cardSids = new Set(listSids('cards'));
  for (const sid of cardSids){
    const f = path.join(DASH,'cards',`${sid}.md`);
    const { fm, body } = parseCard(rd(f));
    let mtime = now; try { mtime = statSync(f).mtimeMs; } catch {}
    workers.push({ sid, status: fm.status||'active', headline: fm.headline||'', body, updated: fm.updated||'', ageMs: now-mtime, pending:false });
  }
  // feed-only sessions with no card yet
  for (const sid of listSids('feed')) if (!cardSids.has(sid))
    workers.push({ sid, status:'pending', headline:'(tidying first report)', body:'', ageMs:0, pending:true });
  workers.sort((a,b)=>a.ageMs-b.ageMs);

  const consults = [];
  for (const sid of listSids('feed')){
    let project = sid;
    for (const l of lines(rd(path.join(DASH,'feed',`${sid}.jsonl`)))){
      const o = jparse(l); if (!o) continue;
      if (o.cwd) project = path.basename(o.cwd);
      if (o.kind==='consult' && !state.resolved[`${sid}:${o.id}`])
        consults.push({ sid, id:o.id, q:o.q, ts:o.ts, project, ageMs: now-Number(o.ts) });
    }
  }
  consults.sort((a,b)=>b.ts-a.ts);
  return { now, workers, consults };
}

// ---- HTTP ----
const readBody = req => new Promise(res=>{ let b=''; req.on('data',c=>b+=c); req.on('end',()=>res(b)); });
const send = (res,code,type,body)=>{ res.writeHead(code,{'Content-Type':type}); res.end(body); };

createServer(async (req,res)=>{
  const u = new URL(req.url, 'http://x');
  const p = u.pathname;
  try {
    if (req.method==='GET' && (p==='/'||p==='/index.html'))
      return send(res,200,'text/html; charset=utf-8', rd(path.join(HERE,'index.html')));
    if (req.method==='GET' && p==='/state.json')
      return send(res,200,'application/json', JSON.stringify(buildState()));

    let m;
    if (req.method==='POST' && (m=p.match(/^\/inbox\/([^/]+)$/)) && sidRe.test(m[1])){
      const { text } = JSON.parse(await readBody(req)||'{}');
      if (text && String(text).trim()){
        appendFileSync(path.join(DASH,'inbox',`${m[1]}.jsonl`),
          JSON.stringify({kind:'message', ts:Date.now(), from:'researcher', text:String(text).trim()})+'\n');
      }
      return send(res,200,'application/json','{"ok":true}');
    }
    if (req.method==='POST' && (m=p.match(/^\/resolve\/([^/]+)\/([^/]+)$/)) && sidRe.test(m[1])){
      state.resolved[`${m[1]}:${m[2]}`] = true; saveState();
      return send(res,200,'application/json','{"ok":true}');
    }
    if (req.method==='POST' && (m=p.match(/^\/poke\/([^/]+)$/)) && sidRe.test(m[1])){
      scan();
      return send(res,200,'application/json','{"ok":true}');
    }
    send(res,404,'text/plain','not found');
  } catch (e) { send(res,500,'text/plain', 'err: '+e.message); }
}).listen(PORT, HOST, ()=> console.log(`agent-dashboard on http://${HOST}:${PORT}  (dir: ${DASH}, manager cap ${MAXN})`));

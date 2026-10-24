import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const base = process.env.QA_BASE_URL || 'http://localhost:3100';
const outDir = process.env.QA_OUT_DIR || 'docs/qa/2026-05-12-login-chinese-qa';
mkdirSync(outDir, { recursive: true });

function loadEnv(path = '.env.local') {
  const text = readFileSync(path, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnv();

const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const userDataDir = `/tmp/closr-cdp-en-${Date.now()}`;
const port = 9555 + Math.floor(Math.random() * 1000);
const chrome = spawn(chromePath, [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${userDataDir}`,
  '--no-first-run', '--no-default-browser-check', '--window-size=1440,1200', 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });

let seq = 0; const pending = new Map(); let ws;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getJson(url) { const r = await fetch(url); if (!r.ok) throw new Error(`${r.status}`); return r.json(); }
async function waitForWsUrl() { for (let i=0;i<80;i++){ try{ const targets=await getJson(`http://127.0.0.1:${port}/json/list`); const p=targets.find(t=>t.type==='page'&&t.webSocketDebuggerUrl); if(p) return p.webSocketDebuggerUrl; }catch{} await sleep(100);} throw new Error('no cdp'); }
function send(method, params={}) { const id=++seq; ws.send(JSON.stringify({id,method,params})); return new Promise((resolve,reject)=>pending.set(id,{resolve,reject,method})); }
async function connect(){ const url=await waitForWsUrl(); ws=new WebSocket(url); ws.onmessage=(m)=>{ const d=JSON.parse(m.data); if(d.id&&pending.has(d.id)){ const p=pending.get(d.id); pending.delete(d.id); d.error?p.reject(new Error(`${p.method}: ${d.error.message}`)):p.resolve(d.result);} }; await new Promise((res,rej)=>{ws.onopen=res; ws.onerror=rej;}); await send('Page.enable'); await send('Runtime.enable'); }
async function evalJs(expression, awaitPromise=true){ const r=await send('Runtime.evaluate',{expression,awaitPromise,returnByValue:true}); if(r.exceptionDetails) throw new Error(r.exceptionDetails.text || 'Runtime exception'); return r.result?.value; }
async function navigate(path){ const url=path.startsWith('http')?path:`${base}${path}`; await send('Page.navigate',{url}); for(let i=0;i<45;i++){ await sleep(400); const txt=await evalJs('document.body?.innerText || ""').catch(()=> ''); if(txt && txt.trim()!=='Loading...') break;} await sleep(1800); }
async function screenshot(name){ const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true}); const file=join(outDir,`${name}.png`); writeFileSync(file,Buffer.from(shot.data,'base64')); return file; }
async function login(){
  await navigate('/login?demo=true');
  const access=JSON.stringify(process.env.DEMO_PASSWORD || process.env.DEMO_ACCESS_PASSWORD || 'jeff3598');
  await evalJs(`(async()=>{
    await new Promise(r=>setTimeout(r,500));
    const inputs=[...document.querySelectorAll('input[type="password"], input')];
    const input=inputs.find(el=>/访问密码|Access password/.test(el.placeholder||'')) || inputs.at(-1);
    if(!input) throw new Error('no demo password input');
    const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
    setter.call(input,${access});
    input.dispatchEvent(new Event('input',{bubbles:true}));
    input.dispatchEvent(new Event('change',{bubbles:true}));
    await new Promise(r=>setTimeout(r,200));
    const enter=[...document.querySelectorAll('button')].find(b=>/^进入$|^Enter$/.test((b.innerText||'').trim()))
      || [...document.querySelectorAll('button')].reverse().find(b=>/进入|Enter/.test(b.innerText||''));
    if(!enter) throw new Error('no demo enter button');
    enter.click();
    return true;
  })()`);
  for(let i=0;i<180;i++){
    const href=await evalJs('location.href');
    const text=await evalJs('document.body?.innerText || ""').catch(()=> '');
    if(!href.includes('/login') && !/Demo 数据初始化失败|密码错误|Demo 登录失败/.test(text)) return href;
    if(/Demo 数据初始化失败|密码错误|Demo 登录失败/.test(text)) throw new Error(text.slice(0,300));
    await sleep(500);
  }
  throw new Error('login timeout');
}

const allow = [/^(AI|API|IT|SLA|POC|RFP|CRM|URL|CNBC|Gmail|Outlook|iMaster|AIOps)$/i, /^https?:\/\//i, /^\d+[A-Za-z]?$/];
const suspicious = /\b(email_received|email_sent|customer_communication|source_records?|semi_formal|riskAppetite|responseSpeed|lengthPreference|formality|landmines|backup|Champion|Economic Buyer|Decision Maker|Active|Progressing|Blocked|Stalled|Slowing|intervention outcome|judgement|judgment|deadline|CTA|short|medium|long)\b/i;
function allowed(t){return allow.some(r=>r.test(t));}
async function scan(path,name){ await navigate(path); await screenshot(name); const hits=await evalJs(`(() => {
 const suspicious = ${suspicious.toString()};
 const nodes=[...document.querySelectorAll('body *')].filter(el=>{const s=getComputedStyle(el); return s && s.display!=='none' && s.visibility!=='hidden' && el.offsetParent!==null;});
 const out=[];
 for(const n of nodes){ const text=(n.innerText||'').replace(/\\s+/g,' ').trim(); if(!text||text.length>220) continue; if(suspicious.test(text)) out.push(text); }
 return [...new Set(out)].slice(0,120);
})()`);
 return {path,hits}; }

try{
 await connect();
 const href=await login();
 const paths=[
  ['/horizon','horizon'], ['/dashboard','dashboard'], ['/accounts','accounts'],
  ['/accounts/acc_eastchina_platform_001?tab=overview','account-overview'],
  ['/accounts/acc_eastchina_platform_001?tab=activity','account-activity'],
  ['/accounts/acc_eastchina_platform_001?tab=knowledge','account-knowledge'],
  ['/accounts/acc_eastchina_platform_001?tab=plays','account-plays'],
  ['/pipeline','pipeline'], ['/pipeline/opp_cmcc_5g_003','rfp-detail'],
  ['/contacts','contacts'], ['/compose?name=刘总&title=信息科技部负责人&accountId=acc_eastchina_platform_001','compose'], ['/plays','plays']
 ];
 const report=[]; for(const [p,n] of paths) report.push(await scan(p,n));
 writeFileSync(join(outDir,'visible-english-report.json'), JSON.stringify({base,loginHref:href,report},null,2));
 console.log(JSON.stringify({outDir, report},null,2));
} finally { try{ws?.close();}catch{} chrome.kill('SIGTERM'); }

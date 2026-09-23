import { randomUUID, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";

const base = "https://quizflow-flax.vercel.app";
const api = "https://fqxsmxshcyjbmuegkalu.supabase.co";
const service = process.env.QUIZFLOW_LOAD_SERVICE_KEY, anon = process.env.QUIZFLOW_LOAD_ANON_KEY;
if (!service || !anon || process.env.QUIZFLOW_LOAD_APPROVED !== "1") throw new Error("Explicit load-test credentials and approval required");
const rows = [], stages = [], saved = new Set(), failures = [], pendingJobs = [];
const started = Date.now();
let owner, quiz, workspace, aborted = false, active = 0, peak = 0, healthFailures = 0;
const out = "/tmp/quizflow-load-results.json";
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function stats(items) {
  const times = items.map(r => r.ms).sort((a,b) => a-b);
  const percentile = p => times[Math.min(times.length-1, Math.ceil(times.length*p)-1)] ?? null;
  return { requests:items.length, statuses:items.reduce((x,r)=>(x[r.status]=(x[r.status]||0)+1,x),{}),
    medianMs:percentile(.5),p95Ms:percentile(.95),p99Ms:percentile(.99),maxMs:times.at(-1)??null,
    bytes:items.reduce((n,r)=>n+r.bytes,0) };
}
function snapshot() {
  writeFileSync(out,JSON.stringify({started:new Date(started).toISOString(),elapsedSeconds:Math.round((Date.now()-started)/1000),peakConcurrentRequests:peak,aborted,stages,summary:stats(rows),byKind:Object.fromEntries([...new Set(rows.map(r=>r.kind))].map(k=>[k,stats(rows.filter(r=>r.kind===k))])),failures,rows},null,2));
}
async function rest(path, method="GET", body, token=service) {
  const response=await fetch(api+path,{method,signal:AbortSignal.timeout(15000),headers:{apikey:anon,Authorization:"Bearer "+token,"Content-Type":"application/json",Prefer:"return=representation"},...(body?{body:JSON.stringify(body)}:{})});
  const text=await response.text();
  if(!response.ok)throw Error("Fixture API HTTP "+response.status+" "+path.split("?")[0]);
  return text?JSON.parse(text):null;
}
async function req(kind,path,{method="GET",body,token,phase="baseline",expected=[200]}={}) {
  if(aborted && kind!=="health")throw Error("Safety stop active");
  const start=performance.now();active++;peak=Math.max(peak,active);
  let row={kind,phase,status:0,ms:0,ttfbMs:null,bytes:0},text="";
  try {
    const response=await fetch(base+path,{method,redirect:"error",signal:AbortSignal.timeout(12000),headers:{"User-Agent":"QuizFlow-Authorized-Load-Test","Content-Type":"application/json",...(token?{Authorization:"Bearer "+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
    row.ttfbMs=Math.round(performance.now()-start);row.status=response.status;
    text=await response.text();row.bytes=Buffer.byteLength(text);
    if(!expected.includes(row.status))failures.push({kind,phase,status:row.status});
  }catch(error){row.error=error.cause?.code||error.name;failures.push({kind,phase,status:0,error:row.error});}
  finally {active--;row.ms=Math.round(performance.now()-start);rows.push(row);}
  if(rows.filter(r=>r.status===0||r.status>=500).length>=3)aborted=true;
  if(rows.length>4000||rows.reduce((n,r)=>n+r.bytes,0)>200*1024*1024)aborted=true;
  return {...row,text};
}
async function health() {
  const r=await req("health","/login",{phase:"health"});
  healthFailures=r.status!==200||r.ms>6000?healthFailures+1:0;
  if(healthFailures>=2){aborted=true;throw Error("Production health safety stop");}
}
async function cooldown(seconds=65) {
  for(let elapsed=0;elapsed<seconds;elapsed+=15){await health();snapshot();await sleep(Math.min(15,seconds-elapsed)*1000);}
}
async function pool(items,concurrency,fn) {
  let next=0;
  const results=await Promise.allSettled(Array.from({length:Math.min(concurrency,items.length)},async()=>{while(next<items.length){if(aborted)throw Error("Safety stop active");const i=next++;await fn(items[i],i);}}));
  const rejected=results.find(r=>r.status==="rejected");if(rejected)throw rejected.reason;
}
function bodyFor(session) {
  return {lead:{name:"Load QA",email:"load-"+session.claims.sessionId+"@example.invalid",consent:true},answers:Array.from({length:8},(_,i)=>({nodeId:"load-q"+i,optionIds:["yes"],answerLabel:"Yes"}))};
}
async function openSession(phase) {
  const r=await req("page","/q/"+quiz.slug,{phase});
  if(r.status!==200)throw Error("Page HTTP "+r.status);
  const tokens=r.text.match(/eyJ[A-Za-z0-9_-]{80,}\.[A-Za-z0-9_-]{43}/g)||[];
  const token=tokens.find(t=>{try{return JSON.parse(Buffer.from(t.split(".")[0],"base64url")).quizId===quiz.id;}catch{return false;}});
  if(!token)throw Error("Page did not issue a capability (possibly rate limited)");
  return {token,claims:JSON.parse(Buffer.from(token.split(".")[0],"base64url"))};
}
async function track(session,nodeId,answers,status,phase) {
  return req("track","/api/quiz-sessions/track",{method:"POST",token:session.token,phase,body:{quizId:quiz.id,sessionId:session.claims.sessionId,currentNodeId:nodeId,status,answers}});
}
async function analytics(session,eventType,phase) {
  return req("analytics","/api/analytics",{method:"POST",token:session.token,phase,body:{eventType}});
}
async function submit(session,phase,expected=[200]) {
  const r=await req("submit","/api/quiz-submissions",{method:"POST",token:session.token,phase,body:bodyFor(session),expected});
  if(r.status===200){const data=JSON.parse(r.text);if(!data.ok||data.leadId!==session.claims.leadId)throw Error("Invalid submission acknowledgement");saved.add(session.claims.leadId);}
  return r;
}
async function stage(name,fn) {
  if(aborted)throw Error("Safety stop active");
  const begin=Date.now(),index=rows.length;
  console.log("START "+name);
  await fn();
  const summary=stats(rows.slice(index));stages.push({name,durationSeconds:Math.round((Date.now()-begin)/1000),...summary});
  snapshot();console.log("DONE "+JSON.stringify(stages.at(-1)));
  if(summary.requests>=10&&summary.p95Ms>8000){aborted=true;throw Error("Latency safety stop");}
}
let heartbeat;
try {
  const email="quizflow-load-"+randomUUID()+"@example.com";
  owner=(await rest("/auth/v1/admin/users","POST",{email,password:randomBytes(24).toString("base64url"),email_confirm:true})).id;
  workspace=(await rest("/rest/v1/workspaces?select=id&owner_id=eq."+owner))[0].id;
  quiz=(await rest("/rest/v1/quizzes","POST",{workspace_id:workspace,name:"Isolated load QA",slug:"load-qa-"+randomUUID(),status:"active"}))[0];
  writeFileSync("/tmp/quizflow-load-fixture.json",JSON.stringify({owner,workspace,quiz:quiz.id,slug:quiz.slug}),{mode:0o600});
  const nodes=[{id:"load-start",type:"start",position_x:0,position_y:0,data:{kind:"start"}},
    ...Array.from({length:8},(_,i)=>({id:"load-q"+i,type:"question",position_x:0,position_y:100+i*100,data:{kind:"question",title:"Load question "+i,answerType:"single_choice",required:true,combineAnswers:true,options:[{id:"yes",label:"Yes",value:"yes",score:1}]}})),
    {id:"load-contact",type:"lead_details",position_x:0,position_y:900,data:{kind:"lead_details",title:"Load contact",showEmail:true,requireEmail:true,showConsent:true,consentText:"QA consent"}},
    {id:"load-end",type:"end",position_x:0,position_y:1000,data:{kind:"end",title:"Load complete",text:"QA only",redirectEnabled:false}}];
  await rest("/rest/v1/quiz_nodes","POST",nodes.map(n=>({...n,quiz_id:quiz.id})));
  await rest("/rest/v1/quiz_edges","POST",nodes.slice(0,-1).map((n,i)=>({quiz_id:quiz.id,id:"load-e"+i,source:n.id,target:nodes[i+1].id})));
  console.log("Isolated fixture ready "+JSON.stringify({owner,quiz:quiz.id,slug:quiz.slug}));
  heartbeat=setInterval(()=>{snapshot();console.log("PROGRESS "+JSON.stringify({seconds:Math.round((Date.now()-started)/1000),requests:rows.length,active,failed:failures.length,saved:saved.size,aborted}));},30000);
  await health();
  const sessions=[];
  for(const concurrency of [1,4,8,16])await stage("page-ramp-"+concurrency,()=>pool(Array.from({length:concurrency}),concurrency,async()=>sessions.push(await openSession("page-ramp-"+concurrency))));
  await cooldown();
  await stage("page-spike-32",()=>pool(Array.from({length:32}),32,async()=>sessions.push(await openSession("page-spike-32"))));
  await stage("analytics-burst-32",()=>pool(sessions.slice(-32),32,s=>analytics(s,"view","analytics-burst-32")));
  await stage("submission-burst-16",()=>pool(sessions.slice(0,16),16,s=>submit(s,"submission-burst-16")));
  await stage("submission-idempotent-retries",()=>pool(sessions.slice(0,2),2,s=>submit(s,"submission-idempotent-retries")));
  await stage("submission-rate-limit",async()=>{
    const results=[];await pool(Array.from({length:6}),6,async(_,i)=>results.push(await submit(sessions[i],"submission-rate-limit",[200,429])));
    if(!results.some(r=>r.status===429))throw Error("Expected shared submission limit");
    if(results.some(r=>![200,429].includes(r.status)))throw Error("Unexpected rate-limit response");
  });
  await cooldown();
  await stage("rate-limit-recovery",()=>submit(sessions[0],"rate-limit-recovery"));
  await stage("heartbeat-burst-32",async()=>{
    for(const status of ["active","active","completed","active"]){
      await pool(sessions.slice(-32),32,s=>track(s,status==="completed"?"load-end":"load-q0",status==="completed"?bodyFor(s).answers:[],status,"heartbeat-burst-32"));
    }
  });
  const completed=await rest("/rest/v1/quiz_sessions?select=id,status&quiz_id=eq."+quiz.id);
  if(completed.length!==32||completed.some(s=>s.status!=="completed"))throw Error("Late heartbeat reopened a completed session");
  await cooldown();
  await stage("six-minute-mixed-soak",async()=>{
    const begin=Date.now(),running=new Set();
    for(let i=0;i<72;i++){
      if(aborted)throw Error("Safety stop active");
      await sleep(Math.max(0,begin+i*5000-Date.now()));
      while(running.size>=8)await Promise.race(running);
      const job=(async()=>{
        const phase="six-minute-mixed-soak",session=await openSession(phase),answers=bodyFor(session).answers;
        await analytics(session,"view",phase);await analytics(session,"start",phase);
        for(let step=0;step<8;step++)await track(session,"load-q"+step,answers.slice(0,step),"active",phase);
        const result=await submit(session,phase);if(result.status!==200)throw Error("Soak submission failed");
        await track(session,"load-end",answers,"completed",phase);await analytics(session,"complete",phase);
      })();
      pendingJobs.push(job);running.add(job);job.then(()=>running.delete(job),()=>{running.delete(job);aborted=true;});
      if(i%6===0)await health();
    }
    await Promise.all(running);
    await sleep(Math.max(0,begin+360000-Date.now()));
  });
  await cooldown();
  await stage("post-load-recovery",async()=>{for(let i=0;i<5;i++)await openSession("post-load-recovery");await health();});
  const leads=await rest("/rest/v1/leads?select=id,score&quiz_id=eq."+quiz.id);
  const submissions=await rest("/rest/v1/quiz_submissions?select=id,lead_id&quiz_id=eq."+quiz.id);
  const answers=await rest("/rest/v1/submission_answers?select=id,submission_id&submission_id=in.("+submissions.map(s=>s.id).join(",")+")");
  if(leads.length!==saved.size||submissions.length!==saved.size||leads.some(l=>l.score!==8)||answers.length!==saved.size*8)throw Error("Post-load persistence integrity mismatch");
  stages.push({name:"integrity",leads:leads.length,submissions:submissions.length,answers:answers.length,duplicateLeads:leads.length-new Set(leads.map(l=>l.id)).size});
  console.log("PASS persistence integrity "+JSON.stringify(stages.at(-1)));
}catch(error){aborted=true;failures.push({fatal:error.message});console.error("LOAD STOP "+error.message);process.exitCode=1;}
finally{
  await Promise.allSettled(pendingJobs);
  clearInterval(heartbeat);
  if(owner){
    try{
      await rest("/auth/v1/admin/users/"+owner,"DELETE");
      const remaining=await rest("/rest/v1/workspaces?select=id&owner_id=eq."+owner);
      if(remaining.length)throw Error("Fixture workspace remains");
      stages.push({name:"cleanup",success:true});console.log("PASS isolated fixture cleanup");
    }catch(error){failures.push({cleanup:error.message});process.exitCode=1;}
  }
  snapshot();console.log("FINAL "+JSON.stringify({elapsedSeconds:Math.round((Date.now()-started)/1000),...stats(rows),peak,aborted,failures}));
}

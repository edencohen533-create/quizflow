import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { EventEmitter } from "node:events";
import ts from "typescript";

const nativeRequire = createRequire(import.meta.url);
function loader(mocks = {}) {
  const cache = new Map();
  function load(filename) {
    filename = path.resolve(filename);
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} };
    cache.set(filename, module);
    const source = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const require = (name) => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name === "server-only") return {};
      if (name === "./shared-rate-limit") return { sharedBudget: async () => true };
      if (name === "next/server") return { ...nativeRequire(name), after: () => {} };
      if (name.startsWith("@/")) return load(path.resolve("src", name.slice(2)) + ".ts");
      if (name.startsWith(".")) return load(path.resolve(path.dirname(filename), name) + ".ts");
      return nativeRequire(name);
    };
    new Function("require", "module", "exports", source)(require, module, module.exports);
    return module.exports;
  }
  return load;
}
const load = loader();
const http = load("src/lib/security/http.ts");
const session = load("src/lib/security/session.ts");
const content = load("src/lib/safe-content.ts");
const answers = load("src/lib/security/answers.ts");
const { operationId } = load("src/lib/security/ids.ts");
const webhook = load("src/lib/security/webhook.ts");
const QUIZ = "11111111-1111-4111-a111-111111111111";
const WORKSPACE = "22222222-2222-4222-a222-222222222222";
const DEFINITION = "33333333-3333-4333-a333-333333333333";
process.env.QUIZ_SESSION_SECRET = "isolated-test-secret-not-a-real-production-credential";

function request(body, extra = {}) {
  return new Request("https://quiz.example/api/test", { method: "POST", headers: { "content-type": "application/json", ...extra }, body: JSON.stringify(body) });
}
function db(results = {}) {
  const calls = [];
  const client = {
    calls,
    async rpc(name,args) { const call={rpc:name,args};calls.push(call);const value=results[name];return typeof value==="function"?value(call):value??{data:1,error:null}; },
    auth: { getUser: async () => ({ data: { user: { id: "owner" } } }) },
    from(table) {
      const call = { table, filters: [] };
      calls.push(call);
      const chain = {
        select(value) { call.select = value; return chain; },
        insert(value) { call.insert = value; return chain; },
        upsert(value, options) { call.upsert = value; call.options = options; return chain; },
        update(value) { call.update = value; return chain; },
        delete() { call.delete = true; return chain; },
        in(key, value) { call.filters.push(["in:" + key, value]); return chain; },
        eq(key, value) { call.filters.push([key, value]); return chain; },
        neq(key, value) { call.filters.push(["not:" + key, value]); return chain; },
        maybeSingle() { return Promise.resolve(result()); },
        then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
      };
      function result() {
        const value = results[table];
        return typeof value === "function" ? value(call) : (value ?? { data: null, error: null });
      }
      return chain;
    },
  };
  return client;
}
const baseNode = { id: "question", type: "question", data: { kind: "question", title: "Trusted title", paramKey: "trusted_key", required: true, answerType: "single_choice", options: [{ id: "option", label: "Trusted label", score: 7 }] } };
const quiz = { id: QUIZ, workspaceId: WORKSPACE, status: "active", name: "QA", slug: "qa", edges:[{source:"start",target:"question"},{source:"question",target:"end"}], nodes: [{id:"start",type:"start",data:{kind:"start"}}, baseNode, { id: "end", type: "end", data: { kind: "end", title: "Done" } }] };
const publicSession = session.issuePublicSession(QUIZ, WORKSPACE);
const claims = session.verifyPublicSession(request({}, { authorization: "Bearer " + publicSession.token }));
function publicRoute(filename, database, overrides = {}) {
  return loader({ "@/lib/security/public-quiz": { requirePublicQuiz: async () => ({ quiz, session: claims, admin: database }) }, ...overrides })(filename).POST;
}

test("signed session is scoped to unique server-generated IDs", () => {
  assert.equal(claims.quizId, QUIZ);
  assert.equal(claims.workspaceId, WORKSPACE);
  assert.equal(claims.leadId, publicSession.leadId);
  assert.notEqual(session.issuePublicSession(QUIZ, WORKSPACE).sessionId, claims.sessionId);
});
for (const token of ["", "anything", publicSession.token + "x", publicSession.token.split(".")[0] + ".AAAA"]) {
  test("reject malformed/tampered capability " + token.slice(-8), () => {
    assert.throws(() => session.verifyPublicSession(request({}, { authorization: "Bearer " + token })), /session/i);
  });
}
test("capabilities expire and are not accepted with a different key", () => {
  assert.throws(() => session.verifyPublicSession(request({}, { authorization: "Bearer " + publicSession.token }), Date.now() + 5 * 3600_000), /expired/i);
  const original = process.env.QUIZ_SESSION_SECRET;
  try {
    process.env.QUIZ_SESSION_SECRET = "another-test-secret-longer-than-thirty-two";
    assert.throws(() => session.verifyPublicSession(request({}, { authorization: "Bearer " + publicSession.token })), /Invalid/);
  } finally { process.env.QUIZ_SESSION_SECRET = original; }
});
test("no signing key fails closed", () => {
  const original = process.env.QUIZ_SESSION_SECRET, service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    delete process.env.QUIZ_SESSION_SECRET; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    assert.throws(() => session.issuePublicSession(QUIZ, WORKSPACE), /unavailable/);
  } finally {
    process.env.QUIZ_SESSION_SECRET = original;
    if (service) process.env.SUPABASE_SERVICE_ROLE_KEY = service;
  }
});
for (const body of [null, [], "text", 1]) {
  test("reject non-object JSON " + JSON.stringify(body), async () => {
    await assert.rejects(http.readJson(request(body)), /object/);
  });
}
test("body limit checks streamed bytes, not just headers", async () => {
  await assert.rejects(http.readJson(request({ value: "x".repeat(100) }), 32), (e) => e.status === 413);
});
test("invalid JSON, content types and cross-origin/null-origin writes are rejected", async () => {
  await assert.rejects(http.readJson(new Request("https://quiz.example/api", { method: "POST", body: "{", headers: { "content-type": "application/json" } })), /JSON/);
  await assert.rejects(http.readJson(request({}, { "content-type": "text/plain" })), (e) => e.status === 415);
  for (const origin of ["https://evil.example", "null"]) await assert.rejects(http.readJson(request({}, { origin })), (e) => e.status === 403);
  assert.deepEqual(await http.readJson(request({}, { origin: "https://quiz.example" })), {});
});
test("unexpected errors never disclose credentials or database messages", async () => {
  const response = await http.securePost(async () => { throw new Error("secret password database SQL"); })(request({}));
  assert.equal(response.status, 500);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.doesNotMatch(await response.text(), /secret|password|SQL/);
});

test("public quiz visibility does not grant ownership", async () => {
  const database = db({ quizzes: { data: { id: QUIZ, workspace_id: WORKSPACE } } });
  const owner = loader({ "@/lib/supabase/server": { createClient: async () => database } })("src/lib/security/owner.ts");
  await assert.rejects(owner.requireQuizOwner(QUIZ), (e) => e.status === 403);
  assert.deepEqual(database.calls[1].filters, [["id", WORKSPACE], ["owner_id", "owner"]]);
});
test("owner and unauthenticated checks", async () => {
  const database = db({ quizzes: { data: { id: QUIZ, workspace_id: WORKSPACE } }, workspaces: { data: { id: WORKSPACE } } });
  const owner = loader({ "@/lib/supabase/server": { createClient: async () => database } })("src/lib/security/owner.ts");
  assert.equal((await owner.requireQuizOwner(QUIZ)).user.id, "owner");
  database.auth.getUser = async () => ({ data: { user: null } });
  await assert.rejects(owner.requireQuizOwner(QUIZ), (e) => e.status === 401);
});

for (const address of ["0.0.0.0", "10.1.2.3", "100.100.100.200", "127.0.0.1", "169.254.169.254", "172.16.1.1", "192.168.1.1", "198.18.0.1", "224.0.0.1", "255.255.255.255", "::1", "::ffff:127.0.0.1", "fd00::1", "fe80::1", "2001:db8::1", "2002:7f00:1::"]) {
  test("SSRF rejects reserved address " + address, () => assert.equal(webhook.isPublicAddress(address), false));
}
test("public IPv4 and global IPv6 are allowed", () => {
  assert.equal(webhook.isPublicAddress("8.8.8.8"), true);
  assert.equal(webhook.isPublicAddress("2606:4700:4700::1111"), true);
});
for (const url of ["http://example.com", "https://127.1", "https://2130706433", "https://0x7f000001", "https://[::1]", "https://user:password@example.com", "https://example.com:8443", "https://example.internal", "file:///etc/passwd"]) {
  test("SSRF rejects URL " + url, () => assert.throws(() => webhook.webhookTarget(url)));
}
test("DNS results are all validated, including mixed public/private answers", async () => {
  let requests = 0;
  const module = loader({
    "node:dns/promises": { lookup: async () => [{ address: "8.8.8.8", family: 4 }, { address: "127.0.0.1", family: 4 }] },
    "node:https": { request: () => { requests++; } },
  })("src/lib/security/webhook.ts");
  await assert.rejects(module.sendWebhook("https://example.com/hook", {}), /not public/);
  assert.equal(requests, 0);
});
test("webhook pins validated DNS and does not follow redirects", async () => {
  let lookups = 0, requests = 0;
  const module = loader({
    "node:dns/promises": { lookup: async () => { lookups++; return [{ address: "8.8.8.8", family: 4 }]; } },
    "node:https": { request: (_url, options, response) => {
      requests++;
      options.lookup("example.com", {}, (error, address) => { assert.equal(error, null); assert.equal(address, "8.8.8.8"); });
      options.lookup("example.com", { all: true }, (error, addresses) => { assert.deepEqual(addresses, [{ address: "8.8.8.8", family: 4 }]); });
      const req = new EventEmitter();
      req.end = () => queueMicrotask(() => { response({ statusCode: 302, destroy() {} }); req.emit("close"); });
      return req;
    } },
  })("src/lib/security/webhook.ts");
  assert.deepEqual(await module.sendWebhook("https://example.com/hook", {}), { ok: false, status: 302 });
  assert.equal(lookups, 1); assert.equal(requests, 1);
});
test("webhook blocks header injection before DNS/network", async () => {
  await assert.rejects(webhook.sendWebhook("https://example.com", {}, "key\r\nInjected: value"), /Invalid/);
});

for (const url of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,test", "//evil.example", "/\\evil.example", "https://user:password@example.com", "https://example.com/\nfoo"]) {
  test("untrusted link is inert " + JSON.stringify(url), () => assert.equal(content.safeLink(url), undefined));
}
test("safe links and relative auth redirects are preserved", () => {
  for (const url of ["https://example.com/a", "/q/quiz", "#answer", "mailto:a@example.com", "tel:0500000000"]) assert.ok(content.safeLink(url));
  for (const value of ["//evil.example", "/\\evil.example", "https://evil.example", null]) assert.equal(content.safeRedirectPath(value), "/");
  assert.equal(content.safeRedirectPath("/quizzes?x=1"), "/quizzes?x=1");
});
test("CSV export neutralizes formulas and preserves quoted fields", () => {
  for (const value of ["=1+1", "+cmd", "-cmd", "@SUM(A1)", "  =1", "\tformula"]) assert.ok(content.csvCell(value).startsWith('"\''));
  assert.equal(content.csvCell('hello,"world"'), '"hello,""world"""');
});
test("server derives title, score, label and parameter key from quiz configuration", () => {
  const result = answers.normalizeAnswers([{ nodeId: "question", optionIds: ["option"], answerLabel: "fake", score: 999, questionTitle: "fake", paramKey: "fake" }], quiz.nodes);
  assert.equal(result[0].score, 7); assert.equal(result[0].answerLabel, "Trusted label");
  assert.equal(result[0].questionTitle, "Trusted title"); assert.equal(result[0].paramKey, "trusted_key");
});
test("reject unknown/duplicate nodes and forged option IDs", () => {
  const good = { nodeId: "question", optionIds: ["option"], answerLabel: "label" };
  for (const value of [[{ ...good, nodeId: "other" }], [good, good], [{ ...good, optionIds: ["other"] }], [{ ...good, optionIds: ["option", "option"] }], [{ ...good, optionIds: [] }]]) {
    assert.throws(() => answers.normalizeAnswers(value, quiz.nodes));
  }
});
test("rating rejects NaN, out-of-range and non-integer scores", () => {
  const nodes = [{ ...baseNode, data: { ...baseNode.data, answerType: "rating" } }];
  for (const value of ["NaN", "Infinity", "0", "11", "1.5"]) assert.throws(() => answers.normalizeAnswers([{ nodeId: "question", answerLabel: value }], nodes));
});
test("operation IDs are stable, scoped and valid UUIDs", () => {
  const first = operationId("dispatch", claims.sessionId);
  assert.equal(first, operationId("dispatch", claims.sessionId));
  assert.notEqual(first, operationId("capi", claims.sessionId));
  assert.equal(http.uuid(first), first);
});

test("submission uses signed IDs and server-calculated scores; retries ignore duplicates", async () => {
  const database = db();
  const POST = publicRoute("src/app/api/quiz-submissions/route.ts", database);
  const response = await POST(request({ lead: { name: "Test", score: 999, workspaceId: "other" }, answers: [{ nodeId: "question", answerLabel: "fake", optionIds: ["option"], score: 999 }] }));
  assert.equal(response.status, 200);
  assert.equal(database.calls[0].args.p_lead.id, claims.leadId);
  assert.equal(database.calls[0].args.p_lead.workspace_id, WORKSPACE);
  assert.equal(database.calls[0].args.p_lead.score, 7);
  assert.equal(database.calls.length,1);
  assert.equal(database.calls[0].rpc,"submit_quiz_response");
});
test("submission failures are visible; no later writes continue after failure", async () => {
  const database = db({ submit_quiz_response: { error: { message: "secret details" } } });
  const POST = publicRoute("src/app/api/quiz-submissions/route.ts", database);
  const response = await POST(request({ lead: { name: "Test" }, answers: [{nodeId:"question",optionIds:["option"],answerLabel:"label"}] }));
  assert.equal(response.status, 503);
  assert.equal(database.calls.length, 1);
  assert.doesNotMatch(await response.text(), /secret/);
});
test("session IDs cannot be swapped; stale heartbeats cannot reopen completed sessions", async () => {
  const database = db();
  const POST = publicRoute("src/app/api/quiz-sessions/track/route.ts", database);
  const bad = await POST(request({ quizId: QUIZ, sessionId: "other" }));
  assert.equal(bad.status, 403); assert.equal(database.calls.length, 0);
  const good = await POST(request({ quizId: QUIZ, sessionId: claims.sessionId, currentNodeId: "end", status: "completed", answers: [] }));
  assert.equal(good.status, 200);
  assert.ok(database.calls[1].filters.some(([key, value]) => key === "not:status" && value === "completed"));
});
test("dispatch requires own signed lead and scopes integrations to both tenant and quiz", async () => {
  const database = db({
    leads: { data: { id: claims.leadId, quiz_id: QUIZ, workspace_id: WORKSPACE } },
    quiz_submissions: { data: { id: claims.submissionId } },
    submission_answers: { data: [] }, integrations: { data: [] },
  });
  const POST = publicRoute("src/app/api/dispatch-integrations/route.ts", database);
  assert.equal((await POST(request({ leadId: "someone-else" }))).status, 403);
  assert.equal(database.calls.length, 0);
  assert.equal((await POST(request({ leadId: claims.leadId }))).status, 200);
  const integrations = database.calls.find((c) => c.table === "integrations");
  assert.deepEqual(integrations.filters, [["quiz_id", QUIZ], ["workspace_id", WORKSPACE], ["enabled", true]]);
});
test("duplicate dispatch is not delivered twice", async () => {
  let deliveries = 0;
  const database = db({
    leads: { data: { id: claims.leadId, quiz_id: QUIZ, workspace_id: WORKSPACE } },
    quiz_submissions: { data: { id: claims.submissionId } },
    submission_answers: { data: [] }, integrations: { data: [{ kind: "webhook", url: "https://example.com" }] },
    quiz_tracking_activity: { error: { code: "23505" } },
  });
  const POST = publicRoute("src/app/api/dispatch-integrations/route.ts", database, { "@/lib/security/webhook": { sendWebhook: async () => { deliveries++; } } });
  const result = await POST(request({ leadId: claims.leadId }));
  assert.equal((await result.json()).ok, true); assert.equal(deliveries, 0);
});
test("CAPI cannot send arbitrary or disabled event definitions", async () => {
  const database = db();
  const POST = publicRoute("src/app/api/tracking/fire-capi/route.ts", database);
  assert.equal((await POST(request({ quizId: QUIZ, definitionId: DEFINITION, eventName: "Forged" }))).status, 403);
  assert.deepEqual(database.calls[0].filters, [["id", DEFINITION], ["quiz_id", QUIZ], ["enabled", true], ["send_to_capi", true]]);
});
test("retired unauthenticated answer-write endpoint cannot write", async () => {
  const POST = load("src/app/api/save-answers/route.ts").POST;
  assert.equal((await POST(request({}))).status, 410);
});
for (const file of ["quiz-submissions", "quiz-sessions/track", "dispatch-integrations", "tracking/fire-capi", "analytics"]) {
  test(file + " rejects anonymous writes before accessing admin/database", async () => {
    let touched = false;
    const POST = loader({ "@/lib/supabase/admin": { createAdminClient: () => { touched = true; throw new Error("should not be used"); } } })("src/app/api/" + file + "/route.ts").POST;
    assert.equal((await POST(request({}))).status, 401);
    assert.equal(touched, false);
  });
}

test("per-instance rate limits expire and use separate route budgets", () => {
  const { allowRequest } = loader()("src/lib/security/rate-limit.ts");
  const req = new Request("https://quiz.example/api/relay-webhook");
  for (let i = 0; i < 10; i++) assert.equal(allowRequest(req, 1000), true);
  assert.equal(allowRequest(req, 1000), false);
  assert.equal(allowRequest(new Request("https://quiz.example/api/analytics"), 1000), true);
  assert.equal(allowRequest(req, 62000), true);
});

for (const route of ["tracking/save-token", "tracking/test-meta"]) {
  test(route + " never touches admin secrets when a visitor can read but does not own a quiz", async () => {
    let adminTouched = false;
    const database = db({ quizzes: { data: { id: QUIZ, workspace_id: WORKSPACE } } });
    const POST = loader({
      "@/lib/supabase/server": { createClient: async () => database },
      "@/lib/supabase/admin": { createAdminClient: () => { adminTouched = true; throw new Error("Must not access secrets"); } },
    })("src/app/api/" + route + "/route.ts").POST;
    assert.equal((await POST(request({ quizId: QUIZ, token: "valid-looking-token" }))).status, 403);
    assert.equal(adminTouched, false);
  });
}
test("relay requires authentication and ignores caller-supplied URLs/secrets", async () => {
  let delivered = false;
  const database = db();
  database.auth.getUser = async () => ({ data: { user: null } });
  const POST = loader({
    "@/lib/supabase/server": { createClient: async () => database },
    "@/lib/security/webhook": { sendWebhook: async () => { delivered = true; } },
  })("src/app/api/relay-webhook/route.ts").POST;
  assert.equal((await POST(request({ integrationId: DEFINITION, url: "https://127.0.0.1", secret: "fake" }))).status, 401);
  assert.equal(delivered, false);
});
test("public APIs reject paused quizzes and mismatched workspace claims", async () => {
  for (const current of [{ ...quiz, status: "paused" }, { ...quiz, workspaceId: "other" }]) {
    const module = loader({
      "@/lib/supabase/admin": { createAdminClient: () => ({}) },
      "@/lib/supabase/queries": { fetchQuizFull: async () => current },
    })("src/lib/security/public-quiz.ts");
    await assert.rejects(module.requirePublicQuiz(request({}, { authorization: "Bearer " + publicSession.token })), (e) => e.status === 403);
  }
});
test("atomic flow RPC preserves revision on failed save",async()=>{
 const database=db({save_quiz_flow:{error:new Error("write failed")}});
 const state={revision:4};
 await assert.rejects(loader()("src/lib/supabase/queries.ts").saveFlow(database,QUIZ,[{...baseNode,position:{x:0,y:0}}],[],state),/write failed/);
 assert.equal(state.revision,4);assert.equal(database.calls.length,1);
});
test("flow revision advances only after confirmed atomic save",async()=>{
 const database=db({save_quiz_flow:{data:5,error:null}}),state={revision:4};
 await loader()("src/lib/supabase/queries.ts").saveFlow(database,QUIZ,[{...baseNode,position:{x:0,y:0}}],[],state);
 assert.equal(state.revision,5);assert.equal(database.calls[0].args.p_expected_revision,4);
});
test("stale editor receives actionable conflict without overwriting revision",async()=>{
 const database=db({save_quiz_flow:{error:{code:"PT409"}}}),state={revision:4};
 await assert.rejects(loader()("src/lib/supabase/queries.ts").saveFlow(database,QUIZ,[],[],state),/חלון אחר/);
 assert.equal(state.revision,4);
});
test("invalid graph rejects before RPC",async()=>{
 const database=db();
 await assert.rejects(loader()("src/lib/supabase/queries.ts").saveFlow(database,QUIZ,[],[{id:"e",source:"missing",target:"missing"}],{revision:0}));
 assert.equal(database.calls.length,0);
});
test("queued saves use the newly confirmed revision",async()=>{
 let release;const gate=new Promise(r=>{release=r});let calls=0;
 const database=db({save_quiz_flow:async()=>{calls++;if(calls===1)await gate;return {data:calls,error:null}}}),state={revision:0};
 const queries=loader()("src/lib/supabase/queries.ts");
 const first=queries.saveFlow(database,QUIZ,[],[],state),second=queries.saveFlow(database,QUIZ,[],[],state);
 await new Promise(r=>setImmediate(r));assert.equal(calls,1);release();await first;await second;
 assert.deepEqual(database.calls.map(c=>c.args.p_expected_revision),[0,1]);
});
test("automatic flow cycles resolve to no target instead of an unusable condition node", () => {
  const runtime = loader()("src/lib/quiz-runtime.ts");
  const cyclic = { nodes: [{ id: "start", type: "start", data: { kind: "start" } }, { id: "loop", type: "condition", data: { kind: "condition", rules: [] } }], edges: [{ source: "start", target: "loop" }, { source: "loop", target: "loop" }] };
  assert.equal(runtime.resolveRenderable(cyclic, "start"), undefined);
});
test("submission client surfaces transport/server failures instead of claiming success", async () => {
  const queries = loader()("src/lib/supabase/queries.ts");
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ ok: false }), { status: 503 });
    await assert.rejects(queries.submitPublicQuizResponse({}, quiz, { name: "QA" }, [], publicSession), /שמירת/);
    globalThis.fetch = async (_url, options) => {
      assert.equal(options.headers.Authorization, "Bearer " + publicSession.token);
      return new Response(JSON.stringify({ ok: true, leadId: claims.leadId }));
    };
    assert.equal(await queries.submitPublicQuizResponse({}, quiz, { name: "QA" }, [], publicSession), claims.leadId);
  } finally { globalThis.fetch = original; }
});

test("condition numeric comparisons reject NaN and select matching answer",()=>{
 const runtime=loader()("src/lib/quiz-runtime.ts");
 assert.equal(runtime.conditionMatches({sourceField:"score",operator:"gte",value:"7"},{score:7}),true);
 assert.equal(runtime.conditionMatches({sourceField:"answer",answerNodeId:"q",operator:"eq",value:"yes"},{answers:{q:{answerLabel:"yes"}}}),true);
 assert.equal(runtime.conditionMatches({sourceField:"answer",answerNodeId:"q",operator:"gt",value:"1"},{answers:{q:{answerLabel:"NaN"}}}),false);
});
test("AB assignment is stable within session and respects zero/full splits",()=>{
 const {pickAbTestHandle}=loader()("src/lib/quiz-runtime.ts");
 const node={id:"ab",data:{kind:"ab_test",splitPercent:50}};
 assert.equal(pickAbTestHandle(node,"session"),pickAbTestHandle(node,"session"));
 assert.equal(pickAbTestHandle({...node,data:{kind:"ab_test",splitPercent:0}},"session"),"b");
 assert.equal(pickAbTestHandle({...node,data:{kind:"ab_test",splitPercent:100}},"session"),"a");
});
test("condition follows configured target, not first edge",()=>{
 const {resolveRenderable}=loader()("src/lib/quiz-runtime.ts");
 const graph={nodes:[{id:"start",type:"start",data:{kind:"start"}},{id:"c",type:"condition",data:{kind:"condition",rules:[{id:"r",sourceField:"score",operator:"gte",value:"7",targetNodeId:"hot"}],elseNodeId:"cold"}},...["hot","cold"].map(id=>({id,type:"end",data:{kind:"end"}}))],edges:[{source:"start",target:"c"},{source:"c",target:"cold"}]};
 assert.equal(resolveRenderable(graph,"start",null,{score:9}).id,"hot");
 assert.equal(resolveRenderable(graph,"start",null,{score:0}).id,"cold");
});
test("shared limit failure denies instead of silently allowing",async()=>{
 const {sharedBudget}=loader({"@/lib/supabase/admin":{createAdminClient:()=>({rpc:async()=>({error:{message:"db down"}})})}})("src/lib/security/shared-rate-limit.ts");
 await assert.rejects(sharedBudget(request({})),/unavailable/);
});
test("delivery worker records retry for 503 and terminal failure for 400",async()=>{
 for(const status of [503,400,200]){
 const database=db({claim_delivery_jobs:{data:[{id:DEFINITION,quiz_id:QUIZ,integration_id:WORKSPACE,kind:"webhook",payload:{},lease_token:QUIZ}]},integrations:{data:{enabled:true,url:"https://example.com",quiz_id:QUIZ}}});
 const {processDeliveryJobs}=loader({"@/lib/supabase/admin":{createAdminClient:()=>database},"./webhook":{sendWebhook:async()=>({status,ok:status===200})}})("src/lib/security/delivery.ts");
 await processDeliveryJobs();
 const finish=database.calls.find(c=>c.rpc==="finish_delivery_job");
 assert.equal(finish.args.p_success,status===200);assert.equal(finish.args.p_permanent,status===400);
 }
});

test("submission path ignores disconnected contact requirements and rejects skipped questions",()=>{
 const {submissionPath}=loader()("src/lib/security/submission-path.ts");
 const disconnected={...quiz,nodes:[...quiz.nodes,{id:"orphan",type:"lead_details",data:{kind:"lead_details",showConsent:true}}]};
 const valid=answers.normalizeAnswers([{nodeId:"question",optionIds:["option"],answerLabel:"label"}],quiz.nodes);
 assert.equal(submissionPath(disconnected,valid,"session").some(n=>n.id==="orphan"),false);
 assert.throws(()=>submissionPath(disconnected,[],"session"),/Required answer/);
});

test("Meta delivery requires a positive provider acknowledgement, not just HTTP 200",async()=>{
 const original=globalThis.fetch;
 try {
  for(const [body,expected] of [[{events_received:1},true],[{events_received:0},false],[{error:{code:190}},false]]){
   const database=db({claim_delivery_jobs:{data:[{id:DEFINITION,quiz_id:QUIZ,kind:"capi",payload:{event_name:"Lead"},lease_token:QUIZ}]},quiz_tracking_settings:{data:{meta_pixel_id:"123456789"}},quiz_tracking_secrets:{data:{meta_access_token:"fixture-only"}}});
   globalThis.fetch=async()=>new Response(JSON.stringify(body),{status:200});
   const {processDeliveryJobs}=loader({"@/lib/supabase/admin":{createAdminClient:()=>database}})("src/lib/security/delivery.ts");
   await processDeliveryJobs();
   assert.equal(database.calls.find(c=>c.rpc==="finish_delivery_job").args.p_success,expected);
  }
 } finally {globalThis.fetch=original;}
});

test("page CSP restricts scripts to the fresh nonce and blocks inline handlers",()=>{
 const {pageCsp}=loader()("src/lib/security/csp.ts");
 const policy=pageCsp("randomNonceFixture123456",false);
 const scripts=policy.split("; ").find(s=>s.startsWith("script-src "));
 assert.match(scripts,/'nonce-randomNonceFixture123456'/);
 assert.doesNotMatch(scripts,/unsafe-inline|unsafe-eval/);
 assert.match(policy,/script-src-attr 'none'/);
 assert.match(policy,/frame-ancestors 'self'/);
 assert.match(pageCsp("randomNonceFixture654321",true),/frame-ancestors \*/);
 assert.throws(()=>pageCsp("injected'; script-src *",true));
});
test("tracking document stays sandboxed at top level and rejects configuration injection",async()=>{
 const {GET}=loader()("src/app/api/tracking/sandbox/route.ts");
 const r=GET(new Request("https://quiz.example/api/tracking/sandbox?gtm="+encodeURIComponent('</script><script>alert(1)</script>')+"&pixel=123456"));
 assert.match(r.headers.get("content-security-policy"),/^sandbox allow-scripts;/);
 assert.doesNotMatch(r.headers.get("content-security-policy"),/allow-same-origin|allow-top-navigation|allow-forms/);
 const text=await r.text();
 assert.doesNotMatch(text,/alert\(1\)/);
 assert.ok(text.includes('const gtm=null'));
 assert.ok(text.includes('const pixel="123456"'));
});

test("Meta test requires a test code before reading server credentials",async()=>{
 let touched=false;
 const POST=loader({"@/lib/security/owner":{requireQuizOwner:async()=>({})},"@/lib/supabase/admin":{createAdminClient:()=>{touched=true;return db();}}})("src/app/api/tracking/test-meta/route.ts").POST;
 assert.equal((await POST(request({quizId:QUIZ}))).status,400);
 assert.equal(touched,false);
});
test("Meta test forwards the debug code and requires actual event acknowledgement",async()=>{
 const original=globalThis.fetch;
 try {
  for(const received of [0,1]){
   const database=db({quiz_tracking_settings:{data:{meta_pixel_id:"123456789"}},quiz_tracking_secrets:{data:{meta_access_token:"fixture-only"}}});
   globalThis.fetch=async(_url,options)=>{const payload=JSON.parse(options.body);assert.equal(payload.test_event_code,"TEST12345");assert.equal(payload.data[0].event_name,"TestEvent");return new Response(JSON.stringify({events_received:received}));};
   const POST=loader({"@/lib/security/owner":{requireQuizOwner:async()=>({})},"@/lib/supabase/admin":{createAdminClient:()=>database}})("src/app/api/tracking/test-meta/route.ts").POST;
   const result=await (await POST(request({quizId:QUIZ,testEventCode:"TEST12345"}))).json();
   assert.equal(result.ok,received===1);
  }
 } finally {globalThis.fetch=original;}
});

test("session key transition preserves active capabilities only during explicit grace",()=>{
 const names=["QUIZ_SESSION_SECRET","QUIZ_SESSION_PREVIOUS_SECRET","QUIZ_SESSION_PREVIOUS_VALID_UNTIL"];
 const old=Object.fromEntries(names.map(k=>[k,process.env[k]])),now=Date.now();
 const auth=t=>request({}, {authorization:"Bearer "+t.token});
 try{
  process.env.QUIZ_SESSION_SECRET="old-dedicated-fixture-key-over-thirty-two-characters";
  const previous=session.issuePublicSession(QUIZ,WORKSPACE,now);
  process.env.QUIZ_SESSION_PREVIOUS_SECRET=process.env.QUIZ_SESSION_SECRET;
  process.env.QUIZ_SESSION_SECRET="new-dedicated-fixture-key-over-thirty-two-characters";
  process.env.QUIZ_SESSION_PREVIOUS_VALID_UNTIL=new Date(now+60000).toISOString();
  assert.equal(session.verifyPublicSession(auth(previous),now+1000).quizId,QUIZ);
  const current=session.issuePublicSession(QUIZ,WORKSPACE,now);
  assert.equal(session.verifyPublicSession(auth(current),now+61000).quizId,QUIZ);
  assert.throws(()=>session.verifyPublicSession(auth(previous),now+61000),/Invalid session/);
  process.env.QUIZ_SESSION_PREVIOUS_VALID_UNTIL="invalid";
  assert.throws(()=>session.verifyPublicSession(auth(previous),now+1000),/Invalid session/);
 }finally{for(const key of names){if(old[key]===undefined)delete process.env[key];else process.env[key]=old[key];}}
});
test("database service key cannot silently replace a missing session signing secret",()=>{
 const key=process.env.QUIZ_SESSION_SECRET,service=process.env.SUPABASE_SERVICE_ROLE_KEY;
 try{delete process.env.QUIZ_SESSION_SECRET;process.env.SUPABASE_SERVICE_ROLE_KEY="database-only-secret-that-must-not-sign-visitors";assert.throws(()=>session.issuePublicSession(QUIZ,WORKSPACE),/unavailable/);}
 finally{process.env.QUIZ_SESSION_SECRET=key;if(service===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=service;}
});

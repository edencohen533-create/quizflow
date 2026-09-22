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
const quiz = { id: QUIZ, workspaceId: WORKSPACE, status: "active", name: "QA", slug: "qa", nodes: [baseNode, { id: "end", type: "end", data: { kind: "end", title: "Done" } }] };
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
  assert.equal(database.calls[0].upsert.id, claims.leadId);
  assert.equal(database.calls[0].upsert.workspace_id, WORKSPACE);
  assert.equal(database.calls[0].upsert.score, 7);
  assert.ok(database.calls.every((c) => c.options.ignoreDuplicates));
});
test("submission failures are visible; no later writes continue after failure", async () => {
  const database = db({ quiz_submissions: { error: { message: "secret details" } } });
  const POST = publicRoute("src/app/api/quiz-submissions/route.ts", database);
  const response = await POST(request({ lead: { name: "Test" }, answers: [] }));
  assert.equal(response.status, 503);
  assert.equal(database.calls.length, 2);
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
  assert.equal((await result.json()).duplicate, true); assert.equal(deliveries, 0);
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
test("flow write failure never deletes the previous graph", async () => {
  const database = db({
    quiz_nodes: (call) => call.upsert ? { error: new Error("write failed") } : { data: [{ id: "old-node" }] },
    quiz_edges: { data: [] },
  });
  const queries = loader()("src/lib/supabase/queries.ts");
  await assert.rejects(queries.saveFlow(database, QUIZ, [{ ...baseNode, position: { x: 0, y: 0 } }], []), /write failed/);
  assert.ok(database.calls.every((c) => !c.delete));
});
test("flow saves remove only obsolete rows after successful replacement writes", async () => {
  const database = db({
    quiz_nodes: (call) => call.select ? { data: [{ id: "old-node" }, { id: "question" }] } : { error: null },
    quiz_edges: { data: [] },
  });
  const queries = loader()("src/lib/supabase/queries.ts");
  await queries.saveFlow(database, QUIZ, [{ ...baseNode, position: { x: 0, y: 0 } }], []);
  const deletion = database.calls.find((c) => c.delete);
  assert.deepEqual(deletion.filters, [["quiz_id", QUIZ], ["in:id", ["old-node"]]]);
  assert.ok(database.calls.findIndex((c) => c.upsert) < database.calls.indexOf(deletion));
});
test("invalid flow edges are rejected before any database operation", async () => {
  const database = db();
  const queries = loader()("src/lib/supabase/queries.ts");
  await assert.rejects(queries.saveFlow(database, QUIZ, [], [{ id: "edge", source: "missing", target: "missing" }]));
  assert.equal(database.calls.length, 0);
});
test("concurrent flow saves are serialized and a failed save does not poison the queue", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let writes = 0;
  const database = db({
    quiz_nodes: (call) => {
      if (!call.upsert) return { data: [] };
      writes++;
      return writes === 1 ? gate.then(() => ({ error: new Error("first failed") })) : { error: null };
    },
    quiz_edges: { data: [] },
  });
  const queries = loader()("src/lib/supabase/queries.ts");
  const first = queries.saveFlow(database, QUIZ, [{ ...baseNode, position: { x: 0, y: 0 } }], []);
  const second = queries.saveFlow(database, QUIZ, [{ ...baseNode, position: { x: 1, y: 0 } }], []);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(writes, 1);
  release();
  await assert.rejects(first, /first failed/);
  await second;
  assert.equal(writes, 2);
});

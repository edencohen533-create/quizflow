import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

// Execute the real query/mapping modules with TypeScript's existing compiler.
// No database credentials, network requests, or new test dependencies needed.
const modules = new Map();
function loadTs(filename) {
  filename = path.resolve(filename);
  if (modules.has(filename)) return modules.get(filename).exports;
  const module = { exports: {} };
  modules.set(filename, module);
  const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const require = (specifier) => {
    const target = specifier.startsWith("@/")
      ? path.resolve("src", specifier.slice(2))
      : path.resolve(path.dirname(filename), specifier);
    return loadTs(target + ".ts");
  };
  new Function("require", "module", "exports", compiled)(require, module, module.exports);
  return module.exports;
}
const queries = loadTs("src/lib/supabase/queries.ts");
const { isStoredQuizImage } = loadTs("src/lib/quiz-images.ts");
const { THEME_PRESETS } = loadTs("src/lib/types.ts");
const { themeToRow } = loadTs("src/lib/supabase/mappers.ts");

function client(data, error = null) {
  const requests = [];
  return {
    requests,
    from(table) {
      const request = { table, filters: [] };
      requests.push(request);
      const builder = {
        select(value) { request.select = value; return builder; },
        eq(key, value) { request.filters.push([key, value]); return builder; },
        order(key, options) { request.order = [key, options]; return builder; },
        maybeSingle() { request.single = true; return Promise.resolve({ data, error }); },
        then(resolve, reject) { return Promise.resolve({ data, error }).then(resolve, reject); },
      };
      return builder;
    },
  };
}
const quiz = {
  id: "quiz-1", workspace_id: "workspace-1", name: "Quiz", slug: "quiz",
  status: "draft", allow_back: true, created_at: "2026-09-22", updated_at: "2026-09-22",
  quiz_nodes: [{ quiz_id: "quiz-1", id: "start", type: "start", position_x: 12, position_y: 24, data: { kind: "start" } }],
  quiz_edges: [{ id: "edge", source: "start", target: "question", source_handle: null }],
  quiz_themes: themeToRow("quiz-1", THEME_PRESETS.clean_light),
};

for (const [fn, column, value] of [
  ["fetchQuizFull", "id", "quiz-1"],
  ["fetchQuizFullBySlug", "slug", "quiz"],
]) {
  test(fn + " loads the complete flow in one RLS-scoped request", async () => {
    const db = client(quiz);
    const result = await queries[fn](db, value);
    assert.equal(db.requests.length, 1);
    assert.equal(db.requests[0].table, "quizzes");
    assert.deepEqual(db.requests[0].filters, [[column, value]]);
    assert.match(db.requests[0].select, /quiz_nodes\(\*\)/);
    assert.equal(result.nodes[0].position.x, 12);
    assert.equal(result.edges[0].target, "question");
    assert.equal(result.theme.primaryColor, THEME_PRESETS.clean_light.primaryColor);
    assert.equal(result.status, "draft"); // Owner previews must not be filtered out.
  });
  test(fn + " preserves RLS-hidden/not-found and error results", async () => {
    assert.equal(await queries[fn](client(null), value), null);
    const error = new Error("database unavailable");
    await assert.rejects(queries[fn](client(null, error), value), error);
  });
}

test("missing theme and empty flow preserve defaults", async () => {
  const result = await queries.fetchQuizFull(client({ ...quiz, quiz_nodes: [], quiz_edges: [], quiz_themes: null }), "quiz-1");
  assert.deepEqual(result.nodes, []);
  assert.deepEqual(result.edges, []);
  assert.equal(result.theme.fontFamily, THEME_PRESETS.clean_light.fontFamily);
});

test("theme embedding accepts the array relationship shape too", async () => {
  const result = await queries.fetchQuizFull(client({ ...quiz, quiz_themes: [quiz.quiz_themes] }), "quiz-1");
  assert.equal(result.theme.backgroundColor, THEME_PRESETS.clean_light.backgroundColor);
});

test("quiz list fetches only workspace-related themes, without flow", async () => {
  const db = client([{ ...quiz, quiz_nodes: undefined, quiz_edges: undefined }]);
  const result = await queries.listQuizzes(db, "workspace-1");
  assert.equal(db.requests.length, 1);
  assert.deepEqual(db.requests[0].filters, [["workspace_id", "workspace-1"]]);
  assert.equal(db.requests[0].select, "*, quiz_themes(*)");
  assert.deepEqual(result[0].nodes, []);
});

const lead = {
  id: "lead-1", workspace_id: "workspace-1", quiz_id: "quiz-1", name: "Test",
  phone: "0500000000", email: "", score: 5, category: "cold", status: "new",
  created_at: "2026-09-22", quizzes: { name: "Quiz" }, utm_content: "ad-name",
};

test("lead list loads export fields without downloading every lead's details", async () => {
  const db = client([lead]);
  const rows = await queries.listLeadSummaries(db, "workspace-1");
  assert.equal(db.requests.length, 1);
  assert.equal(db.requests[0].select, "*, quizzes(name)");
  assert.deepEqual(db.requests[0].filters, [["workspace_id", "workspace-1"]]);
  assert.equal(rows[0].utmContent, "ad-name");
  assert.equal(rows[0].phone, lead.phone);
  assert.deepEqual(rows[0].answers, []);
  assert.deepEqual(rows[0].notes, []);
});

test("one lead's details retain all submissions, notes, and chronological history", async () => {
  const answer = { node_id: "age", question_title: "Age?", answer_label: "30", score: 5, param_key: "age" };
  const db = client({ ...lead,
    lead_notes: [{ id: "note", text: "Note", created_at: "2026-09-22" }],
    lead_status_history: [{ status: "closed", created_at: "2026-09-23" }, { status: "new", created_at: "2026-09-22" }],
    quiz_submissions: [{ submission_answers: [answer] }, { submission_answers: [{ ...answer, node_id: "other" }] }],
  });
  const result = await queries.getLeadDetails(db, "workspace-1", "lead-1");
  assert.equal(db.requests.length, 1);
  assert.deepEqual(db.requests[0].filters, [["workspace_id", "workspace-1"], ["id", "lead-1"]]);
  assert.equal(result.answers.length, 2);
  assert.equal(result.answers[0].paramKey, "age");
  assert.equal(result.notes[0].text, "Note");
  assert.deepEqual(result.statusHistory.map((entry) => entry.status), ["new", "closed"]);
});

test("lead details handle empty relations, inaccessible leads, and query failure", async () => {
  const result = await queries.getLeadDetails(client(lead), "workspace-1", "lead-1");
  assert.deepEqual(result.answers, []);
  assert.deepEqual(result.notes, []);
  assert.equal(await queries.getLeadDetails(client(null), "workspace-1", "missing"), null);
  await assert.rejects(queries.getLeadDetails(client(null, new Error("denied")), "workspace-1", "lead-1"), /denied/);
});

test("image optimizer only receives this project's public media", () => {
  const origin = "https://example.supabase.co";
  const image = origin + "/storage/v1/object/public/quiz-media/avatar.png";
  assert.equal(isStoredQuizImage(image, origin), true);
  for (const src of [
    "https://other.supabase.co/storage/v1/object/public/quiz-media/avatar.png",
    origin + "/storage/v1/object/sign/quiz-media/avatar.png",
    origin + "/storage/v1/object/public/other/avatar.png",
    image + "?token=private",
    "data:image/png;base64,AAAA",
    "/local.png",
    image.replace("https:", "http:"),
  ]) assert.equal(isStoredQuizImage(src, origin), false, src);
  assert.equal(isStoredQuizImage(image, ""), false);
});

function mutationClient(source = quiz, fail = "") {
  const calls = [];
  return {
    calls,
    async rpc(name, args) { calls.push({ rpc: name, args }); return fail === "flow" ? { error: new Error("flow failed") } : { data: 1, error: null }; },
    from(table) {
      const call = { table, filters: [] }; calls.push(call);
      const builder = {
        select(value) { call.select = value; return builder; },
        eq(key, value) { call.filters.push([key, value]); return builder; },
        insert(value) { call.insert = value; return builder; },
        update(value) { call.update = value; return builder; },
        delete() { call.delete = true; return builder; },
        maybeSingle() { return Promise.resolve({ data: source, error: null }); },
        single() { return Promise.resolve({ data: { ...source, ...call.insert, id: "copy-id", flow_revision: 0 }, error: null }); },
        then(resolve, reject) { return Promise.resolve({ data: null, error: fail === "theme" && table === "quiz_themes" ? new Error("theme failed") : null }).then(resolve, reject); },
      };
      return builder;
    }
  };
}
const completeSource = { ...quiz, quiz_nodes: [...quiz.quiz_nodes, { id: "question", type: "end", position_x: 0, position_y: 100, data: { kind: "end", title: "Copied ending" } }] };

test("duplicate from a list summary fetches and copies the complete current flow", async () => {
  const database = mutationClient(completeSource);
  const copy = await queries.duplicateQuiz(database, { id: quiz.id, workspaceId: "stale", name: "stale", nodes: [], edges: [], theme: THEME_PRESETS.dark_premium });
  const saved = database.calls.find(c => c.rpc === "save_quiz_flow");
  assert.ok(saved);
  assert.equal(saved.args.p_nodes.length, 2);
  assert.equal(saved.args.p_edges.length, 1);
  assert.equal(copy.nodes[1].data.title, "Copied ending");
  assert.equal(copy.flowRevision, 1);
  assert.equal(copy.name, "Quiz (עותק)");
  assert.equal(copy.workspaceId, "workspace-1");
  assert.equal(copy.status, "draft");
  assert.equal(copy.theme.primaryColor, THEME_PRESETS.clean_light.primaryColor);
});

test("failed duplication removes only its new partial draft and reports failure", async () => {
  for (const fail of ["flow", "theme"]) {
    const database = mutationClient(completeSource, fail);
    await assert.rejects(queries.duplicateQuiz(database, { id: quiz.id, name: quiz.name, slug: quiz.slug, workspaceId: quiz.workspace_id, nodes: [], edges: [], theme: THEME_PRESETS.clean_light }), /failed/);
    const removed = database.calls.filter(c => c.delete);
    assert.equal(removed.length, 1);
    assert.equal(removed[0].table, "quizzes");
    assert.deepEqual(removed[0].filters, [["id", "copy-id"]]);
  }
});

test("missing duplication source creates nothing", async () => {
  const database = mutationClient(null);
  await assert.rejects(queries.duplicateQuiz(database, { id: "missing", nodes: [], edges: [], theme: THEME_PRESETS.clean_light }));
  assert.equal(database.calls.some(c => c.insert || c.rpc), false);
});

test("activation checks full flow before writing while pause remains possible", async () => {
  const broken = { ...completeSource, quiz_edges: [] };
  const rejected = mutationClient(broken);
  await assert.rejects(queries.updateQuizMeta(rejected, quiz.id, { status: "active" }));
  assert.equal(rejected.calls.some(c => c.update), false);
  const allowed = mutationClient(completeSource);
  await queries.updateQuizMeta(allowed, quiz.id, { status: "active" });
  assert.deepEqual(allowed.calls.find(c => c.update).update, { status: "active" });
  const paused = mutationClient(broken);
  await queries.updateQuizMeta(paused, quiz.id, { status: "paused" });
  assert.deepEqual(paused.calls.find(c => c.update).update, { status: "paused" });
});

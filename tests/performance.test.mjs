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

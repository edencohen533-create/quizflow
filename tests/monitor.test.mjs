import test from "node:test";
import assert from "node:assert/strict";
import { probe, report, checks, incidentTitle } from "../scripts/monitor-production.mjs";

const healthy = url => new Response(url.includes("/api/jobs") ? "{}" : "<form>נתחיל", { status: url.includes("/api/jobs") ? 401 : 200 });
test("healthy public routes and protected worker pass", async () => {
  assert.deepEqual(await probe(async url => healthy(url)), []);
});
test("transient transport failures retry without false incident", async () => {
  let requests = 0;
  assert.deepEqual(await probe(async url => { if (++requests === 1) throw new Error("network"); return healthy(url); }, async () => {}), []);
  assert.equal(requests, 4);
});
test("200 error shells and an unprotected worker fail", async () => {
  let requests = 0;
  assert.deepEqual(await probe(async () => { requests++; return new Response("error shell"); }, async () => {}), checks.map(c => c.name));
  assert.equal(requests, 9);
});
test("timeouts or connection failures count as failures", async () => {
  assert.deepEqual(await probe(async () => { throw new Error("timeout"); }, async () => {}), checks.map(c => c.name));
});
const existing = { number: 10, title: incidentTitle, user: { login: "github-actions[bot]" } };
test("new incident assigned to repository owner", async () => {
  const calls = [];
  await report(["login"], async (...args) => { calls.push(args); return []; }, "https://example.test/run");
  assert.equal(calls[1][0], "POST");
  assert.deepEqual(calls[1][2].assignees, ["edencohen533-create"]);
});
test("ongoing incident does not create duplicate or spam comments", async () => {
  const calls = [];
  await report(["login"], async (...args) => { calls.push(args); return [existing]; }, "https://example.test/run");
  assert.equal(calls.length, 1);
});
test("recovery comments then closes incident", async () => {
  const calls = [];
  await report([], async (...args) => { calls.push(args); return [existing]; }, "https://example.test/run");
  assert.equal(calls[1][1], "/issues/10/comments");
  assert.equal(calls[2][2].state, "closed");
});
test("does not close an issue impersonating the monitor", async () => {
  const calls = [];
  await report([], async (...args) => { calls.push(args); return [{ ...existing, user: { login: "someone-else" } }]; }, "https://example.test/run");
  assert.equal(calls.length, 1);
});
test("incident lookup follows pagination", async () => {
  const calls = [];
  await report(["login"], async (...args) => { calls.push(args); return calls.length === 1 ? Array.from({ length: 100 }, () => ({ title: "unrelated" })) : [existing]; }, "https://example.test/run");
  assert.equal(calls.length, 2);
  assert.match(calls[1][1], /page=2$/);
});
test("GitHub API errors fail the monitor instead of reporting delivery", async () => {
  await assert.rejects(report(["login"], async () => { throw new Error("denied"); }, "https://example.test/run"), /denied/);
});

import { pathToFileURL } from "node:url";

const origin = "https://quizflow-flax.vercel.app";
export const incidentTitle = "[Operations] Production availability check failed";
export const checks = [
  { name: "login", path: "/login", status: 200, text: "<form" },
  { name: "public quiz", path: "/q/" + encodeURIComponent("פרוביוטיקה"), status: 200, text: "נתחיל" },
  { name: "worker authentication", path: "/api/jobs/deliver", method: "POST", status: 401 },
];

export async function probe(fetcher = fetch, pause = ms => new Promise(r => setTimeout(r, ms))) {
  const failures = [];
  for (const check of checks) {
    let passed = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetcher(origin + check.path, {
          method: check.method ?? "GET",
          redirect: "error",
          signal: AbortSignal.timeout(15000),
          headers: { "User-Agent": "QuizFlow-Availability-Monitor" },
        });
        const body = await response.text();
        passed = response.status === check.status &&
          (!check.text || body.includes(check.text));
      } catch { passed = false; }
      if (passed) break;
      if (attempt < 2) await pause(3000);
    }
    if (!passed) failures.push(check.name);
  }
  return failures;
}

export async function report(failures, api, runUrl) {
  const issues = [];
  for (let page = 1; ; page++) {
    const batch = await api("GET", "/issues?state=open&creator=github-actions%5Bbot%5D&per_page=100&page=" + page);
    issues.push(...batch);
    if (batch.length < 100) break;
    if (page >= 10) throw new Error("Incident lookup limit exceeded");
  }
  const incident = issues.find(issue => !issue.pull_request &&
    issue.title === incidentTitle && issue.user?.login === "github-actions[bot]");
  const summary = "Automated availability check. No response bodies, visitor data or credentials are recorded.\n\nRun: " + runUrl;
  if (failures.length && !incident) {
    await api("POST", "/issues", {
      title: incidentTitle,
      body: summary + "\n\nFailed checks: " + failures.join(", ") + ".\n\nEach check failed three attempts. Investigate Vercel and Supabase. This monitor does not test delivery success or backups.",
      assignees: ["edencohen533-create"],
    });
  } else if (!failures.length && incident) {
    await api("POST", "/issues/" + incident.number + "/comments", {
      body: "All availability checks passed again.\n\n" + summary,
    });
    await api("PATCH", "/issues/" + incident.number, { state: "closed", state_reason: "completed" });
  }
}

export async function main() {
  const repository = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  const runId = process.env.GITHUB_RUN_ID;
  if (repository !== "edencohen533-create/quizflow" || !token || !/^\d+$/.test(runId ?? "")) {
    throw new Error("Missing or invalid monitoring configuration");
  }
  const api = async (method, path, body) => {
    const response = await fetch("https://api.github.com/repos/" + repository + path, {
      method, redirect: "error", signal: AbortSignal.timeout(15000),
      headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) throw new Error("Incident API returned HTTP " + response.status);
    return response.status === 204 ? null : response.json();
  };
  const failures = await probe();
  await report(failures, api, "https://github.com/" + repository + "/actions/runs/" + runId);
  console.log(failures.length ? "Failed checks: " + failures.join(", ") : "All availability checks passed.");
  if (failures.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error("Availability monitor failed; inspect workflow configuration and service status."); process.exitCode = 1; });
}

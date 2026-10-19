/** Verify project agent and SoT files cannot be read over a Vite server.
 * Run while Vite is listening: node qa/privacy-server-e2e.mjs
 * Optional BODYFORGE_DEV_ORIGIN=http://127.0.0.1:5174
 */
const origin = process.env.BODYFORGE_DEV_ORIGIN || "http://127.0.0.1:5173";
const blocked = [
  "/.iskra/support/MANIFEST.json",
  "/.iskra/knowledge/29_INDEX_UPLOAD_MANIFEST.md",
  "/.agents/skills/iskra-runtime/SKILL.md",
  "/.codex/config.toml",
  "/AGENTS.md",
  "/CODEX_ISKRA.md",
  "/.iskra/support/MANIFEST.json?raw",
  "/%2Eiskra/support/MANIFEST.json",
  "/@fs/C:/github/BODYFORGE/.iskra/support/MANIFEST.json",
];
let failures = 0;
for (const path of blocked) {
  try {
    const response = await fetch(new URL(path, origin), {
      redirect: "manual", signal: AbortSignal.timeout(5000),
    });
    if (response.status !== 403) {
      console.error("FAIL " + path + ": unexpected HTTP " + response.status);
      failures++;
    } else {
      console.log("PASS private path HTTP 403: " + path);
    }
  } catch (error) {
    console.error("FAIL " + path + ": " + error);
    failures++;
  }
}
try {
  const response = await fetch(origin + "/", { signal: AbortSignal.timeout(5000) });
  const body = await response.text();
  if (response.status !== 200 || !body.includes("BODYFORGE")) {
    console.error("FAIL application: HTTP " + response.status);
    failures++;
  } else {
    console.log("PASS application HTTP 200");
  }
} catch (error) {
  console.error("FAIL app request: " + error);
  failures++;
}
if (failures) {
  console.error("BODYFORGE_PRIVATE_DEV_PATHS_FAIL=" + failures);
  process.exitCode = 12;
} else {
  console.log("BODYFORGE_PRIVATE_DEV_PATHS_PASS=" + blocked.length);
}

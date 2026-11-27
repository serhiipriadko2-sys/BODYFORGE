import { createHash } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, readdirSync, mkdirSync, mkdtempSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAndVerify } from './release-artifact-boundary.mjs';
import { requirePreviewOrigin } from './owned-chrome.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const sha = value => createHash('sha256').update(value).digest('hex');
const receipt = { schemaVersion: 1, status: 'failed', runtime: process.version, checks: {} };
const stablePaths = ['index.html', 'package.json', 'package-lock.json', 'tsconfig.json',
  'tsconfig.app.json', 'tsconfig.node.json', 'vite.config.ts', 'public', 'qa', 'src'];

function manifest(rootDir, names) {
  const files = [];
  function visit(relative) {
    const full = path.join(rootDir, relative);
    const stat = lstatSync(full);
    if (stat.isDirectory()) {
      for (const name of readdirSync(full).sort()) visit(relative ? relative + '/' + name : name);
      return;
    }
    if (!stat.isFile() || stat.nlink !== 1) throw Error('unsupported input type');
    const data = readFileSync(full);
    files.push({ path: relative, bytes: data.length, sha256: sha(data) });
  }
  for (const name of names) visit(name);
  return files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

function requireCommit(expected) {
  if (!/^[a-f0-9]{40}$/.test(expected)) throw Error('invalid expected revision');
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }).trim();
  if (git('rev-parse', 'HEAD') !== expected || git('status', '--porcelain', '--untracked-files=normal')) {
    throw Error('checkout differs from the pinned revision');
  }
}

async function gate(label, command, markers = [], extra = {}) {
  receipt.stage = label;
  console.error('BODYFORGE_QA_START', label);
  const { exit, seen, location } = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, command, { cwd: root,
      env: { ...extra.base, ...extra.env }, stdio: ['ignore','pipe','pipe'] });
    const seen = new Set();
    const entry = command[0].startsWith('qa/') ? command[0].split('/').at(-1) : null;
    let location;
    let timedOut = false;
    function read(output) {
      let tail = '';
      output.setEncoding('utf8');
      output.on('data', chunk => {
        const combined = tail + chunk;
        for (const marker of [...markers, ...(extra.replayMarkers ?? [])]) {
          if (combined.includes(marker)) seen.add(marker);
        }
        // Keep only the known QA entry and line numbers, never full paths or fixture values.
        if (entry) for (const line of combined.split('\n')) {
          const offset = line.lastIndexOf(entry + ':');
          const match = offset < 0 ? null : line.slice(offset + entry.length).match(/^:(\d+):(\d+)\)?\s*$/);
          if (match) location = entry + ':' + match[1] + ':' + match[2];
        }
        tail = combined.slice(-256);
      });
    }
    read(child.stdout);
    read(child.stderr);
    child.once('error', reject);
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ exit: timedOut ? 'timeout' : code ?? signal, seen, location });
    });
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, extra.timeout ?? 180000);
    timer.unref();
  });
  const pass = exit === 0 && markers.every(marker => seen.has(marker));
  receipt.checks[label] = { exit, pass, ...(!pass && location ? { location } : {}) };
  console.error('BODYFORGE_QA_EXIT', label, exit);
  if (pass) return true;
  if (exit === extra.replayExit && extra.replayMarkers?.every(marker => seen.has(marker))) return false;
  throw Error('required gate failed');
}

let server;
try {
  receipt.stage = 'checkout';
  const args = process.argv.slice(2);
  if (args.length !== 0 && (args.length !== 2 || args[0] !== '--commit')) throw Error('invalid arguments');
  if (process.env.CI && args.length !== 2) throw Error('CI requires the exact checkout SHA');
  if (args[1]) requireCommit(args[1]);
  receipt.stage = 'isolated-output';
  try {
    lstatSync(path.join(root, 'dist'));
    throw Error('output already exists');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (readdirSync(root).some(name => /^\.env(?:\.|$)/i.test(name)) ||
      Object.keys(process.env).some(name => /^VITE_/i.test(name))) throw Error('local build environment supplied');
  receipt.source = args[1] ? { kind: 'commit', revision: args[1] } : { kind: 'local-snapshot' };
  const source = manifest(root, stablePaths);
  receipt.source.inputCount = source.length;
  receipt.source.sha256 = sha(JSON.stringify(source));

  // Clear inherited QA shortcuts. This command defines the evidence it requires.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !/^(?:BODYFORGE_QA_|BODYFORGE_DEV_ORIGIN$)/i.test(key)));
  const base = { base: env };
  await gate('artifact-unit', ['--test', 'qa/release-artifact-boundary.test.mjs'], [], base);
  await gate('unit', ['node_modules/vitest/vitest.mjs', 'run', '--maxWorkers=1',
    '--no-file-parallelism', '--pool=threads'], [], base);
  await gate('types', ['node_modules/typescript/bin/tsc', '-b'], [], base);

  receipt.stage = 'artifact';
  const policy = JSON.parse(readFileSync(new URL('./public-artifact-allowlist.json', import.meta.url), 'utf8'));
  const build = await buildAndVerify(root, policy);
  receipt.distribution = build.distribution;
  receipt.checks.artifact = { exit: 0, pass: true };
  await gate('bundle', ['qa/bundle-on-demand.mjs'], ['BODYFORGE_BUNDLE_ON_DEMAND_PASS'], base);

  receipt.stage = 'preview';
  const { preview } = await import('vite');
  server = await preview({ root, logLevel: 'silent', preview: { host: '127.0.0.1', port: 0, strictPort: true, open: false } });
  const bound = server.httpServer.address();
  if (!bound || typeof bound === 'string' || bound.address !== '127.0.0.1') throw Error('preview binding differs');
  const origin = 'http://127.0.0.1:' + bound.port;
  const index = build.distribution.files.find(file => file.path === 'index.html');
  const entry = build.distribution.files.find(file => /^assets\/index-[\w-]+\.js$/.test(file.path));
  const http = await fetch(origin + '/', { redirect: 'error', signal: AbortSignal.timeout(5000) });
  if (!http.ok || sha(Buffer.from(await http.arrayBuffer())) !== index.sha256) throw Error('served index differs');
  await requirePreviewOrigin(origin, entry.sha256);
  receipt.preview = { http: http.status, indexSha256: index.sha256, entrySha256: entry.sha256 };
  receipt.checks.preview = { exit: 0, pass: true };
  const qaRoot = path.join(root, '.bodyforge-qa');
  mkdirSync(qaRoot, { recursive: true });
  const browser = { base: env, timeout: 300000, env: {
    BODYFORGE_QA_ORIGIN: origin, BODYFORGE_DEV_ORIGIN: origin,
    BODYFORGE_QA_EXPECT_ENTRY_SHA256: entry.sha256,
    BODYFORGE_QA_ARTIFACT_DIR: mkdtempSync(path.join(qaRoot, 'release-gates-')),
  } };
  await gate('privacy', ['qa/privacy-server-e2e.mjs'], ['BODYFORGE_PRIVATE_DEV_PATHS_PASS'], browser);
  await gate('synthetic-tower', ['qa/tower20-e2e.mjs'], ['BODYFORGE_TOWER_20REPS_E2E_PASS'], browser);
  const mobile = ['qa/mobile-e2e.mjs'];
  const mobilePass = ['BODYFORGE_MOBILE_E2E_PASS', 'QA_OWNED_CLEANUP PASS'];
  const firstMobile = await gate('synthetic-mobile', mobile, mobilePass, {
    ...browser, replayExit: 12, replayMarkers: ['BODYFORGE_MOBILE_CDP_TIMEOUT', 'QA_OWNED_CLEANUP PASS'],
  });
  if (!firstMobile) {
    await requirePreviewOrigin(origin, entry.sha256);
    await gate('synthetic-mobile-replay', mobile, mobilePass, { ...browser, env: {
      ...browser.env, BODYFORGE_QA_ARTIFACT_DIR: mkdtempSync(path.join(qaRoot, 'release-replay-')),
    } });
  }

  receipt.stage = 'read-back';
  const dist = manifest(path.join(root, 'dist'), ['']);
  await requirePreviewOrigin(origin, entry.sha256);
  if (JSON.stringify(dist) !== JSON.stringify(build.distribution.files) ||
      JSON.stringify(manifest(root, stablePaths)) !== JSON.stringify(source)) throw Error('source or artifact drift');
  if (args[1]) requireCommit(args[1]);
  receipt.checks['read-back'] = { exit: 0, pass: true };
  receipt.status = firstMobile ? 'tested-local' : 'tested-local-with-browser-replay';
  receipt.fieldDevice = 'not-run';
} catch {
  process.exitCode = 1;
} finally {
  try { await server?.close(); }
  catch {
    receipt.status = 'failed';
    receipt.stage = 'preview-cleanup';
    process.exitCode = 1;
  }
  console.log(JSON.stringify(receipt, null, 2));
}

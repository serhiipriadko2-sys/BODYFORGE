// Stable loopback-only Vite development server for long E2E scenarios.
// Disables hot reloads during a camera hold or a held Web Lock.
// It does NOT freeze source files across explicit page navigations.
import { createServer } from 'vite';

const port = Number(process.env.BODYFORGE_QA_PORT ?? '5174');
if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) {
  throw Error('BODYFORGE_QA_PORT must be a valid unprivileged TCP port');
}
const server = await createServer({
  clearScreen: false,
  server: { host: '127.0.0.1', port, strictPort: true, hmr: false },
});
await server.listen();
console.log('BODYFORGE_STABLE_QA_READY http://127.0.0.1:' + port);

let closing = false;
const stop = () => {
  if (closing) return;
  closing = true;
  void server.close().catch((error) => {
    console.error('BODYFORGE_STABLE_QA_CLOSE_FAILED', error);
    process.exitCode = 1;
  });
};
process.once('SIGINT', stop);
process.once('SIGTERM', stop);

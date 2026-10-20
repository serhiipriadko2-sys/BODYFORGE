import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Vite is accessible over Wi-Fi on port 5174. Never allow the browser to read
// project-level Codex instructions, canon mirrors or local automation policy.
// Vite's built-in fs.deny protects module/file routes; early middleware also
// blocks direct URL requests and preserves 403 instead of SPA fallback.
function blockPrivateAgentFiles() {
  return {
    name: 'bodyforge-block-private-agent-files',
    enforce: 'pre' as const,
    configureServer(server: { middlewares: { use: (handler: (
      req: { url?: string },
      res: { statusCode: number; setHeader: (key: string, value: string) => void; end: (body: string) => void },
      next: () => void
    ) => void) => void } }) {
      server.middlewares.use((req, res, next) => {
        let pathname: string;
        try {
          pathname = decodeURIComponent((req.url ?? '/').split('?')[0])
            .replace(/\\/g, '/').toLowerCase();
        } catch {
          res.statusCode = 400;
          res.end('Bad request');
          return;
        }
        if (/(^|\/)\.(?:iskra|agents|codex|git|vscode)(?:\/|$)/.test(pathname) ||
            /(^|\/)(?:agents|codex_iskra)\.md$/.test(pathname)) {
          res.statusCode = 403;
          res.setHeader('Cache-Control', 'no-store');
          res.end('Forbidden');
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [blockPrivateAgentFiles(), react()],
  server: {
    fs: {
      // Preserve Vite's sensitive-file defaults when extending its deny list.
      deny: [
        '.env', '.env.*', '*.{crt,pem,key,p12,pfx,cer,der}',
        '.npmrc', '.yarnrc.yml', '**/.git/**',
        '**/.iskra/**', '**/.agents/**', '**/.codex/**', '**/.vscode/**',
        '**/AGENTS.md', '**/CODEX_ISKRA.md',
      ],
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});

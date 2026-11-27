import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { posix } from 'node:path';
import { localAvatarHeadReview } from './qa/local-avatar-head-review.ts';

// Vite is accessible over Wi-Fi on port 5174. Never allow the browser to read
// project-level Codex instructions, canon mirrors or local automation policy.
// Vite's built-in fs.deny protects module/file routes; early middleware also
// blocks direct URL requests and preserves 403 instead of SPA fallback.
// Frozen QA trees and audit backups are developer-only too.
function blockPrivateAgentFiles() {
  const configure = (server: { middlewares: { use: (handler: (
      req: { url?: string },
      res: { statusCode: number; setHeader: (key: string, value: string) => void; end: (body: string) => void },
      next: () => void
    ) => void) => void } }) => {
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
        // Check both requested and normalized path segments. Windows may
        // resolve trailing spaces or periods as aliases of the same file.
        const canonical = pathname.split('/').map(segment =>
          segment === '.' || segment === '..' ? segment : segment.replace(/[. ]+$/g, ''),
        ).join('/');
        const restricted = (value: string) =>
          /(^|\/)\.(?:iskra|agents|codex|git|vscode|bodyforge-qa)(?:\/|$)/.test(value) ||
          /(^|\/)docs\/audits(?:\/|$)/.test(value) ||
          /(^|\/)(?:agents|codex_iskra)\.md$/.test(value);
        if ([pathname, canonical, posix.normalize(canonical)].some(restricted)) {
          res.statusCode = 403;
          res.setHeader('Cache-Control', 'no-store');
          res.end('Forbidden');
          return;
        }
        next();
      });
  };
  return {
    name: 'bodyforge-block-private-agent-files',
    enforce: 'pre' as const,
    configureServer: configure,
    configurePreviewServer: configure,
  };
}

export default defineConfig({
  plugins: [blockPrivateAgentFiles(), localAvatarHeadReview(), react()],
  // Only the live SPA entry, not frozen HTML copies under .bodyforge-qa.
  optimizeDeps: {
    noDiscovery: true,
    include: [
      'react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime',
      'lucide-react', 'three', '@mediapipe/tasks-vision',
      'three/addons/environments/RoomEnvironment.js', 'three/addons/loaders/GLTFLoader.js',
      'three/addons/loaders/HDRLoader.js', 'three/addons/utils/BufferGeometryUtils.js',
    ],
  },
  server: {
    watch: { ignored: ['**/.bodyforge-qa/**', '**/docs/audits/**'] },
    fs: {
      // Preserve Vite's sensitive-file defaults when extending its deny list.
      deny: [
        '.env', '.env.*', '*.{crt,pem,key,p12,pfx,cer,der}',
        '.npmrc', '.yarnrc.yml', '**/.git/**',
        '**/.iskra/**', '**/.agents/**', '**/.codex/**', '**/.vscode/**',
        '**/.bodyforge-qa/**', '**/docs/audits/**',
        '**/AGENTS.md', '**/CODEX_ISKRA.md',
      ],
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});

import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ForgeQuickDeck from '../components/ForgeQuickDeck';
import { EMPTY_PROFILE } from './progression';

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const noop = () => {};
const render = (created: boolean, disabled = false) => renderToStaticMarkup(createElement(ForgeQuickDeck, {
  profile: { ...EMPTY_PROFILE, game: { ...EMPTY_PROFILE.game, created } },
  disabled, onTraining: noop, onAvatar: noop, onTower: noop, onDaily: noop,
}));

describe('Forge quick navigation remains available', () => {
  it('uses the main UI bundle, not a separately failing lazy chunk', () => {
    expect(app).toContain("import ForgeQuickDeck from './components/ForgeQuickDeck';");
    expect(app).not.toContain("lazy(() => import('./components/ForgeQuickDeck'))");
  });
  it('owns exactly one deck on Forge without a fighter creation gate', () => {
    expect(app).toMatch(/\{section === 'dashboard' && <ForgeQuickDeck\b/);
    expect(app.match(/<ForgeQuickDeck\b/g)).toHaveLength(1);
    expect(app).toMatch(/if \(profile\.game\.created\) goTraining\('training', 'squat'\);\s*else \{\s*setPreviewExercise\('squat'\);\s*navigate\('challenge'\);/);
  });
  it('retains the four original functional cards with and without a fighter', () => {
    for (const created of [false, true]) {
      const html = render(created);
      expect([...html.matchAll(/data-quick-action="([^"]+)"/g)].map(m => m[1]))
        .toEqual(['training', 'hero', 'tower', 'daily']);
      for (const label of ['Приседания', 'Герой', 'Башня', 'Миссии']) expect(html).toContain(label);
      expect(html).not.toContain('disabled=""');
    }
    expect(render(true, true).match(/disabled=""/g)).toHaveLength(4);
  });
});

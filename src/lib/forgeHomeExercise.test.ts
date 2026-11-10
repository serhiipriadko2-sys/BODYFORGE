import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ExerciseCatalog } from '../components/ExerciseCatalog';

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../neonPulseV2.css', import.meta.url), 'utf8');

describe('home fighter exercise selection', () => {
  it('starts with the eight-option exercise selector expanded inside the fighter card', () => {
    const html = renderToStaticMarkup(createElement(ExerciseCatalog, {
      selected: 'plank', onSelect: () => {}, initiallyOpen: true,
    }));
    expect(html).toContain('aria-expanded="true"');
    expect(html.match(/data-exercise="/g)).toHaveLength(8);
    expect(html).toMatch(/data-exercise="plank"[^>]*aria-pressed="true"/);
    expect(html).toContain('30');
  });

  it('shares the same exercise state between the fighter start CTA and the camera', () => {
    const card = app.split('<section className="dashboard-player"')[1]?.split('</section>')[0] ?? '';
    expect(card).toContain('className="dashboard-player-catalog"');
    expect(card).toContain('selected={previewExercise} onSelect={setPreviewExercise}');
    expect(card).toContain('initiallyOpen');
    expect(card).toContain("goTraining('training', previewExercise)");
    expect(card).not.toContain("goTraining('training', 'squat')");
    expect(app).toContain('<ExerciseCatalog selected={previewExercise} onSelect={setPreviewExercise}');
    expect(app).toContain('exerciseTargetLabel(previewExercise)');
  });

  it('gives the embedded catalog full width without overlapping the fighter info', () => {
    expect(css).toContain('.app-shell[data-screen="dashboard"] .dashboard-player {flex-wrap:wrap;}');
    expect(css).toContain('.dashboard-player-catalog {flex:0 0 100%;min-width:0;width:100%;}');
    expect(css).toContain('.dashboard-player-catalog .bf-catalog {margin:0;}');
  });
});

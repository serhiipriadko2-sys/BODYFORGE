import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import FighterLevelProgress from '../components/FighterLevelProgress';

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const pulse = readFileSync(new URL('../components/ProgressPulseBoard.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../neonPulseV2.css', import.meta.url), 'utf8');

describe('Forge fighter level integration', () => {
  it('renders the screenshot values from saved XP, not placeholder numbers', () => {
    const zero = renderToStaticMarkup(createElement(FighterLevelProgress, { xp: 0 }));
    expect(zero).toContain('Уровень 1');
    expect(zero).toContain('Опыт: 0 / 250 XP');
    expect(zero).toContain('ТВОЯ СЛЕДУЮЩАЯ ЗАКАЛКА');
    expect(zero).toContain('aria-valuenow="0"');
    expect(zero).toContain('width:0%');

    const upgraded = renderToStaticMarkup(createElement(FighterLevelProgress, { xp: 320 }));
    expect(upgraded).toContain('Уровень 2');
    expect(upgraded).toContain('Опыт: 70 / 250 XP');
    expect(upgraded).toContain('aria-valuenow="70"');
    expect(upgraded).toContain('width:28%');
    expect(renderToStaticMarkup(createElement(FighterLevelProgress, { xp: NaN })))
      .toContain('Опыт: 0 / 250 XP');
  });
  const fighter = app.split('<section className="dashboard-player"')[1]?.split('</section>')[0] ?? '';

  it('embeds the original XP and level progress block inside the top fighter card', () => {
    expect(fighter).toContain('<FighterLevelProgress xp={profile.xp}/>');
    expect(fighter).not.toContain('dashboard-player-catalog');
    expect(fighter).not.toContain('<ExerciseCatalog');
    expect(pulse).not.toContain('className="pulse-xp-card"');
    expect(css).toContain('.dashboard-player .pulse-xp-card');
  });

  it('keeps the exercise picker on Camera and restores an explicit squat quick start', () => {
    expect(app).toContain('<ExerciseCatalog selected={previewExercise} onSelect={setPreviewExercise}');
    expect(fighter).toContain("goTraining('training', 'squat')");
    expect(app).toContain('<strong>20 ПРИСЕДАНИЙ</strong>');
    expect(app).toContain('section === \'settings\'');
    expect(app).toContain('<SettingsFaq profile={profile}');
  });
});

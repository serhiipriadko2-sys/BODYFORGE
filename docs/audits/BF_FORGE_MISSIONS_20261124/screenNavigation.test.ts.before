import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Source-level routing regression guard. Browser layout is checked separately.
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const faq = readFileSync(new URL('../components/SettingsFaq.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../neonPulseV2.css', import.meta.url), 'utf8');

describe('Forge screen responsibilities', () => {
  it('has a dedicated Settings / FAQ screen accessible by desktop and mobile navigation', () => {
    expect(app).toContain('id="settings"');
    expect(app.match(/navigate\('settings'\)/g)).toHaveLength(2);
    expect(app).toContain('section === \'settings\'');
    expect(app).toContain("const SettingsFaq = lazy(() => import('./components/SettingsFaq'))");
    expect(app).toContain('<SettingsFaq profile={profile}');
    expect(faq).toContain('<ProgressBackupPanel profile={profile}');
    expect(css).toContain('.app-shell[data-screen="settings"] .content > :not(#settings)');
  });

  it('removes the personal daily-plan card without removing Camera missions or steps', () => {
    expect(app).not.toContain("import('./components/DailyPlanBoard')");
    expect(app).not.toContain('<DailyPlanBoard');
    expect(app).not.toContain('id="daily-plan"');
    expect(app).toContain('<DailyBoard profile={profile}');
    expect(app).toContain('<StepsBoard now={today}');
    expect(app).toContain("document.getElementById('quests')");
    expect(css).toContain('.app-shell[data-screen="challenge"]');
    const quickDeck = readFileSync(new URL('../components/ForgeQuickDeck.tsx', import.meta.url), 'utf8');
    expect(quickDeck).toContain("title: 'Миссии'");
  });

  it('moves the entire pre-workout camera guide from Forge to Settings FAQ', () => {
    expect(app).not.toContain('className="tips-card"');
    expect(faq).toContain('className="tips-card"');
    expect(faq).toContain('ПЕРЕД УДАРОМ');
    expect(faq).toContain('ПОДГОТОВЬ <em>КАДР</em>');
    expect(faq).toContain('Телефон вертикально, сбоку');
    expect(faq).toContain('экспериментальная функция');
    expect(css).toContain('.bf-settings-screen .tips-card');
  });

  it('does not make the local backup available on the Forge home screen', () => {
    expect(app).not.toContain("section === 'dashboard' && <Suspense fallback={null}>\n            <ProgressBackupPanel");
    expect(app).toContain("section === 'settings' && <Suspense");
    expect(css).toContain('.app-shell:not([data-screen="settings"]) .content > #settings');
  });
});

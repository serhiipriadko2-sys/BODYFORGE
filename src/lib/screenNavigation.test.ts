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

  it('keeps missions on Forge and steps on Camera without the retired daily-plan card', () => {
    expect(app).not.toContain("import('./components/DailyPlanBoard')");
    expect(app).not.toContain('<DailyPlanBoard');
    expect(app).not.toContain('id="daily-plan"');
    expect(app).toContain('<DailyBoard profile={profile}');
    expect(app).toContain('<StepsBoard now={today}');
    expect(app).toContain("document.getElementById('quests')");
    expect(css).toContain('.app-shell[data-screen="challenge"]');
    const quickDeck = readFileSync(new URL('../components/ForgeQuickDeck.tsx', import.meta.url), 'utf8');
    expect(quickDeck).toContain("title: 'Миссии'");
    expect(quickDeck).toContain("kicker: 'МИССИИ · ГОРН'");
    expect(css).toContain('.app-shell:not([data-screen="dashboard"]) .content > #quests {display:none;}');
    expect(css).not.toContain(':is(#daily-plan,#quests,#step-log)');
    expect(app).toMatch(/onDaily=\{\(\) => \{\s*navigate\('dashboard'\)/);
    expect(app.match(/<DailyBoard profile=/g)).toHaveLength(1);
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

  it('uses the same screen isolation on either side of the mobile breakpoint', () => {
    const world = readFileSync(new URL('../world.css', import.meta.url), 'utf8');
    const start = world.indexOf('/* Screen ownership:');
    const end = world.indexOf('/* Phone camera preflight:', start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const routing = world.slice(start, end);
    const shared = routing.split('@media')[0];
    expect(shared).toContain('.app-shell[data-screen="dashboard"] .content > #forge');
    expect(shared).toContain('.app-shell[data-screen="dashboard"] .cards-grid > #challenge');
    expect(shared).toContain('.app-shell[data-screen="challenge"] .cards-grid > .character-card');
    expect(shared).toContain('.app-shell[data-screen="dashboard"][data-fighter-created="false"] .content > .cards-grid');
    expect(shared).toContain(':not(.cards-grid,#pulse-progress,#step-log,.result-quarantine-notice)');
    expect(app).not.toContain("window.matchMedia('(min-width: 741px)').matches");
    expect(app).toContain("window.scrollTo({ top: 0, behavior: 'instant' });");
  });

  it('does not gate Camera statistics or steps on fighter creation, including loading placeholders', () => {
    expect(app).toContain("const showProgressPanels = profile.game.created || section === 'challenge';");
    expect(app).toContain('{showProgressPanels && <Suspense fallback={<div id="step-log"');
    expect(app).toContain('{showProgressPanels && <Suspense fallback={<div id="pulse-progress"');
    expect(app.match(/<StepsBoard now=/g)).toHaveLength(1);
    expect(app.match(/<ProgressPulseBoard profile=/g)).toHaveLength(1);
  });
});

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

  it('renders the plan, missions and manual steps only on the Camera screen', () => {
    expect(app).toContain('id="daily-plan"');
    expect(app).toContain('<DailyBoard profile={profile}');
    expect(app).toContain('<StepsBoard now={today}');
    expect(css).toContain('.app-shell:not([data-screen="challenge"]) .content > :is(#daily-plan,#quests,#step-log)');
    expect(css).toContain('.app-shell[data-screen="challenge"] .content > :is(#daily-plan,#quests,#step-log)');
  });

  it('does not make the local backup available on the Forge home screen', () => {
    expect(app).not.toContain("section === 'dashboard' && <Suspense fallback={null}>\n            <ProgressBackupPanel");
    expect(app).toContain("section === 'settings' && <Suspense");
    expect(css).toContain('.app-shell:not([data-screen="settings"]) .content > #settings');
  });
});

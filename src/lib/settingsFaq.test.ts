import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import SettingsFaq from '../components/SettingsFaq';
import { EMPTY_PROFILE } from './progression';

function renderFaq(created: boolean, disabled = false) {
  return renderToStaticMarkup(createElement(SettingsFaq, {
    profile: { ...EMPTY_PROFILE, game: { ...EMPTY_PROFILE.game, created } },
    pendingResult: null,
    disabled,
  }));
}

describe('settings backup help (BF-407)', () => {
  it('distinguishes preview, explicit replacement, rollback and unsupported transfer', () => {
    const html = renderFaq(true);
    expect(html).toContain('Просмотр файла не изменяет прогресс');
    expect(html).toContain('Подтвердить замену');
    expect(html).toContain('вернуть прежние сохранения');
    expect(html).toContain('Перенос на чистый телефон пока не поддерживается');
    expect(html).toContain('Не удаляй данные исходного браузера');
    expect(html).toContain('aria-controls="progress-backup-file-checker"');
  });

  it('offers the inspector shortcut only after fighter creation', () => {
    expect(renderFaq(true)).toMatch(/<button[^>]*data-action="open-backup-inspector"/);
    expect(renderFaq(false)).not.toContain('data-action="open-backup-inspector"');
  });

  it('disables the shortcut while the profile is busy', () => {
    const button = renderFaq(true, true).match(/<button[^>]*data-action="open-backup-inspector"[^>]*>/)?.[0];
    expect(button).toBeDefined();
    expect(button).toMatch(/\bdisabled(?:=""|="disabled")?(?:\s|>)/);
  });
});

it('renders a local user-initiated license viewer',()=>{const html=renderFaq(false);expect(html).toContain('data-help-topic="third-party-notices"');expect(html).toContain('data-notice-state="idle"');expect(html).not.toContain('class="bf-third-party-notices"');});

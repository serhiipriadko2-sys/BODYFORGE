import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import StepsBoard from '../components/StepsBoard';
import { hasNativeLiveSteps, NATIVE_LIVE_STEPS_TOKEN, NATIVE_STEPS_ORIGIN, NATIVE_STEPS_PATH, NATIVE_STEPS_TOKEN } from './nativeSteps';

afterEach(() => vi.unstubAllGlobals());
describe('packaged native steps UI', () => {
  function render(busy: boolean, live = false) {
    vi.stubGlobal('window', {
      location: { origin: NATIVE_STEPS_ORIGIN },
      navigator: { userAgent: 'Android WebView ' + NATIVE_STEPS_TOKEN + (live ? ' ' + NATIVE_LIVE_STEPS_TOKEN : '') },
    });
    return renderToStaticMarkup(createElement(StepsBoard, { now: new Date(2026,10,24), busy }));
  }
  it('renders a single explicit action without a manual number or fake synced status', () => {
    const html = render(false);
    expect(html).toContain('href="' + NATIVE_STEPS_PATH + '"');
    expect(html).toContain('data-sync-state="native-action"');
    expect(html).not.toContain('data-manual-steps');
    expect(html).not.toContain('data-sync-state="connected"');
  });
  it('exposes only a hidden UI-state marker for the new native bar', () => {
    const html = render(false, true);
    expect(html).toContain('hidden=""');
    expect(html).toContain('data-native-live-panel="ready"');
    expect(html).not.toContain('href=');
    expect(html).not.toContain('data-manual-steps');
    expect(render(true, true)).toContain('data-native-live-panel="busy"');
  });
  it('requires both exact capability tokens and trusted origin', () => {
    expect(hasNativeLiveSteps(NATIVE_STEPS_ORIGIN, NATIVE_LIVE_STEPS_TOKEN)).toBe(false);
    expect(hasNativeLiveSteps('https://example.org', NATIVE_STEPS_TOKEN + ' ' + NATIVE_LIVE_STEPS_TOKEN)).toBe(false);
    expect(hasNativeLiveSteps(NATIVE_STEPS_ORIGIN, NATIVE_STEPS_TOKEN + ' ' + NATIVE_LIVE_STEPS_TOKEN)).toBe(true);
  });
  it('blocks the native action during an active camera or pending save', () => {
    const html = render(true);
    expect(html).toContain('data-sync-state="busy"');
    expect(html).toContain('disabled=""');
    expect(html).not.toContain('href=');
  });
});

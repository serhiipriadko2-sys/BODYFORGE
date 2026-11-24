import { describe, expect, it } from 'vitest';
import { hasNativeStepsLink, NATIVE_STEPS_ORIGIN, NATIVE_STEPS_PATH, NATIVE_STEPS_TOKEN } from './nativeSteps';

describe('native step entry point (presentation only)', () => {
  it('requires the packaged HTTPS origin and exact native capability token', () => {
    expect(hasNativeStepsLink(NATIVE_STEPS_ORIGIN, 'WebView ' + NATIVE_STEPS_TOKEN)).toBe(true);
    expect(NATIVE_STEPS_PATH).toBe('/__bodyforge_native/steps');
  });
  it.each(['http://127.0.0.1:5173', 'https://bodyforge-mobile-20261022.web.app',
    'https://appassets.androidplatform.net.evil.test', 'http://appassets.androidplatform.net'])(
    'never offers native action on browser origin %s', origin => {
      expect(hasNativeStepsLink(origin, NATIVE_STEPS_TOKEN)).toBe(false);
    });
  it('fails closed for absent or near-match tokens', () => {
    expect(hasNativeStepsLink(NATIVE_STEPS_ORIGIN, 'Chrome')).toBe(false);
    expect(hasNativeStepsLink(NATIVE_STEPS_ORIGIN, NATIVE_STEPS_TOKEN + '0')).toBe(false);
  });
});

/** Presentation hint only: native Android independently validates navigation,
 * foreground state, and the OS permission. No health data crosses this route. */
export const NATIVE_STEPS_ORIGIN = 'https://appassets.androidplatform.net';
export const NATIVE_STEPS_PATH = '/__bodyforge_native/steps';
export const NATIVE_STEPS_TOKEN = 'BODYFORGE-NativeSteps/1';
export const NATIVE_LIVE_STEPS_TOKEN = 'BODYFORGE-LiveSteps/1';

export function hasNativeLiveSteps(origin: string, userAgent: string): boolean {
  return hasNativeStepsLink(origin, userAgent) && userAgent.split(/\s+/).includes(NATIVE_LIVE_STEPS_TOKEN);
}

export function hasNativeStepsLink(origin: string, userAgent: string): boolean {
  return origin === NATIVE_STEPS_ORIGIN && userAgent.split(/\s+/).includes(NATIVE_STEPS_TOKEN);
}

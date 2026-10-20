/** Bound an unabortable browser/library request. A late resource must be disposed
 * after timeout, otherwise a closed workout can unexpectedly light the camera. */
export function withTimeout<T>(pending: Promise<T>, timeoutMs: number, message: string, onLate?: (value: T) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    let expired = false;
    const timer = setTimeout(() => {
      expired = true;
      reject(new DOMException(message, 'TimeoutError'));
    }, timeoutMs);
    pending.then((value) => {
      if (expired) {
        try { onLate?.(value); } catch { /* cleanup must not create an unhandled rejection */ }
      } else {
        clearTimeout(timer);
        resolve(value);
      }
    }, (error: unknown) => {
      clearTimeout(timer);
      if (!expired) reject(error);
    });
  });
}

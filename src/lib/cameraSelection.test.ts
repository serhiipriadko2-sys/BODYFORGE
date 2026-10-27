import { describe, expect, it } from 'vitest';
import {
  cameraSelectionFeedback,
  verifyCameraSelection,
  type CameraSelectionVerification,
  type CameraSource,
} from './camera';

const front: CameraSource = { kind: 'facing', value: 'user' };
const rear: CameraSource = { kind: 'facing', value: 'environment' };
const exact: CameraSource = { kind: 'device', value: 'private-device-id-123' };

describe('actual camera selection after getUserMedia', () => {
  it('confirms only a matching facing mode or exact device identity', () => {
    expect(verifyCameraSelection(front, { facingMode: 'user' })).toBe('confirmed');
    expect(verifyCameraSelection(rear, { facingMode: 'environment' })).toBe('confirmed');
    expect(verifyCameraSelection(exact, { deviceId: exact.value })).toBe('confirmed');
    expect(verifyCameraSelection(exact, { deviceId: 'other' })).toBe('mismatch');
    expect(verifyCameraSelection(front, { facingMode: 'environment' })).toBe('mismatch');
    expect(verifyCameraSelection(rear, { facingMode: 'user' })).toBe('mismatch');
  });

  it('does not invent support for privacy-limited browser camera metadata', () => {
    expect(verifyCameraSelection(front, null)).toBe('unverified');
    expect(verifyCameraSelection(rear, {})).toBe('unverified');
    expect(verifyCameraSelection(exact, {})).toBe('unverified');
    expect(verifyCameraSelection(exact, { deviceId: '   ' })).toBe('unverified');
    expect(verifyCameraSelection(rear, { facingMode: 'left' })).toBe('unverified');
  });

  it.each<CameraSelectionVerification>(['confirmed', 'unverified', 'mismatch'])(
    'shows factual %s feedback without exposing hardware identifiers', (status) => {
      const text = cameraSelectionFeedback(exact, status);
      expect(text).toContain('Повторы сохранены');
      expect(text).toContain('планки');
      expect(text).not.toContain(exact.value);
      if (status === 'mismatch') expect(text).toContain('другой объектив');
      if (status === 'unverified') expect(text).toContain('не подтвердил');
      if (status === 'confirmed') expect(text).toContain('подтвердил');
    },
  );
});

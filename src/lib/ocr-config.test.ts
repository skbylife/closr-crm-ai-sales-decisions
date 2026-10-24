import { afterEach, describe, expect, it, vi } from 'vitest';

import { isOcrEnabled } from './ocr-config';

describe('isOcrEnabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('keeps OCR disabled by default', () => {
    vi.stubEnv('NEXT_PUBLIC_OCR_ENABLED', '');
    expect(isOcrEnabled()).toBe(false);
  });

  it('only enables OCR when explicitly set to 1', () => {
    vi.stubEnv('NEXT_PUBLIC_OCR_ENABLED', '1');
    expect(isOcrEnabled()).toBe(true);

    vi.stubEnv('NEXT_PUBLIC_OCR_ENABLED', 'true');
    expect(isOcrEnabled()).toBe(false);
  });
});

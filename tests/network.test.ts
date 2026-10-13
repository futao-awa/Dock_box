import { describe, expect, it, vi } from 'vitest';
vi.mock('electron', () => ({ session: {} }));
import { shouldBlockRequest } from '../electron/network';

describe('offline renderer policy', () => {
  it.each(['https://github.com', 'http://example.com', 'wss://example.com/socket', 'ws://127.0.0.1:5000', 'ftp://example.com/file'])('blocks %s when offline', url => {
    expect(shouldBlockRequest(url, true)).toBe(true);
    expect(shouldBlockRequest(url, false)).toBe(false);
  });
  it('keeps local images and bundled pages available', () => {
    expect(shouldBlockRequest('file:///C:/dock_box/index.html', true)).toBe(false);
    expect(shouldBlockRequest('data:image/png;base64,AAAA', true)).toBe(false);
  });
  it('limits the development exception to the configured local server', () => {
    expect(shouldBlockRequest('ws://127.0.0.1:5173/socket', true, 'http://127.0.0.1:5173')).toBe(false);
    expect(shouldBlockRequest('https://example.com', true, 'http://127.0.0.1:5173')).toBe(true);
    expect(shouldBlockRequest('http://127.0.0.1:5000', true, 'http://127.0.0.1:5173')).toBe(true);
    expect(shouldBlockRequest('https://example.com', true, 'https://example.com')).toBe(true);
  });
});

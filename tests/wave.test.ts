import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../shared/model';
import { waveLayout } from '../shared/wave';
describe('Dock wave geometry', () => {
  const widths = [48, 48, 16, 48, 48, 48, 48], icons = [true, true, false, true, true, true, true];
  it('expands the entire strip while preserving gaps between magnified neighbors', () => {
    const resting = waveLayout(widths, icons, 10, null, 48, defaultSettings);
    for (const pointer of [-150, -50, 0, 90, 160]) {
      const layout = waveLayout(widths, icons, 10, pointer, 48, defaultSettings);
      expect(layout.length).toBeGreaterThan(resting.length); expect(layout.scales[2]).toBe(1);
      for (let i = 1; i < widths.length; i++) expect(layout.centers[i] - layout.centers[i - 1] - widths[i] * layout.scales[i] / 2 - widths[i - 1] * layout.scales[i - 1] / 2).toBeCloseTo(10);
      expect(layout.scales.every(Number.isFinite)).toBe(true);
      expect(layout.mapped).toBeCloseTo(pointer, 3);
    }
  });
  it('respects available window space and reduced motion', () => {
    const maxLength = 390;
    expect(waveLayout(widths, icons, 10, 30, 48, defaultSettings, 1, maxLength).length).toBeLessThanOrEqual(maxLength + .0001);
    expect(waveLayout(widths, icons, 10, 30, 48, { ...defaultSettings, reduceMotion: true }).scales.every(value => value === 1)).toBe(true);
  });
});

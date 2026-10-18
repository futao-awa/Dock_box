import { magnify, type Settings } from './model';

// Invert the expanded layout so the wave crest follows the cursor even near either end.
// Widths include separators; separators take space but never become a magnification peak.
export function waveLayout(widths: number[], icons: boolean[], gap: number, pointer: number | null, size: number, settings: Settings, strength = 1, maxLength = Infinity) {
  const baseLength = widths.reduce((sum, width) => sum + width, 0) + Math.max(0, widths.length - 1) * gap;
  let offset = -baseLength / 2;
  const centers = widths.map(width => { const center = offset + width / 2; offset += width + gap; return center; });
  const at = (focus: number) => {
    let scales = widths.map((_, i) => icons[i] ? 1 + (magnify((centers[i] - focus) / (size + gap), settings) - 1) * strength : 1);
    const extra = widths.reduce((sum, width, i) => sum + width * (scales[i] - 1), 0);
    const room = Math.max(0, maxLength - baseLength);
    if (extra > room) scales = scales.map(scale => 1 + (scale - 1) * room / extra);
    const length = widths.reduce((sum, width, i) => sum + width * scales[i], 0) + Math.max(0, widths.length - 1) * gap;
    let left = -length / 2, mapped = focus + (baseLength - length) / 2;
    for (let i = 0; i < widths.length; i++) {
      const start = centers[i] - widths[i] / 2;
      const fraction = Math.max(0, Math.min(1, (focus - start) / Math.max(1, widths[i])));
      mapped += widths[i] * (scales[i] - 1) * fraction;
    }
    const expandedCenters = widths.map((width, i) => { const center = left + width * scales[i] / 2; left += width * scales[i] + gap; return center; });
    return { scales, length, centers: expandedCenters, mapped };
  };
  if (pointer === null || !widths.length || settings.reduceMotion || settings.hoverEffect === 'none') return at(Infinity);
  let low = -baseLength / 2 - size * settings.magnifyRange, high = -low;
  for (let step = 0; step < 24; step++) { const middle = (low + high) / 2; if (at(middle).mapped < pointer) low = middle; else high = middle; }
  return at((low + high) / 2);
}
export function waveReserve(size: number, count: number, settings: Settings) {
  if (settings.reduceMotion || settings.hoverEffect === 'none') return 0;
  return size * (settings.magnification - 1) * Math.min(count, settings.hoverEffect === 'lift' ? 1 : Math.ceil(settings.magnifyRange * 2 + 1));
}

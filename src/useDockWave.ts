import { useEffect, type RefObject } from 'react';
import { waveLayout } from '../shared/wave';
import type { Settings } from '../shared/model';

export function useDockWave(ref: RefObject<HTMLDivElement | null>, size: number, gap: number, vertical: boolean, settings: Settings, itemKey: string, maxLength: number) {
  useEffect(() => {
    const element = ref.current; if (!element) return;
    const slots = Array.from(element.children).filter((child): child is HTMLElement => child instanceof HTMLElement && child.hasAttribute('data-base-width'));
    const widths = slots.map(slot => Number(slot.dataset.baseWidth));
    const icons = slots.map(slot => slot.classList.contains('dock-item'));
    slots.forEach(slot => slot.style.setProperty('--item-scale', '1'));
    let frame = 0, client: number | null = null, current: number | null = null, strength = 0;
    const draw = () => {
      const bounds = element.getBoundingClientRect();
      const target = client === null ? null : client - (vertical ? bounds.top + bounds.height / 2 : bounds.left + bounds.width / 2);
      current = target === null ? current : current === null ? target : current + (target - current) * .34;
      const goal = target === null ? 0 : 1; strength += (goal - strength) * .24;
      if (Math.abs(goal - strength) < .002) strength = goal;
      const layout = waveLayout(widths, icons, gap, strength ? current : null, size, settings, strength, maxLength);
      slots.forEach((slot, index) => { slot.style.setProperty('--item-scale', String(layout.scales[index])); slot.style.zIndex = String(Math.round(layout.scales[index] * 100)); });
      if (strength !== goal || (target !== null && Math.abs((current || 0) - target) > .05)) frame = requestAnimationFrame(draw);
      else { frame = 0; if (target === null) current = null; }
    };
    const move = (event: PointerEvent) => { client = vertical ? event.clientY : event.clientX; if (!frame) frame = requestAnimationFrame(draw); };
    const leave = () => { client = null; if (!frame) frame = requestAnimationFrame(draw); };
    const out = (event: PointerEvent) => { if (!event.relatedTarget || !(event.relatedTarget instanceof Node) || !element.contains(event.relatedTarget)) leave(); };
    const globalMove = (event: PointerEvent) => { const bounds = element.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) leave(); };
    element.addEventListener('pointermove', move); element.addEventListener('pointerleave', leave); element.addEventListener('pointerout', out); window.addEventListener('pointermove', globalMove, true); window.addEventListener('blur', leave);
    return () => { cancelAnimationFrame(frame); element.removeEventListener('pointermove', move); element.removeEventListener('pointerleave', leave); element.removeEventListener('pointerout', out); window.removeEventListener('pointermove', globalMove, true); window.removeEventListener('blur', leave); };
  }, [ref, size, gap, vertical, settings, itemKey, maxLength]);
}

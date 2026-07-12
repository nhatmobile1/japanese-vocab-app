import { useEffect, useState } from 'react';

// Keep the id lists in sync with the pre-paint whitelist in web/index.html.
export const PALETTES = [
  { id: 'ruri', label: '瑠璃と月', dots: ['#f1f4f9', '#3d5aa5', '#a08428'] },
  { id: 'wakakusa', label: '若草', dots: ['#f4f6ec', '#47795b', '#a8842a'] },
  { id: 'sakuranezu', label: '桜鼠', dots: ['#f9f3f3', '#b74d61', '#6e8d64'] },
  { id: 'akanezora', label: '茜空', dots: ['#f7f2f5', '#b04452', '#6e68a8'] },
  { id: 'mizuhanada', label: '水縹', dots: ['#eef6f4', '#2e7b76', '#c9808e'] },
  { id: 'ponyo', label: 'ポニョ', dots: ['#faf1ea', '#ce3626', '#2e8388'] },
] as const;

export const PATTERNS = [
  { id: 'seigaiha', label: '青海波' },
  { id: 'shippo', label: '七宝' },
  { id: 'ichimatsu', label: '市松' },
  { id: 'uroko', label: '鱗' },
  { id: 'yabane', label: '矢羽根' },
  { id: 'kasumi', label: '霞' },
  { id: 'none', label: 'なし' },
] as const;

export type PaletteId = (typeof PALETTES)[number]['id'];
export type PatternId = (typeof PATTERNS)[number]['id'];

function save(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode etc. — the setting still applies for this session */
  }
}

function emit(): void {
  window.dispatchEvent(new Event('settingschange'));
}

const root = () => document.documentElement.dataset;

export function getPalette(): PaletteId {
  const v = root().palette;
  return PALETTES.some((p) => p.id === v) ? (v as PaletteId) : 'ruri';
}
export function setPalette(id: PaletteId): void {
  root().palette = id;
  save('palette', id);
  emit();
}

export function getTheme(): 'light' | 'dark' {
  return root().theme === 'dark' ? 'dark' : 'light';
}
export function setTheme(t: 'light' | 'dark'): void {
  if (t === 'dark') root().theme = 'dark';
  else delete root().theme;
  save('theme', t);
  emit();
}

export function getPattern(): PatternId {
  const v = root().pattern;
  return PATTERNS.some((p) => p.id === v) ? (v as PatternId) : 'seigaiha';
}
export function setPattern(id: PatternId): void {
  root().pattern = id;
  save('pattern', id);
  emit();
}

export function getStamp(): boolean {
  return root().stamp !== 'off';
}
export function setStamp(on: boolean): void {
  if (on) delete root().stamp;
  else root().stamp = 'off';
  save('stamp', on ? 'on' : 'off');
  emit();
}

/** Subscribe a component to a settings getter; re-renders on every change. */
export function useSettingValue<T>(get: () => T): T {
  const [v, setV] = useState(get);
  useEffect(() => {
    const on = () => setV(get());
    window.addEventListener('settingschange', on);
    return () => window.removeEventListener('settingschange', on);
  }, [get]);
  return v;
}

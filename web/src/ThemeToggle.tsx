import { useRef } from 'react';
import { getTheme, setTheme, useSettingValue } from './settings';

export default function ThemeToggle() {
  const theme = useSettingValue(getTheme);
  const btnRef = useRef<HTMLButtonElement>(null);

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    if (next === 'dark' && btnRef.current && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const petal = document.createElement('i');
      petal.className = 'petal';
      btnRef.current.appendChild(petal);
      setTimeout(() => petal.remove(), 950);
    }
  };

  return (
    <button
      ref={btnRef}
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
    >
      {theme === 'dark' ? '☀' : '☾'}
    </button>
  );
}

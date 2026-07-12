import { useState } from 'react';

export default function ThemeToggle() {
  const [theme, setTheme] = useState(
    document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
  );

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    if (next === 'dark') document.documentElement.dataset.theme = 'dark';
    else delete document.documentElement.dataset.theme;
    try {
      localStorage.setItem('theme', next);
    } catch {
      /* private mode etc. — theme still applies for this session */
    }
    setTheme(next);
  };

  return (
    <button
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

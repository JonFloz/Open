'use client';

import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store';

const OPTIONS: { value: 'light' | 'dark' | 'system'; label: string; icon: string }[] = [
  { value: 'light', label: 'Claro', icon: '☀' },
  { value: 'dark', label: 'Oscuro', icon: '☾' },
  { value: 'system', label: 'Sistema', icon: '⚙' },
];

export function ThemeToggle() {
  const theme = useStore((state) => state.theme);
  const setTheme = useStore((state) => state.setTheme);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [open]);

  const current = OPTIONS.find((option) => option.value === theme) ?? OPTIONS[2];

  return (
    <div className="relative" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Tema: ${current.label}`}
        className="flex items-center gap-1 rounded-lg border border-border px-2 py-1.5 text-sm transition hover:bg-surface-2"
      >
        <span aria-hidden className="math-symbols">
          {current.icon}
        </span>
      </button>
      {open ? (
        <ul
          role="listbox"
          className="absolute bottom-full right-0 z-50 mb-2 w-36 overflow-hidden rounded-xl border border-border bg-surface shadow-xl"
        >
          {OPTIONS.map((option) => (
            <li key={option.value}>
              <button
                type="button"
                role="option"
                aria-selected={theme === option.value}
                onClick={() => {
                  setTheme(option.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-surface-2 ${
                  theme === option.value ? 'text-accent' : ''
                }`}
              >
                <span aria-hidden className="math-symbols w-4">
                  {option.icon}
                </span>
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export default ThemeToggle;

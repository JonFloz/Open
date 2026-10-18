'use client';

import { useEffect, useRef } from 'react';

export interface SlashItem {
  id: string;
  label: string;
  description?: string;
  hint?: string;
  group: 'Comandos' | 'Modelos' | 'Skills';
  icon?: string;
}

interface Props {
  items: SlashItem[];
  activeIndex: number;
  onSelect: (item: SlashItem) => void;
  onHover: (index: number) => void;
}

/** Submenú que se despliega al escribir `/` en la barra de prompt. */
export function SlashMenu({ items, activeIndex, onSelect, onHover }: Props) {
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const active = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    active?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (items.length === 0) return null;

  let lastGroup: string | null = null;

  return (
    <div
      role="listbox"
      aria-label="Comandos disponibles"
      className="absolute bottom-full left-0 right-0 z-40 mb-2 max-h-72 overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
    >
      <ul ref={listRef} className="scroll-thin max-h-72 overflow-y-auto py-1">
        {items.map((item, index) => {
          const showHeader = item.group !== lastGroup;
          lastGroup = item.group;
          return (
            <li key={item.id}>
              {showHeader ? (
                <p className="px-3 pb-1 pt-2 text-[0.65rem] font-semibold uppercase tracking-wider text-muted">
                  {item.group}
                </p>
              ) : null}
              <button
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                data-active={index === activeIndex}
                onMouseEnter={() => onHover(index)}
                onClick={() => onSelect(item)}
                className={`flex w-full items-baseline gap-2 px-3 py-2 text-left text-sm transition ${
                  index === activeIndex ? 'bg-accent-soft text-text' : 'text-muted hover:bg-surface-2'
                }`}
              >
                {item.icon ? (
                  <span aria-hidden className="math-symbols w-4 shrink-0">
                    {item.icon}
                  </span>
                ) : null}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-text">{item.label}</span>
                  {item.description ? (
                    <span className="block truncate text-xs text-muted">{item.description}</span>
                  ) : null}
                </span>
                {item.hint ? <span className="shrink-0 text-[0.65rem] text-muted">{item.hint}</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default SlashMenu;

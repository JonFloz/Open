'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@/lib/store';

/** Selector de modelo con búsqueda, agrupado por proveedor. */
export function ModelPicker() {
  const models = useStore((state) => state.models);
  const agents = useStore((state) => state.agents);
  const selectedModel = useStore((state) => state.selectedModel);
  const selectedAgent = useStore((state) => state.selectedAgent);
  const setModel = useStore((state) => state.setModel);
  const loading = useStore((state) => state.loadingModels);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const grouped = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? models.filter((model) =>
          `${model.providerID}/${model.modelID} ${model.name}`.toLowerCase().includes(needle),
        )
      : models;
    const map = new Map<string, typeof models>();
    for (const model of filtered) {
      const list = map.get(model.providerID) ?? [];
      list.push(model);
      map.set(model.providerID, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [models, query]);

  const label = selectedModel ?? (loading ? 'Cargando modelos…' : 'Selecciona un modelo');

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex max-w-[16rem] items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs transition hover:bg-surface-2"
        aria-haspopup="listbox"
        aria-expanded={open}
        title={label}
      >
        <span aria-hidden className="math-symbols text-accent">
          ⌘
        </span>
        <span className="truncate font-mono">{label}</span>
        <span aria-hidden className="text-muted">
          ▾
        </span>
      </button>

      {open ? (
        <div className="absolute bottom-full right-0 z-50 mb-2 w-80 overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
          <div className="border-b border-border p-2">
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar modelo…"
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm outline-none focus:border-accent"
            />
          </div>

          {agents.length > 0 ? (
            <div className="border-b border-border p-2">
              <label className="mb-1 block text-[0.65rem] uppercase tracking-wider text-muted">Agente</label>
              <select
                value={selectedAgent ?? ''}
                onChange={(event) => setModel(selectedModel, event.target.value || null)}
                className="w-full rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none"
              >
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <ul className="scroll-thin max-h-72 overflow-y-auto py-1" role="listbox">
            {grouped.length === 0 ? (
              <li className="px-3 py-4 text-center text-sm text-muted">Sin resultados</li>
            ) : (
              grouped.map(([provider, list]) => (
                <li key={provider}>
                  <p className="px-3 pb-1 pt-2 text-[0.65rem] font-semibold uppercase tracking-wider text-muted">
                    {provider}
                  </p>
                  <ul>
                    {list.map((model) => {
                      const id = `${model.providerID}/${model.modelID}`;
                      const active = id === selectedModel;
                      return (
                        <li key={id}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={active}
                            onClick={() => {
                              setModel(id, selectedAgent);
                              setOpen(false);
                            }}
                            className={`block w-full truncate px-3 py-1.5 text-left text-sm transition hover:bg-surface-2 ${
                              active ? 'text-accent' : 'text-muted'
                            }`}
                            title={model.name}
                          >
                            {model.modelID}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export default ModelPicker;

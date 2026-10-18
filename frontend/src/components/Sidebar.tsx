'use client';

import { useState } from 'react';
import { useStore } from '@/lib/store';
import { ThemeToggle } from './ThemeToggle';

function formatDate(value: string) {
  const date = new Date(value);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return date.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  return date.toLocaleDateString('es', { day: '2-digit', month: 'short' });
}

export function Sidebar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const conversations = useStore((state) => state.conversations);
  const currentId = useStore((state) => state.currentId);
  const sidebarOpen = useStore((state) => state.sidebarOpen);
  const setSidebarOpen = useStore((state) => state.setSidebarOpen);
  const openConversation = useStore((state) => state.openConversation);
  const newConversation = useStore((state) => state.newConversation);
  const removeConversation = useStore((state) => state.removeConversation);
  const renameConversation = useStore((state) => state.renameConversation);
  const user = useStore((state) => state.user);
  const logout = useStore((state) => state.logout);
  const toast = useStore((state) => state.toast);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const startRename = (id: string, title: string) => {
    setEditingId(id);
    setDraft(title);
  };

  const commitRename = async () => {
    if (!editingId) return;
    const title = draft.trim();
    setEditingId(null);
    if (!title) return;
    try {
      await renameConversation(editingId, title);
    } catch {
      toast('No se pudo renombrar la conversación', 'error');
    }
  };

  return (
    <>
      {sidebarOpen ? (
        <button
          type="button"
          aria-label="Cerrar menú"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm md:hidden"
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-border bg-surface transition-transform duration-200 md:static md:z-auto md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Cabecera */}
        <div className="flex items-center justify-between gap-2 px-4 py-4">
          <div className="flex items-center gap-2">
            <span aria-hidden className="math-symbols text-xl text-accent">
              ∑
            </span>
            <span className="font-semibold tracking-tight">OpenCode</span>
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-text md:hidden"
            aria-label="Cerrar barra lateral"
          >
            ✕
          </button>
        </div>

        <div className="px-3">
          <button
            type="button"
            onClick={() => {
              newConversation();
              setSidebarOpen(false);
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-3 py-2.5 text-sm font-medium text-accent-contrast transition hover:opacity-90"
          >
            <span aria-hidden>+</span> Nueva conversación
          </button>
        </div>

        {/* Historial */}
        <nav className="scroll-thin mt-4 flex-1 overflow-y-auto px-2 pb-4" aria-label="Historial de conversaciones">
          {conversations.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted">Todavía no hay conversaciones.</p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {conversations.map((conversation) => (
                <li key={conversation.id} className="group relative">
                  {editingId === conversation.id ? (
                    <input
                      autoFocus
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') void commitRename();
                        if (event.key === 'Escape') setEditingId(null);
                      }}
                      className="w-full rounded-lg border border-accent bg-surface-2 px-3 py-2 text-sm outline-none"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        void openConversation(conversation.id);
                        setSidebarOpen(false);
                      }}
                      className={`w-full truncate rounded-lg px-3 py-2 pr-16 text-left text-sm transition ${
                        currentId === conversation.id
                          ? 'bg-accent-soft text-text'
                          : 'text-muted hover:bg-surface-2 hover:text-text'
                      }`}
                      title={conversation.title}
                    >
                      {conversation.title}
                    </button>
                  )}

                  {editingId !== conversation.id ? (
                    <span className="absolute right-1 top-1 hidden items-center gap-0.5 group-hover:flex">
                      <button
                        type="button"
                        aria-label="Renombrar"
                        onClick={() => startRename(conversation.id, conversation.title)}
                        className="rounded p-1 text-muted hover:bg-surface-3 hover:text-text"
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        aria-label="Eliminar"
                        onClick={() => {
                          if (confirm(`¿Eliminar "${conversation.title}"?`)) {
                            void removeConversation(conversation.id).catch(() => toast('No se pudo eliminar', 'error'));
                          }
                        }}
                        className="rounded p-1 text-muted hover:bg-surface-3 hover:text-danger"
                      >
                        🗑
                      </button>
                    </span>
                  ) : null}

                  <span className="pointer-events-none absolute right-2 top-2 text-[0.65rem] text-muted group-hover:hidden">
                    {formatDate(conversation.updatedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </nav>

        {/* Pie */}
        <div className="border-t border-border p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="truncate text-xs text-muted" title={user?.email}>
              {user?.email}
            </span>
            <ThemeToggle />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onOpenSettings}
              className="flex-1 rounded-lg border border-border px-3 py-2 text-sm transition hover:bg-surface-2"
            >
              Ajustes
            </button>
            <button
              type="button"
              onClick={() => void logout()}
              className="rounded-lg border border-border px-3 py-2 text-sm transition hover:bg-surface-2 hover:text-danger"
            >
              Salir
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

export default Sidebar;

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChatView } from '@/components/ChatView';
import { PromptBar } from '@/components/PromptBar';
import { SettingsPanel } from '@/components/SettingsPanel';
import { Sidebar } from '@/components/Sidebar';
import { useStore } from '@/lib/store';

function FullScreenMessage({ text }: { text: string }) {
  return (
    <div className="flex h-dvh items-center justify-center">
      <p aria-hidden className="math-symbols animate-pulse text-3xl text-accent">
        ∑
      </p>
      <span className="sr-only">{text}</span>
    </div>
  );
}

export default function HomePage() {
  const router = useRouter();
  const ready = useStore((state) => state.ready);
  const user = useStore((state) => state.user);
  const setSidebarOpen = useStore((state) => state.setSidebarOpen);
  const currentTitle = useStore((state) =>
    state.conversations.find((conversation) => conversation.id === state.currentId)?.title,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    if (ready && !user) router.replace('/login/');
  }, [ready, user, router]);

  if (!ready) return <FullScreenMessage text="Cargando OpenCode Web Chat" />;
  if (!user) return null;

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar onOpenSettings={() => setSettingsOpen(true)} />

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-border bg-bg/80 px-4 py-3 backdrop-blur">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-1.5 text-muted transition hover:bg-surface-2 hover:text-text md:hidden"
            aria-label="Abrir menú"
          >
            ☰
          </button>
          <h1 className="min-w-0 flex-1 truncate text-sm font-medium text-muted">
            {currentTitle ?? 'Nueva conversación'}
          </h1>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="rounded-lg border border-border px-3 py-1.5 text-xs transition hover:bg-surface-2"
          >
            ⚙ Ajustes
          </button>
        </header>

        <ChatView />
        <PromptBar />
      </main>

      {settingsOpen ? <SettingsPanel onClose={() => setSettingsOpen(false)} /> : null}
    </div>
  );
}

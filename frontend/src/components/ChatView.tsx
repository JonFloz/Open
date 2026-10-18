'use client';

import { useEffect, useRef } from 'react';
import { MessageBubble } from './MessageBubble';
import { useStore } from '@/lib/store';

const EXAMPLES = [
  'Explícame el teorema fundamental del cálculo con símbolos Unicode: ∫ₐᵇ f′(x) dx = f(b) − f(a)',
  'Resume este texto en tres puntos',
  'Escribe una función en Python que calcule ∑ᵢ₌₁ⁿ i',
];

export function ChatView() {
  const messages = useStore((state) => state.messages);
  const loading = useStore((state) => state.loadingConversation);
  const sendPrompt = useStore((state) => state.sendPrompt);
  const user = useStore((state) => state.user);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted">Cargando conversación…</div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
        <div>
          <p aria-hidden className="math-symbols text-4xl text-accent">
            ∑ ∫ √ ± ≠ ≤ ≥ → ∞
          </p>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight">¿En qué te ayudo, {user?.email?.split('@')[0]}?</h2>
          <p className="mt-2 max-w-lg text-sm text-muted">
            Escribe un prompt, adjunta imágenes o usa <code>/</code> para ver comandos, modelos y skills.
          </p>
        </div>
        <ul className="grid w-full max-w-2xl gap-2 sm:grid-cols-3">
          {EXAMPLES.map((example) => (
            <li key={example}>
              <button
                type="button"
                onClick={() => void sendPrompt(example)}
                className="h-full w-full rounded-xl border border-border bg-surface p-3 text-left text-xs text-muted transition hover:border-accent hover:text-text"
              >
                {example}
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="scroll-thin flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

export default ChatView;

'use client';

import { useState } from 'react';
import { Markdown } from './Markdown';
import type { ChatMessage } from '@/lib/types';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* el portapapeles puede estar bloqueado */
        }
      }}
      className="rounded-md px-2 py-1 text-xs text-muted transition hover:bg-surface-3 hover:text-text"
      aria-label="Copiar mensaje"
    >
      {copied ? '✓ Copiado' : '⧉ Copiar'}
    </button>
  );
}

export function MessageBubble({ message }: { message: ChatMessage }) {
  const [showReasoning, setShowReasoning] = useState(false);
  const isUser = message.role === 'user';
  const tools = (message.meta?.tools as { name: string; status?: string }[] | undefined) ?? [];

  if (isUser) {
    return (
      <article className="animate-in-up flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-accent px-4 py-3 text-accent-contrast shadow-sm">
          <p className="message-body whitespace-pre-wrap">{message.content}</p>
          {message.meta?.images?.length ? (
            <ul className="mt-2 flex flex-wrap gap-2">
              {message.meta.images.map((image, index) => (
                <li
                  key={`${image.name}-${index}`}
                  className="rounded-lg bg-black/10 px-2 py-1 text-xs"
                  title={image.path || image.name}
                >
                  🖼 {image.name || 'imagen'}
                </li>
              ))}
            </ul>
          ) : null}
          {message.meta?.skills?.length ? (
            <p className="mt-2 text-xs opacity-80">skills: {message.meta.skills.join(', ')}</p>
          ) : null}
        </div>
      </article>
    );
  }

  const isError = message.role === 'error';

  return (
    <article className="animate-in-up flex justify-start">
      <div
        className={`w-full max-w-[92%] rounded-2xl rounded-bl-md border px-4 py-3 shadow-sm ${
          isError ? 'border-danger/40 bg-surface-2' : 'border-border bg-surface'
        }`}
      >
        <header className="mb-2 flex items-center gap-2 text-xs text-muted">
          <span aria-hidden className="math-symbols text-accent">
            ⌬
          </span>
          <span className="font-medium">OpenCode</span>
          {message.model ? <span className="font-mono text-[0.7rem]">{message.model}</span> : null}
          <span className="ml-auto">
            <CopyButton text={message.content} />
          </span>
        </header>

        {message.reasoning ? (
          <details
            open={showReasoning}
            onToggle={(event) => setShowReasoning((event.target as HTMLDetailsElement).open)}
            className="mb-2 rounded-lg border border-border bg-surface-2 px-3 py-2"
          >
            <summary className="cursor-pointer text-xs text-muted">Razonamiento</summary>
            <div className="message-body mt-2 text-sm text-muted">
              <Markdown>{message.reasoning}</Markdown>
            </div>
          </details>
        ) : null}

        {tools.length > 0 ? (
          <ul className="mb-2 flex flex-wrap gap-1.5">
            {tools.map((tool, index) => (
              <li
                key={`${tool.name}-${index}`}
                className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[0.7rem] text-muted"
              >
                <span aria-hidden>⚙ </span>
                {tool.name}
                {tool.status ? ` · ${tool.status}` : ''}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="message-body">
          <Markdown>{message.content || (message.streaming ? '' : '_(respuesta vacía)_')}</Markdown>
          {message.streaming ? (
            <span aria-hidden className="ml-0.5 inline-block h-4 w-2 animate-pulse rounded-sm bg-accent align-middle" />
          ) : null}
        </div>
      </div>
    </article>
  );
}

export default MessageBubble;

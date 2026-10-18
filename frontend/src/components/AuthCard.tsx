'use client';

import { useState } from 'react';

interface AuthCardProps {
  title: string;
  subtitle: string;
  submitLabel: string;
  footer: React.ReactNode;
  onSubmit: (email: string, password: string) => Promise<void>;
}

export function AuthCard({ title, subtitle, submitLabel, footer, onSubmit }: AuthCardProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Introduce un email válido');
      return;
    }
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres');
      return;
    }

    setLoading(true);
    try {
      await onSubmit(email.trim(), password);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo completar la operación');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p aria-hidden className="math-symbols text-3xl text-accent">
            ∑ ∫ √
          </p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-muted">{subtitle}</p>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">Email</span>
            <input
              type="email"
              value={email}
              autoComplete="email"
              required
              onChange={(event) => setEmail(event.target.value)}
              className="rounded-lg border border-border bg-surface-2 px-3 py-2 outline-none focus:border-accent"
              placeholder="tu@email.com"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">Contraseña</span>
            <input
              type="password"
              value={password}
              autoComplete="current-password"
              required
              minLength={8}
              onChange={(event) => setPassword(event.target.value)}
              className="rounded-lg border border-border bg-surface-2 px-3 py-2 outline-none focus:border-accent"
              placeholder="mínimo 8 caracteres"
            />
          </label>

          {error ? (
            <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="mt-1 rounded-xl bg-accent px-4 py-2.5 font-medium text-accent-contrast transition hover:opacity-90 disabled:opacity-50"
          >
            {loading ? 'Un momento…' : submitLabel}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-muted">{footer}</p>
      </div>
    </main>
  );
}

export default AuthCard;

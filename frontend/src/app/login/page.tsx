'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AuthCard } from '@/components/AuthCard';
import { ApiRequestError } from '@/lib/api';
import { useStore } from '@/lib/store';

export default function LoginPage() {
  const router = useRouter();
  const login = useStore((state) => state.login);
  const user = useStore((state) => state.user);
  const ready = useStore((state) => state.ready);

  useEffect(() => {
    if (ready && user) router.replace('/');
  }, [ready, user, router]);

  return (
    <AuthCard
      title="Inicia sesión"
      subtitle="Entra para chatear con OpenCode desde el navegador."
      submitLabel="Entrar"
      onSubmit={async (email, password) => {
        try {
          await login(email, password);
          router.replace('/');
        } catch (error) {
          if (error instanceof ApiRequestError) throw new Error(error.message);
          throw error;
        }
      }}
      footer={
        <>
          ¿No tienes cuenta?{' '}
          <Link href="/register/" className="text-accent hover:underline">
            Crear una
          </Link>
        </>
      }
    />
  );
}

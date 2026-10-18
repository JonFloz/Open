'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AuthCard } from '@/components/AuthCard';
import { useStore } from '@/lib/store';

export default function RegisterPage() {
  const router = useRouter();
  const register = useStore((state) => state.register);
  const user = useStore((state) => state.user);
  const ready = useStore((state) => state.ready);

  useEffect(() => {
    if (ready && user) router.replace('/');
  }, [ready, user, router]);

  return (
    <AuthCard
      title="Crea tu cuenta"
      subtitle="Guarda tus API keys cifradas y tu historial de conversaciones."
      submitLabel="Crear cuenta"
      onSubmit={async (email, password) => {
        await register(email, password);
        router.replace('/');
      }}
      footer={
        <>
          ¿Ya tienes cuenta?{' '}
          <Link href="/login/" className="text-accent hover:underline">
            Inicia sesión
          </Link>
        </>
      }
    />
  );
}

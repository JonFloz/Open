'use client';

import { useEffect } from 'react';
import { Toasts } from './Toasts';
import { useStore } from '@/lib/store';

/** Inicializa la sesión (token guardado) y monta componentes globales. */
export function Providers({ children }: { children: React.ReactNode }) {
  const bootstrap = useStore((state) => state.bootstrap);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  return (
    <>
      {children}
      <Toasts />
    </>
  );
}

export default Providers;

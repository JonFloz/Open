import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/components/Providers';

export const metadata: Metadata = {
  title: 'OpenCode Web Chat',
  description:
    'Chat web para interactuar con OpenCode desde el navegador: modelos, skills, imágenes y simbología matemática Unicode.',
  applicationName: 'OpenCode Web Chat',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f8fa' },
    { media: '(prefers-color-scheme: dark)', color: '#1a1c22' },
  ],
};

/**
 * Aplica el tema guardado antes del primer pintado para evitar el destello
 * blanco al cargar en modo oscuro.
 */
const THEME_SCRIPT = `(function(){try{
var t=localStorage.getItem('owc.theme')||'system';
var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);
document.documentElement.classList.toggle('dark',d);
document.documentElement.style.colorScheme=d?'dark':'light';
}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Fuentes para simbología matemática Unicode (sin LaTeX). */}
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+Math&family=Noto+Sans+Symbols+2&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh bg-bg text-text antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

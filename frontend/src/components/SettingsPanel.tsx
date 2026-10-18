'use client';

import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store';

type Tab = 'cuenta' | 'keys' | 'skills' | 'servidor';

const TABS: { id: Tab; label: string }[] = [
  { id: 'cuenta', label: 'Cuenta' },
  { id: 'keys', label: 'API keys' },
  { id: 'skills', label: 'Skills' },
  { id: 'servidor', label: 'Servidor' },
];

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('cuenta');
  const user = useStore((state) => state.user);
  const theme = useStore((state) => state.theme);
  const setTheme = useStore((state) => state.setTheme);
  const apiKeys = useStore((state) => state.apiKeys);
  const createApiKey = useStore((state) => state.createApiKey);
  const removeApiKey = useStore((state) => state.removeApiKey);
  const setDefaultApiKey = useStore((state) => state.setDefaultApiKey);
  const verifyApiKey = useStore((state) => state.verifyApiKey);
  const skills = useStore((state) => state.skills);
  const opencodeSkills = useStore((state) => state.opencodeSkills);
  const uploadSkillFile = useStore((state) => state.uploadSkillFile);
  const installSkillFromUrl = useStore((state) => state.installSkillFromUrl);
  const removeSkill = useStore((state) => state.removeSkill);
  const serverStatus = useStore((state) => state.serverStatus);
  const refreshServerStatus = useStore((state) => state.refreshServerStatus);
  const toast = useStore((state) => state.toast);
  const settings = useStore((state) => state.settings);

  const [keyLabel, setKeyLabel] = useState('');
  const [keyValue, setKeyValue] = useState('');
  const [keyProvider, setKeyProvider] = useState('opencode-go');
  const [savingKey, setSavingKey] = useState(false);
  const [installUrl, setInstallUrl] = useState('');

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submitKey = async (event: React.FormEvent) => {
    event.preventDefault();
    if (keyValue.trim().length < 8) {
      toast('La API key parece demasiado corta', 'warning');
      return;
    }
    setSavingKey(true);
    try {
      await createApiKey({ label: keyLabel || 'Mi API key', provider: keyProvider, key: keyValue.trim() });
      setKeyLabel('');
      setKeyValue('');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'No se pudo guardar la API key', 'error');
    } finally {
      setSavingKey(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal>
      <div className="flex h-[min(42rem,90dvh)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold">Ajustes</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted transition hover:bg-surface-2 hover:text-text"
            aria-label="Cerrar ajustes"
          >
            ✕
          </button>
        </header>

        <nav className="flex gap-1 border-b border-border px-3 pt-2">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`rounded-t-lg px-3 py-2 text-sm transition ${
                tab === item.id ? 'bg-surface-2 text-text' : 'text-muted hover:text-text'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="scroll-thin flex-1 overflow-y-auto p-5">
          {tab === 'cuenta' ? (
            <section className="flex flex-col gap-4 text-sm">
              <div>
                <p className="text-muted">Email</p>
                <p className="font-medium">{user?.email}</p>
              </div>
              <div>
                <p className="text-muted">Tema</p>
                <div className="mt-1 flex gap-2">
                  {(['light', 'dark', 'system'] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setTheme(option)}
                      className={`rounded-lg border px-3 py-1.5 transition ${
                        theme === option ? 'border-accent text-accent' : 'border-border text-muted hover:bg-surface-2'
                      }`}
                    >
                      {option === 'light' ? 'Claro' : option === 'dark' ? 'Oscuro' : 'Sistema'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-muted">Modelo por defecto</p>
                <p className="font-mono text-xs">{settings?.defaultModel ?? '(el del servidor)'}</p>
              </div>
            </section>
          ) : null}

          {tab === 'keys' ? (
            <section className="flex flex-col gap-5 text-sm">
              <p className="text-muted">
                Tus API keys se cifran con AES-256-GCM antes de guardarse y se registran como credencial en el
                servidor de OpenCode.
              </p>

              <ul className="flex flex-col gap-2">
                {apiKeys.length === 0 ? (
                  <li className="rounded-lg border border-dashed border-border p-3 text-center text-muted">
                    No has guardado ninguna API key todavía.
                  </li>
                ) : (
                  apiKeys.map((keyItem) => (
                    <li
                      key={keyItem.id}
                      className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2"
                    >
                      <span className="font-medium">{keyItem.label}</span>
                      <span className="font-mono text-xs text-muted">{keyItem.masked}</span>
                      <span className="rounded-full border border-border px-2 py-0.5 text-[0.65rem] text-muted">
                        {keyItem.provider}
                      </span>
                      {keyItem.isDefault ? (
                        <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[0.65rem] text-accent">
                          predeterminada
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void setDefaultApiKey(keyItem.id)}
                          className="text-xs text-accent hover:underline"
                        >
                          usar esta
                        </button>
                      )}
                      <span className="ml-auto flex gap-2">
                        <button
                          type="button"
                          onClick={() => void verifyApiKey(keyItem.id)}
                          className="text-xs text-muted hover:text-text"
                        >
                          verificar
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeApiKey(keyItem.id)}
                          className="text-xs text-muted hover:text-danger"
                        >
                          eliminar
                        </button>
                      </span>
                    </li>
                  ))
                )}
              </ul>

              <form onSubmit={submitKey} className="flex flex-col gap-2 rounded-xl border border-border p-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <input
                    value={keyLabel}
                    onChange={(event) => setKeyLabel(event.target.value)}
                    placeholder="Etiqueta (p. ej. Personal)"
                    className="rounded-lg border border-border bg-surface-2 px-3 py-2 outline-none focus:border-accent"
                  />
                  <select
                    value={keyProvider}
                    onChange={(event) => setKeyProvider(event.target.value)}
                    className="rounded-lg border border-border bg-surface-2 px-3 py-2 outline-none focus:border-accent"
                  >
                    <option value="opencode-go">opencode-go</option>
                    <option value="opencode">opencode</option>
                    <option value="anthropic">anthropic</option>
                    <option value="openai">openai</option>
                    <option value="otro">otro</option>
                  </select>
                </div>
                <input
                  value={keyValue}
                  onChange={(event) => setKeyValue(event.target.value)}
                  type="password"
                  placeholder="oc_sk_…"
                  autoComplete="off"
                  className="rounded-lg border border-border bg-surface-2 px-3 py-2 font-mono outline-none focus:border-accent"
                />
                <button
                  type="submit"
                  disabled={savingKey}
                  className="self-start rounded-lg bg-accent px-4 py-2 font-medium text-accent-contrast transition hover:opacity-90 disabled:opacity-50"
                >
                  {savingKey ? 'Guardando…' : 'Guardar API key'}
                </button>
              </form>
            </section>
          ) : null}

          {tab === 'skills' ? (
            <section className="flex flex-col gap-5 text-sm">
              <p className="text-muted">
                Las skills son archivos Markdown que definen comandos personalizados. Se guardan en el disco
                persistente (<code>/data/skills</code>).
              </p>

              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-muted">Subir archivo .md / .json</span>
                  <input
                    type="file"
                    accept=".md,.markdown,.json,.txt"
                    onChange={async (event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      try {
                        await uploadSkillFile(file);
                      } catch (error) {
                        toast(error instanceof Error ? error.message : 'No se pudo subir la skill', 'error');
                      }
                      event.target.value = '';
                    }}
                    className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs file:mr-3 file:rounded file:border-0 file:bg-accent file:px-2 file:py-1 file:text-accent-contrast"
                  />
                </label>
                <div className="flex flex-col gap-1">
                  <span className="text-muted">Instalar desde URL</span>
                  <div className="flex gap-2">
                    <input
                      value={installUrl}
                      onChange={(event) => setInstallUrl(event.target.value)}
                      placeholder="https://ejemplo.com/skill.md"
                      className="w-56 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs outline-none focus:border-accent"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        if (!installUrl.trim()) return;
                        try {
                          await installSkillFromUrl(installUrl.trim());
                          setInstallUrl('');
                        } catch (error) {
                          toast(error instanceof Error ? error.message : 'No se pudo instalar', 'error');
                        }
                      }}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs transition hover:bg-surface-2"
                    >
                      Instalar
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="mb-2 font-medium">Mis skills ({skills.length})</h3>
                <ul className="flex flex-col gap-2">
                  {skills.length === 0 ? (
                    <li className="rounded-lg border border-dashed border-border p-3 text-center text-muted">
                      Todavía no tienes skills.
                    </li>
                  ) : (
                    skills.map((skill) => (
                      <li key={skill.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
                        <span aria-hidden className="math-symbols text-accent">
                          ✧
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{skill.name}</span>
                          <span className="block truncate text-xs text-muted">{skill.description}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => void removeSkill(skill.id)}
                          className="text-xs text-muted hover:text-danger"
                        >
                          eliminar
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              </div>

              <div>
                <h3 className="mb-2 font-medium">Skills del servidor de OpenCode ({opencodeSkills.length})</h3>
                <ul className="flex flex-col gap-1">
                  {opencodeSkills.map((skill) => (
                    <li key={skill.id} className="rounded-lg bg-surface-2 px-3 py-2">
                      <span className="block font-medium">{skill.name}</span>
                      <span className="block text-xs text-muted">{skill.description}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          ) : null}

          {tab === 'servidor' ? (
            <section className="flex flex-col gap-3 text-sm">
              <button
                type="button"
                onClick={() => void refreshServerStatus()}
                className="self-start rounded-lg border border-border px-3 py-1.5 transition hover:bg-surface-2"
              >
                Actualizar estado
              </button>
              <dl className="grid gap-2">
                {[
                  ['Conectado', serverStatus?.connected ? 'sí' : 'no'],
                  ['URL', serverStatus?.server.baseUrl ?? '—'],
                  ['Gestionado por el backend', serverStatus?.server.managed ? 'sí' : 'no'],
                  ['Versión', serverStatus?.server.version ?? '—'],
                  ['Directorio', serverStatus?.directory ?? '—'],
                  ['Modelo por defecto', serverStatus?.defaultModel ?? '—'],
                  ['Agente por defecto', serverStatus?.defaultAgent ?? '—'],
                  ['Suscriptores SSE', String(serverStatus?.events.subscribers ?? 0)],
                  ['Error', serverStatus?.error ?? '—'],
                ].map(([label, value]) => (
                  <div key={label} className="flex gap-3 border-b border-border pb-1.5">
                    <dt className="w-56 shrink-0 text-muted">{label}</dt>
                    <dd className="min-w-0 flex-1 break-words font-mono text-xs">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default SettingsPanel;

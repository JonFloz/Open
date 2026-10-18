'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ModelPicker } from './ModelPicker';
import { SlashMenu, type SlashItem } from './SlashMenu';
import { useStore } from '@/lib/store';

interface Attachment {
  data: string;
  name: string;
  mimeType: string;
}

const MAX_IMAGES = 5;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const COMMANDS: SlashItem[] = [
  { id: 'cmd-models', label: '/models', description: 'Ver y cambiar el modelo activo', group: 'Comandos', icon: '⌘' },
  { id: 'cmd-skills', label: '/skills', description: 'Listar skills instaladas', group: 'Comandos', icon: '✧' },
  { id: 'cmd-install', label: '/skills install <url>', description: 'Instalar una skill desde una URL', group: 'Comandos', icon: '↓' },
  { id: 'cmd-status', label: '/status', description: 'Estado de la conexión con OpenCode', group: 'Comandos', icon: '◎' },
  { id: 'cmd-clear', label: '/clear', description: 'Limpiar el historial local', group: 'Comandos', icon: '⌫' },
  { id: 'cmd-help', label: '/help', description: 'Mostrar la ayuda de comandos', group: 'Comandos', icon: '?' },
];

export function PromptBar() {
  const [value, setValue] = useState('');
  const [images, setImages] = useState<Attachment[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [installing, setInstalling] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const streaming = useStore((state) => state.streaming);
  const sendPrompt = useStore((state) => state.sendPrompt);
  const stopStreaming = useStore((state) => state.stopStreaming);
  const clearMessages = useStore((state) => state.clearMessages);
  const toast = useStore((state) => state.toast);
  const models = useStore((state) => state.models);
  const skills = useStore((state) => state.skills);
  const opencodeSkills = useStore((state) => state.opencodeSkills);
  const setModel = useStore((state) => state.setModel);
  const selectedModel = useStore((state) => state.selectedModel);
  const refreshServerStatus = useStore((state) => state.refreshServerStatus);
  const installSkillFromUrl = useStore((state) => state.installSkillFromUrl);
  const serverStatus = useStore((state) => state.serverStatus);

  // Autoajuste de altura del textarea.
  useEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = 'auto';
    node.style.height = `${Math.min(node.scrollHeight, 220)}px`;
  }, [value]);

  const query = value.startsWith('/') ? value.slice(1) : null;

  const items = useMemo<SlashItem[]>(() => {
    if (query === null) return [];
    const needle = query.toLowerCase().trim();

    if (needle.includes(' ')) {
      // Ya se está escribiendo `/skills install <url>`: no mostramos menú.
      return [];
    }

    const commands = COMMANDS.filter((command) => command.label.toLowerCase().includes(`/${needle}`));
    const modelItems: SlashItem[] = models
      .filter((model) => `${model.providerID}/${model.modelID}`.toLowerCase().includes(needle))
      .slice(0, 20)
      .map((model) => ({
        id: `model-${model.providerID}-${model.modelID}`,
        label: `${model.providerID}/${model.modelID}`,
        description: model.name,
        group: 'Modelos' as const,
        icon: '⌘',
        hint: `${model.providerID}/${model.modelID}` === selectedModel ? 'activo' : undefined,
      }));
    const skillItems: SlashItem[] = [...skills, ...opencodeSkills]
      .filter((skill) => `${skill.name} ${skill.description}`.toLowerCase().includes(needle))
      .slice(0, 15)
      .map((skill) => ({
        id: `skill-${skill.id}`,
        label: skill.name,
        description: skill.description.length > 110 ? `${skill.description.slice(0, 109)}…` : skill.description || 'Skill',
        group: 'Skills' as const,
        icon: '✧',
        hint: skill.source === 'opencode' ? 'OpenCode' : undefined,
      }));

    return [...commands, ...modelItems, ...skillItems];
  }, [query, models, skills, opencodeSkills, selectedModel]);

  useEffect(() => {
    setMenuOpen(items.length > 0);
    setActiveIndex(0);
  }, [items.length, query]);

  const attachFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const next: Attachment[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) {
        toast(`"${file.name}" no es una imagen`, 'warning');
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        toast(`"${file.name}" supera los 5 MB`, 'warning');
        continue;
      }
      next.push({ data: await toDataUri(file), name: file.name, mimeType: file.type });
    }
    setImages((current) => [...current, ...next].slice(0, MAX_IMAGES));
    if (fileRef.current) fileRef.current.value = '';
  };

  const runCommand = async (text: string): Promise<boolean> => {
    const [rawCommand, ...rest] = text.split(/\s+/);
    const command = rawCommand.toLowerCase();

    if (command === '/models') {
      setModel(null);
      toast(`Modelo activo: ${selectedModel ?? 'ninguno'}. Usa el selector ⌘ para cambiarlo.`, 'info');
      return true;
    }
    if (command === '/skills') {
      if (rest[0]?.toLowerCase() === 'install') {
        const url = rest[1];
        if (!url) {
          toast('Uso: /skills install <url>', 'warning');
          return true;
        }
        setInstalling(true);
        try {
          await installSkillFromUrl(url);
        } catch (error) {
          toast(error instanceof Error ? error.message : 'No se pudo instalar la skill', 'error');
        } finally {
          setInstalling(false);
        }
        return true;
      }
      const list = [...skills, ...opencodeSkills];
      toast(
        list.length === 0
          ? 'No hay skills instaladas. Sube un .md en Ajustes o usa /skills install <url>.'
          : `Skills: ${list.map((skill) => skill.name).join(', ')}`,
        'info',
      );
      return true;
    }
    if (command === '/status') {
      await refreshServerStatus();
      const status = useStore.getState().serverStatus;
      toast(
        status?.connected
          ? `Conectado a OpenCode ${status.server.version ?? ''} en ${status.server.baseUrl}`
          : `Sin conexión con OpenCode${status?.error ? `: ${status.error}` : ''}`,
        status?.connected ? 'success' : 'error',
      );
      return true;
    }
    if (command === '/clear') {
      clearMessages();
      return true;
    }
    if (command === '/help') {
      toast('Comandos: /models, /skills, /skills install <url>, /status, /clear, /help', 'info');
      return true;
    }
    return false;
  };

  const submit = async () => {
    const text = value.trim();
    if (!text && images.length === 0) return;
    if (streaming) {
      toast('Espera a que termine la respuesta actual', 'warning');
      return;
    }
    if (text.startsWith('/')) {
      const handled = await runCommand(text);
      if (handled) {
        setValue('');
        setMenuOpen(false);
        return;
      }
    }
    const payloadImages = images;
    setValue('');
    setImages([]);
    setMenuOpen(false);
    await sendPrompt(text, payloadImages);
  };

  const onSelectItem = async (item: SlashItem) => {
    if (item.id.startsWith('model-')) {
      setModel(item.label);
      setValue('');
      setMenuOpen(false);
      toast(`Modelo: ${item.label}`, 'success');
      return;
    }
    if (item.id.startsWith('skill-')) {
      setValue((current) => current.replace(/^\/[^\s]*\s*/, ''));
      toast(`Skill "${item.label}" disponible: escríbela en el prompt o menciona su nombre.`, 'info');
      setMenuOpen(false);
      return;
    }
    setValue(item.label.endsWith('<url>') ? '/skills install ' : item.label);
    setMenuOpen(false);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (menuOpen && items.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((index) => (index + 1) % items.length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((index) => (index - 1 + items.length) % items.length);
        return;
      }
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        void onSelectItem(items[activeIndex]);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setMenuOpen(false);
        return;
      }
      if (event.key === 'Tab') {
        event.preventDefault();
        void onSelectItem(items[activeIndex]);
        return;
      }
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  };

  return (
    <div className="border-t border-border bg-bg/80 px-4 pb-4 pt-3 backdrop-blur">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <ModelPicker />
          <span
            className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[0.7rem] ${
              serverStatus?.connected ? 'border-success/40 text-success' : 'border-border text-muted'
            }`}
            title={serverStatus?.server.baseUrl ?? 'OpenCode no conectado'}
          >
            <span aria-hidden>{serverStatus?.connected ? '●' : '○'}</span>
            {serverStatus?.connected ? `OpenCode ${serverStatus.server.version ?? ''}` : 'sin conexión'}
          </span>
        </div>

        <div className="relative">
          {menuOpen ? (
            <SlashMenu
              items={items}
              activeIndex={activeIndex}
              onSelect={(item) => void onSelectItem(item)}
              onHover={setActiveIndex}
            />
          ) : null}

          <div className="rounded-2xl border border-border bg-surface p-2 shadow-sm focus-within:border-accent">
            {images.length > 0 ? (
              <ul className="mb-2 flex flex-wrap gap-2 px-1">
                {images.map((image, index) => (
                  <li key={`${image.name}-${index}`} className="group relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={image.data}
                      alt={image.name}
                      className="h-16 w-16 rounded-lg border border-border object-cover"
                    />
                    <button
                      type="button"
                      aria-label={`Quitar ${image.name}`}
                      onClick={() => setImages((current) => current.filter((_, i) => i !== index))}
                      className="absolute -right-1.5 -top-1.5 rounded-full border border-border bg-surface px-1 text-xs text-muted hover:text-danger"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            <textarea
              ref={textareaRef}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              placeholder="Escribe un prompt…  (usa / para comandos)"
              title="Enter envía · Shift+Enter inserta un salto de línea"
              className="message-body max-h-[220px] w-full resize-none bg-transparent px-2 py-2 text-[0.95rem] outline-none placeholder:text-muted"
            />

            <div className="flex items-center justify-between gap-2 px-1 pt-1">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="rounded-lg px-2 py-1.5 text-sm text-muted transition hover:bg-surface-2 hover:text-text"
                  title="Adjuntar imágenes (máx. 5)"
                >
                  <span aria-hidden>📎</span>
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={(event) => void attachFiles(event.target.files)}
                />
                {installing ? <span className="text-xs text-muted">instalando skill…</span> : null}
              </div>

              {streaming ? (
                <button
                  type="button"
                  onClick={() => void stopStreaming()}
                  className="rounded-xl border border-danger/50 px-4 py-1.5 text-sm text-danger transition hover:bg-danger/10"
                >
                  ■ Detener
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={!value.trim() && images.length === 0}
                  className="rounded-xl bg-accent px-4 py-1.5 text-sm font-medium text-accent-contrast transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Enviar ↑
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function toDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default PromptBar;

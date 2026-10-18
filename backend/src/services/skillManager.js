import fs from 'node:fs';
import path from 'node:path';
import config from '../config.js';
import {
  deleteSkill as deleteSkillRow,
  findSkill,
  listSkills as listSkillRows,
  publicSkill,
  upsertSkill,
} from '../db/skills.js';

/** Directorio de skills de un usuario dentro del disco persistente. */
export function userSkillsDir(userId) {
  return path.join(config.skillsDir, sanitizeSegment(userId));
}

function sanitizeSegment(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '_');
}

/** Evita rutas tipo `../../etc/passwd`. */
function safeFilename(name) {
  const base = path
    .basename(String(name))
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/^\.+/, '');
  const withExt = /\.(md|markdown|json)$/i.test(base) ? base : `${base}.md`;
  return withExt.slice(0, 120);
}

/** Extrae `name` y `description` del frontmatter YAML o del primer título. */
export function parseSkill(content, fallbackName = 'skill') {
  const text = String(content ?? '');
  let name = fallbackName;
  let description = '';

  const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (frontmatter) {
    const body = frontmatter[1];
    const nameMatch = body.match(/^name:\s*(.+)$/m);
    const descriptionMatch = body.match(/^description:\s*(.+)$/m);
    if (nameMatch) name = nameMatch[1].trim().replace(/^["']|["']$/g, '');
    if (descriptionMatch) description = descriptionMatch[1].trim().replace(/^["']|["']$/g, '');
  }

  if (!description) {
    const headingMatch = text.match(/^#\s+(.+)$/m);
    if (headingMatch && name === fallbackName) name = headingMatch[1].trim();
    const paragraph = text
      .replace(/^---[\s\S]*?---/, '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith('#') && !line.startsWith('---'));
    if (paragraph) description = paragraph.slice(0, 240);
  }

  return { name: normalizeSkillName(name), description };
}

export function normalizeSkillName(name) {
  return String(name ?? 'skill')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'skill';
}

/** Guarda (o actualiza) una skill en disco y en SQLite. */
export function saveSkill(userId, { name, description, content, filename, source = 'manual' }) {
  if (typeof content !== 'string' || content.trim().length === 0) {
    const error = new Error('La skill está vacía');
    error.status = 400;
    throw error;
  }
  const parsed = parseSkill(content, name ?? filename ?? 'skill');
  const finalName = normalizeSkillName(name ?? parsed.name);
  const dir = userSkillsDir(userId);
  fs.mkdirSync(dir, { recursive: true });

  const file = safeFilename(filename ?? `${finalName}.md`);
  const target = path.join(dir, file);
  fs.writeFileSync(target, content, 'utf8');

  const row = upsertSkill(userId, {
    name: finalName,
    description: description ?? parsed.description,
    filename: file,
    source,
    size: Buffer.byteLength(content, 'utf8'),
  });
  return publicSkill(row);
}

/** Lista las skills del usuario (metadatos + contenido). */
export function listUserSkills(userId, { includeContent = false } = {}) {
  return listSkillRows(userId).map((row) => {
    const base = {
      id: row.id,
      name: row.name,
      description: row.description,
      filename: row.filename,
      source: row.source,
      size: row.size,
      createdAt: row.createdAt,
    };
    if (!includeContent) return base;
    return { ...base, content: readSkillContent(userId, row) ?? '' };
  });
}

/** Lee el contenido de una skill desde el disco persistente. */
export function readSkillContent(userId, row) {
  if (!row) return null;
  const target = path.join(userSkillsDir(userId), row.filename);
  try {
    return fs.readFileSync(target, 'utf8');
  } catch {
    return null;
  }
}

export function getSkill(userId, id) {
  const row = findSkill(userId, id);
  if (!row) return null;
  return { ...row, content: readSkillContent(userId, row) ?? '' };
}

export function removeSkill(userId, id) {
  const row = deleteSkillRow(userId, id);
  if (!row) return null;
  const target = path.join(userSkillsDir(userId), row.filename);
  fs.rmSync(target, { force: true });
  return row;
}

/**
 * Descarga una skill desde una URL y la guarda.
 * Solo acepta contenido textual; nunca ejecuta el archivo descargado.
 */
export async function installSkillFromUrl(userId, url, { name } = {}) {
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    const error = new Error('URL inválida');
    error.status = 400;
    throw error;
  }
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    const error = new Error('Solo se permiten URLs http(s)');
    error.status = 400;
    throw error;
  }

  const response = await fetch(parsedUrl, {
    redirect: 'follow',
    headers: { accept: 'text/plain, text/markdown, application/json;q=0.8, */*;q=0.5' },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    const error = new Error(`No se pudo descargar la skill (HTTP ${response.status})`);
    error.status = 502;
    throw error;
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!/text\/|application\/json|application\/octet-stream|^\s*$/.test(contentType)) {
    const error = new Error(`El contenido no parece texto (content-type: ${contentType})`);
    error.status = 415;
    throw error;
  }

  const content = await response.text();
  if (content.length > 256 * 1024) {
    const error = new Error('La skill descargada es demasiado grande (máx. 256 KB)');
    error.status = 413;
    throw error;
  }

  const fromUrl = path.basename(parsedUrl.pathname).replace(/\.(md|markdown|json)$/i, '');
  const fallbackName = name ?? fromUrl ?? 'skill';
  return saveSkill(userId, {
    name: fallbackName,
    description: undefined,
    content,
    filename: path.basename(parsedUrl.pathname) || `${normalizeSkillName(fallbackName)}.md`,
    source: parsedUrl.toString(),
  });
}

export default {
  userSkillsDir,
  parseSkill,
  normalizeSkillName,
  saveSkill,
  listUserSkills,
  readSkillContent,
  getSkill,
  removeSkill,
  installSkillFromUrl,
};

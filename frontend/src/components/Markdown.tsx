'use client';

import { Fragment, type ReactNode } from 'react';

/**
 * Renderizador de Markdown ligero.
 *
 * A propósito NO usa LaTeX: los símbolos matemáticos se escriben en Unicode
 * (∑, ∫, √, ±, ≠, ∞, →, α, β, …) y se muestran con la pila de fuentes
 * matemáticas definida en globals.css (`.message-body` → `--font-math`).
 *
 * Tampoco usa `dangerouslySetInnerHTML`: todo se construye como elementos React,
 * así que el contenido del modelo no puede inyectar HTML.
 */

type Inline = ReactNode;

const INLINE_SOURCE =
  /(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*\n]+\*)|(_[^_\n]+_)|(~~[^~]+~~)|(\[[^\]]+\]\([^)\s]+\))|(https?:\/\/[^\s<>"')]+)/g;

function renderInline(text: string, keyPrefix: string): Inline[] {
  const nodes: Inline[] = [];
  let lastIndex = 0;
  // Regex nueva por llamada: `renderInline` es recursiva y compartir el objeto
  // con estado (`lastIndex`) corrompería el bucle externo.
  const pattern = new RegExp(INLINE_SOURCE.source, 'g');
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${match.index}`;

    if (token.startsWith('`')) {
      nodes.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith('**') || token.startsWith('__')) {
      nodes.push(<strong key={key}>{renderInline(token.slice(2, -2), key)}</strong>);
    } else if (token.startsWith('~~')) {
      nodes.push(<del key={key}>{renderInline(token.slice(2, -2), key)}</del>);
    } else if (token.startsWith('*') || token.startsWith('_')) {
      nodes.push(<em key={key}>{renderInline(token.slice(1, -1), key)}</em>);
    } else if (token.startsWith('[')) {
      const closing = token.indexOf('](');
      const label = token.slice(1, closing);
      const href = token.slice(closing + 2, -1);
      nodes.push(
        <a key={key} href={href} target="_blank" rel="noreferrer noopener">
          {renderInline(label, key)}
        </a>,
      );
    } else {
      nodes.push(
        <a key={key} href={token} target="_blank" rel="noreferrer noopener">
          {token}
        </a>,
      );
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

function renderTable(lines: string[], key: string): ReactNode {
  const rows = lines.map((line) =>
    line
      .trim()
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((cell) => cell.trim()),
  );
  const [header, , ...body] = rows;
  return (
    <div key={key} className="overflow-x-auto">
      <table>
        <thead>
          <tr>
            {header.map((cell, index) => (
              <th key={index}>{renderInline(cell, `${key}-h-${index}`)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}>{renderInline(cell, `${key}-${rowIndex}-${cellIndex}`)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderBlocks(source: string): ReactNode[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const out: ReactNode[] = [];
  let index = 0;
  let key = 0;

  while (index < lines.length) {
    const line = lines[index];

    // Bloque de código
    const fence = /^\s*```(\w*)\s*$/.exec(line);
    if (fence) {
      const language = fence[1];
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) {
        body.push(lines[index]);
        index += 1;
      }
      index += 1;
      out.push(
        <pre key={`code-${key++}`} className="overflow-x-auto rounded-xl bg-surface-3 p-3 text-sm">
          {language ? (
            <div className="mb-1 font-sans text-[0.7rem] uppercase tracking-wide text-muted">{language}</div>
          ) : null}
          <code>{body.join('\n')}</code>
        </pre>,
      );
      continue;
    }

    // Línea horizontal
    if (/^\s*([-*_])\s*\1\s*\1[\s\S]*$/.test(line) && line.trim().length >= 3) {
      out.push(<hr key={`hr-${key++}`} />);
      index += 1;
      continue;
    }

    // Encabezados
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = Math.min(heading[1].length, 4);
      const Tag = (['h1', 'h2', 'h3', 'h4'][level - 1] ?? 'h4') as 'h1';
      out.push(<Tag key={`h-${key++}`}>{renderInline(heading[2], `h-${key}`)}</Tag>);
      index += 1;
      continue;
    }

    // Cita
    if (/^\s*>\s?/.test(line)) {
      const body: string[] = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        body.push(lines[index].replace(/^\s*>\s?/, ''));
        index += 1;
      }
      out.push(<blockquote key={`quote-${key++}`}>{renderBlocks(body.join('\n'))}</blockquote>);
      continue;
    }

    // Tabla
    if (/\|/.test(line) && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[index + 1] ?? '')) {
      const body: string[] = [];
      while (index < lines.length && lines[index].includes('|')) {
        body.push(lines[index]);
        index += 1;
      }
      out.push(renderTable(body, `table-${key++}`));
      continue;
    }

    // Listas
    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
    const ordered = /^\s*(\d+)[.)]\s+(.*)$/.exec(line);
    if (bullet || ordered) {
      const isOrdered = Boolean(ordered);
      const items: string[] = [];
      while (index < lines.length) {
        const current = lines[index];
        const match = isOrdered ? /^\s*\d+[.)]\s+(.*)$/.exec(current) : /^\s*[-*+]\s+(.*)$/.exec(current);
        if (!match) break;
        items.push(match[1]);
        index += 1;
      }
      const children = items.map((item, itemIndex) => (
        <li key={itemIndex}>{renderInline(item, `li-${key}-${itemIndex}`)}</li>
      ));
      out.push(isOrdered ? <ol key={`ol-${key++}`}>{children}</ol> : <ul key={`ul-${key++}`}>{children}</ul>);
      continue;
    }

    // Línea vacía
    if (!line.trim()) {
      index += 1;
      continue;
    }

    // Párrafo
    const paragraph: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^\s*(```|#{1,6}\s|>|[-*+]\s|\d+[.)]\s)/.test(lines[index])
    ) {
      paragraph.push(lines[index]);
      index += 1;
    }
    out.push(<p key={`p-${key++}`}>{renderInline(paragraph.join('\n'), `p-${key}`)}</p>);
  }

  return out;
}

export function Markdown({ children }: { children: string }) {
  return <Fragment>{renderBlocks(children ?? '')}</Fragment>;
}

export default Markdown;

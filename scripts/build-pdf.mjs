#!/usr/bin/env node
/**
 * Сборка PDF из markdown: свой разбор + печать через Chromium из Playwright.
 *
 * Почему не pandoc и не marked. `CLAUDE.md` разрешает библиотеки только
 * из `docs/TOOLING.md`, раздел 1, и не разрешает добавлять сверх списка —
 * правило написано для продукта, но обходить его ради сборки документа
 * значит начать с исключения. Chromium уже стоит вместе с Playwright,
 * печать в PDF у него встроенная, разбор нужного подмножества markdown —
 * полторы сотни строк. Ноль новых зависимостей.
 *
 * Подмножество намеренно узкое: заголовки, абзацы, списки, таблицы GFM,
 * блоки кода, цитаты, горизонтальные линии и строчная разметка. Всё, что
 * есть в наших документах, и ничего сверх. Если markdown усложнится,
 * честнее расширить это место, чем молча получить кривой PDF.
 *
 * Запуск: node scripts/build-pdf.mjs REPORT.md docs/REPORT.pdf "Заголовок"
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { chromium } from 'playwright';

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Текст без разметки — для оглавления: там жирное и кавычки только мусорят. */
const plain = (text) =>
  text
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

const slug = (text) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '');

/** Строчная разметка. Код — первым, чтобы внутри него ничего не разбиралось. */
const inline = (src) => {
  const codes = [];
  let text = src.replace(/`([^`]+)`/g, (_, code) => {
    codes.push(code);
    // Метка-заглушка вместо кода: печатаемая, чтобы не тащить управляющие
    // символы в регулярные выражения и в вывод.
    return `@@code${codes.length - 1}@@`;
  });

  text = escapeHtml(text);
  text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src2) => {
    const local = src2.startsWith('http') ? src2 : src2;
    return `<img src="${local}" alt="${alt}">`;
  });
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  text = text.replace(/~~([^~]+)~~/g, '<del>$1</del>');

  return text.replace(/@@code(\d+)@@/g, (_, i) => `<code>${escapeHtml(codes[Number(i)])}</code>`);
};

const splitRow = (line) =>
  line
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((cell) => cell.trim());

/** Markdown → HTML. Возвращает тело документа и собранное оглавление. */
const render = (markdown) => {
  const lines = markdown.split('\n');
  const out = [];
  const toc = [];
  let i = 0;

  const closeList = (stack) => {
    while (stack.length) out.push(`</${stack.pop()}>`);
  };
  const listStack = [];

  while (i < lines.length) {
    const line = lines[i];

    // Блок кода.
    if (/^```/.test(line)) {
      closeList(listStack);
      const body = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) body.push(lines[i++]);
      i++;
      out.push(`<pre><code>${escapeHtml(body.join('\n'))}</code></pre>`);
      continue;
    }

    // Фронтматтер выкидываем: он для генератора, не для читателя.
    if (i === 0 && line.trim() === '---') {
      i++;
      while (i < lines.length && lines[i].trim() !== '---') i++;
      i++;
      continue;
    }

    // Горизонтальная линия.
    if (/^---+\s*$/.test(line)) {
      closeList(listStack);
      out.push('<hr>');
      i++;
      continue;
    }

    // Заголовок.
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      closeList(listStack);
      const level = heading[1].length;
      const text = heading[2].trim();
      const id = slug(text);
      // Первый заголовок первого уровня — это название документа, оно уже
      // стоит на обложке. Второй раз подряд читать его незачем.
      if (level === 1 && out.length === 0) {
        i++;
        continue;
      }
      if (level <= 2) toc.push({ level, text: plain(text), id });
      out.push(`<h${level} id="${id}">${inline(text)}</h${level}>`);
      i++;
      continue;
    }

    // Таблица GFM: строка с | и следующая — разделитель.
    if (line.includes('|') && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1] ?? '')) {
      closeList(listStack);
      const header = splitRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
        rows.push(splitRow(lines[i]));
        i++;
      }
      const head = header.map((c) => `<th>${inline(c)}</th>`).join('');
      const body = rows
        .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
        .join('');
      out.push(
        `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`,
      );
      continue;
    }

    // Цитата.
    if (/^>\s?/.test(line)) {
      closeList(listStack);
      const body = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) body.push(lines[i++].replace(/^>\s?/, ''));
      out.push(`<blockquote>${inline(body.join(' '))}</blockquote>`);
      continue;
    }

    // Списки.
    const bullet = line.match(/^(\s*)[-*]\s+(.*)$/);
    const numbered = line.match(/^(\s*)\d+\.\s+(.*)$/);
    if (bullet || numbered) {
      const tag = bullet ? 'ul' : 'ol';
      if (listStack[listStack.length - 1] !== tag) {
        closeList(listStack);
        listStack.push(tag);
        out.push(`<${tag}>`);
      }
      const text = (bullet ?? numbered)[2];
      // Продолжение пункта на следующих строках с отступом.
      const parts = [text];
      i++;
      while (
        i < lines.length &&
        /^\s{2,}\S/.test(lines[i]) &&
        !/^\s*[-*]\s|^\s*\d+\.\s/.test(lines[i])
      ) {
        parts.push(lines[i].trim());
        i++;
      }
      out.push(`<li>${inline(parts.join(' '))}</li>`);
      continue;
    }

    // Пустая строка закрывает список.
    if (line.trim() === '') {
      closeList(listStack);
      i++;
      continue;
    }

    // Абзац: собираем до пустой строки.
    closeList(listStack);
    const paragraph = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^(#{1,4}\s|```|>\s?|---+\s*$)/.test(lines[i]) &&
      !/^\s*([-*]\s|\d+\.\s)/.test(lines[i])
    ) {
      paragraph.push(lines[i].trim());
      i++;
    }
    if (paragraph.length) out.push(`<p>${inline(paragraph.join(' '))}</p>`);
  }

  closeList(listStack);
  return { body: out.join('\n'), toc };
};

const css = `
  :root {
    --ink: #14181f;
    --pencil: #4a5568;
    --line: #d7dde5;
    --well: #f4f6f9;
    --accent: #1d4ed8;
  }
  @page { size: A4; margin: 18mm 16mm 20mm; }
  @page :first { margin: 0; }
  * { box-sizing: border-box; }
  body {
    font: 10.5pt/1.55 'Golos Text', 'Helvetica Neue', Arial, sans-serif;
    color: var(--ink);
    margin: 0;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .cover {
    height: 297mm; padding: 45mm 25mm 25mm;
    display: flex; flex-direction: column; justify-content: space-between;
    border-top: 10mm solid var(--accent);
    page-break-after: always;
  }
  .cover h1 { font-size: 30pt; line-height: 1.15; margin: 0 0 6mm; letter-spacing: -0.01em; }
  .cover .subtitle { font-size: 13pt; color: var(--pencil); margin: 0; max-width: 120mm; }
  .cover .meta { font-size: 10pt; color: var(--pencil); }
  .cover .meta div { margin-top: 2mm; }
  .cover .meta strong { color: var(--ink); font-weight: 600; }

  nav.toc { page-break-after: always; }
  nav.toc h2 { margin-top: 0; }
  nav.toc ol { list-style: none; padding: 0; margin: 0; counter-reset: section; }
  nav.toc li { border-bottom: 1px dotted var(--line); padding: 2.2mm 0; }
  nav.toc li.level-2 { padding-left: 8mm; font-size: 9.5pt; color: var(--pencil); }
  nav.toc a { color: inherit; text-decoration: none; }

  h1, h2, h3, h4 { line-height: 1.25; page-break-after: avoid; }
  h1 { font-size: 19pt; margin: 10mm 0 4mm; padding-bottom: 2mm; border-bottom: 2px solid var(--accent); }
  h2 { font-size: 14pt; margin: 8mm 0 3mm; }
  h3 { font-size: 11.5pt; margin: 6mm 0 2mm; color: var(--accent); }
  h4 { font-size: 10.5pt; margin: 5mm 0 2mm; }
  p { margin: 0 0 3mm; orphans: 2; widows: 2; }
  a { color: var(--accent); text-decoration: none; }
  strong { font-weight: 600; }
  hr { border: 0; border-top: 1px solid var(--line); margin: 6mm 0; }

  ul, ol { margin: 0 0 3mm; padding-left: 6mm; }
  li { margin-bottom: 1.5mm; }

  blockquote {
    margin: 0 0 4mm; padding: 2.5mm 4mm;
    border-left: 3px solid var(--accent); background: var(--well);
    color: var(--pencil);
  }

  code {
    font-family: 'IBM Plex Mono', ui-monospace, Menlo, monospace;
    font-size: 0.88em; background: var(--well); padding: 0.4mm 1mm; border-radius: 1mm;
  }
  pre {
    background: var(--well); border: 1px solid var(--line); border-radius: 1.5mm;
    padding: 3mm; overflow-x: auto; margin: 0 0 4mm; page-break-inside: avoid;
  }
  pre code { background: none; padding: 0; font-size: 8.5pt; line-height: 1.45; }

  .table-wrap { margin: 0 0 4mm; }
  table { width: 100%; border-collapse: collapse; font-size: 9pt; page-break-inside: auto; }
  th, td { border: 1px solid var(--line); padding: 1.8mm 2.2mm; text-align: left; vertical-align: top; }
  th { background: var(--well); font-weight: 600; }
  tr { page-break-inside: avoid; }

  img { max-width: 100%; }
`;

const [, , sourcePath, outPath, titleArg, subtitleArg] = process.argv;
if (!sourcePath || !outPath) {
  console.error(
    'Использование: node scripts/build-pdf.mjs <in.md> <out.pdf> [заголовок] [подзаголовок]',
  );
  process.exit(1);
}

const markdown = readFileSync(sourcePath, 'utf8');
const { body, toc } = render(markdown);
const title = titleArg ?? basename(sourcePath);
const subtitle = subtitleArg ?? '';
const today = new Date().toLocaleDateString('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const html = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>${css}</style></head>
<body>
  <section class="cover">
    <div>
      <h1>${escapeHtml(title)}</h1>
      <p class="subtitle">${escapeHtml(subtitle)}</p>
    </div>
    <div class="meta">
      <div><strong>Проект:</strong> Prostor — бесконечная доска для диаграмм, заметок и изображений</div>
      <div><strong>Авторы:</strong> roman_restov (движок холста), alfis (оболочка)</div>
      <div><strong>Собрано:</strong> ${today}</div>
      <div><strong>Репозиторий:</strong> github.com/Ganeeral/prostor</div>
    </div>
  </section>

  <nav class="toc">
    <h2>Содержание</h2>
    <ol>
      ${toc.map((item) => `<li class="level-${item.level}"><a href="#${item.id}">${escapeHtml(item.text)}</a></li>`).join('\n      ')}
    </ol>
  </nav>

  ${body}
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html, { waitUntil: 'networkidle' });
await page.pdf({
  path: outPath,
  format: 'A4',
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: '<div></div>',
  footerTemplate: `
    <div style="width:100%; font-size:8pt; color:#4a5568; padding:0 16mm;
                font-family:Helvetica,Arial,sans-serif; display:flex; justify-content:space-between;">
      <span>${escapeHtml(title)}</span>
      <span class="pageNumber"></span>
    </div>`,
  margin: { top: '18mm', bottom: '20mm', left: '16mm', right: '16mm' },
});
await browser.close();

// Отладочный HTML рядом — по нему видно, что именно ушло в печать.
writeFileSync(`${outPath.replace(/\.pdf$/, '')}.debug.html`, html);
console.log(`Собрано: ${outPath} (разделов в оглавлении: ${toc.length})`);

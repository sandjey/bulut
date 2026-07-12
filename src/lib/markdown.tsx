"use client";

import { useMemo } from "react";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

/** Инлайн-форматирование одной строки (уже экранированной). */
function inline(s: string): string {
  // `код` — первым, чтобы внутри не форматировалось
  s = s.replace(/`([^`]+)`/g, '<code class="rounded bg-surface-2 px-1 py-0.5 text-[0.85em]">$1</code>');
  // **жирный**
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // *курсив* / _курсив_
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  s = s.replace(/(^|[^_])_([^_\n]+)_/g, "$1<em>$2</em>");
  // [текст](ссылка)
  s = s.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-brand underline">$1</a>',
  );
  // «голые» ссылки
  s = s.replace(
    /(^|[\s(])(https?:\/\/[^\s<]+)/g,
    '$1<a href="$2" target="_blank" rel="noopener noreferrer" class="text-brand underline">$2</a>',
  );
  // @упоминания
  s = s.replace(/@([^\s,@]+)/g, '<span class="rounded bg-brand/10 px-1 font-medium text-brand">@$1</span>');
  return s;
}

/** Мини-Markdown → безопасный HTML. Поддержка: **жирный**, *курсив*, `код`, ссылки, списки, переносы. */
export function mdToHtml(src: string): string {
  const lines = escapeHtml(src ?? "").split("\n");
  const out: string[] = [];
  let inList = false;
  for (const raw of lines) {
    const line = raw;
    const li = line.match(/^\s*[-*]\s+(.*)$/);
    if (li) {
      if (!inList) {
        out.push('<ul class="my-1 ml-4 list-disc space-y-0.5">');
        inList = true;
      }
      out.push(`<li>${inline(li[1])}</li>`);
    } else {
      if (inList) {
        out.push("</ul>");
        inList = false;
      }
      if (line.trim() === "") out.push("<br>");
      else out.push(`<div>${inline(line)}</div>`);
    }
  }
  if (inList) out.push("</ul>");
  return out.join("");
}

/** Отрисовка текста как Markdown (описания, комментарии). */
export function Markdown({ text, className }: { text: string; className?: string }) {
  const html = useMemo(() => mdToHtml(text), [text]);
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

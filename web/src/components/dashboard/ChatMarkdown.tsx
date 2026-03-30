'use client';

// ============================================================================
// ChatMarkdown — Lightweight markdown renderer for chat messages.
// Zero external dependencies — handles bold, italic, code, links, lists.
// ============================================================================

import { type ReactNode } from 'react';

interface ChatMarkdownProps {
  content: string;
  className?: string;
}

/** Parse inline markdown (bold, italic, code, links) into React nodes. */
function parseInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Pattern matches: **bold**, *italic*, `code`, [text](url)
  const regex = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`(.+?)`)|(\[(.+?)\]\((.+?)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Text before the match
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    if (match[1]) {
      // **bold**
      nodes.push(
        <strong key={match.index} className="font-semibold text-white">
          {match[2]}
        </strong>,
      );
    } else if (match[3]) {
      // *italic*
      nodes.push(
        <em key={match.index} className="italic text-white/80">
          {match[4]}
        </em>,
      );
    } else if (match[5]) {
      // `inline code`
      nodes.push(
        <code
          key={match.index}
          className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[0.85em] text-cyan"
        >
          {match[6]}
        </code>,
      );
    } else if (match[7]) {
      // [text](url)
      nodes.push(
        <a
          key={match.index}
          href={match[9]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-cyan underline decoration-cyan/30 underline-offset-2 transition-colors hover:decoration-cyan/60"
        >
          {match[8]}
        </a>,
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // Remaining text after last match
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : [text];
}

/** Parse a single block of text (not inside a code fence). */
function parseBlock(block: string, blockIndex: number): ReactNode {
  const lines = block.split('\n');
  const elements: ReactNode[] = [];
  let listItems: ReactNode[] = [];
  let listType: 'ul' | 'ol' | null = null;

  function flushList() {
    if (listItems.length > 0 && listType) {
      const Tag = listType;
      elements.push(
        <Tag
          key={`list-${elements.length}`}
          className={
            listType === 'ul'
              ? 'list-disc list-inside space-y-1 text-white/80'
              : 'list-decimal list-inside space-y-1 text-white/80'
          }
        >
          {listItems}
        </Tag>,
      );
      listItems = [];
      listType = null;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();

    // Empty line → flush list, add break
    if (!trimmed) {
      flushList();
      continue;
    }

    // Heading: # ## ###
    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      flushList();
      const level = headingMatch[1]!.length;
      const text = headingMatch[2]!;
      const classes =
        level === 1
          ? 'text-base font-bold text-white mt-3 mb-1'
          : level === 2
            ? 'text-sm font-bold text-white mt-2 mb-1'
            : 'text-sm font-semibold text-white/90 mt-2 mb-0.5';
      elements.push(
        <p key={`h-${i}`} className={classes}>
          {parseInline(text)}
        </p>,
      );
      continue;
    }

    // Blockquote: > text
    if (trimmed.startsWith('> ')) {
      flushList();
      elements.push(
        <blockquote
          key={`bq-${i}`}
          className="border-l-2 border-cyan/30 pl-3 text-white/60 italic my-1"
        >
          {parseInline(trimmed.slice(2))}
        </blockquote>,
      );
      continue;
    }

    // Unordered list: - item or * item
    const ulMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (ulMatch) {
      if (listType !== 'ul') flushList();
      listType = 'ul';
      listItems.push(<li key={`li-${i}`}>{parseInline(ulMatch[1]!)}</li>);
      continue;
    }

    // Ordered list: 1. item
    const olMatch = trimmed.match(/^\d+\.\s+(.+)$/);
    if (olMatch) {
      if (listType !== 'ol') flushList();
      listType = 'ol';
      listItems.push(<li key={`li-${i}`}>{parseInline(olMatch[1]!)}</li>);
      continue;
    }

    // Horizontal rule: --- or ***
    if (/^[-*]{3,}$/.test(trimmed)) {
      flushList();
      elements.push(
        <hr key={`hr-${i}`} className="border-white/10 my-2" />,
      );
      continue;
    }

    // Regular paragraph line
    flushList();
    elements.push(
      <p key={`p-${i}`} className="text-white/90 leading-relaxed">
        {parseInline(trimmed)}
      </p>,
    );
  }

  flushList();

  return (
    <div key={`block-${blockIndex}`} className="space-y-1.5">
      {elements}
    </div>
  );
}

export function ChatMarkdown({ content, className }: ChatMarkdownProps) {
  // Split by code fences: ```lang\ncode\n```
  const parts = content.split(/(```[\s\S]*?```)/g);

  const rendered = parts.map((part, i) => {
    // Code block
    if (part.startsWith('```') && part.endsWith('```')) {
      const inner = part.slice(3, -3);
      const newlineIndex = inner.indexOf('\n');
      const lang = newlineIndex > 0 ? inner.slice(0, newlineIndex).trim() : '';
      const code = newlineIndex > 0 ? inner.slice(newlineIndex + 1) : inner;

      return (
        <div key={`code-${i}`} className="group relative my-2">
          {lang && (
            <div className="absolute top-0 right-0 rounded-bl-lg rounded-tr-lg bg-white/5 px-2 py-0.5 font-mono text-[10px] text-white/30">
              {lang}
            </div>
          )}
          <pre className="overflow-x-auto rounded-lg bg-black/40 border border-white/5 p-3 text-[0.85em] leading-relaxed">
            <code className="font-mono text-cyan/90">{code.trim()}</code>
          </pre>
        </div>
      );
    }

    // Regular text block
    return parseBlock(part, i);
  });

  return <div className={className}>{rendered}</div>;
}

/**
 * CitationLinks — extracts and renders citation markers from LLM responses.
 *
 * Supports formats:
 * - [1] https://example.com — numbered refs at end of message
 * - [Source: title](url) — inline markdown links
 * - 【source†text】 — OpenAI-style citations
 * - Tool results with URLs from web search tools
 */
import { useMemo } from 'react';

interface Citation {
  index: number;
  url: string;
  title: string;
  domain: string;
}

interface Props {
  content: string;
  toolResults?: Array<{ name: string; result?: string }>;
}

const URL_REGEX = /https?:\/\/[^\s\])"'<>]+/g;
const NUMBERED_REF_REGEX = /\[(\d+)\]\s*(https?:\/\/[^\s]+)/g;
const OPENAI_CITATION_REGEX = /\u3010([^†]+)†([^\u3011]+)\u3011/g;

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url.slice(0, 30);
  }
}

function extractCitations(content: string, toolResults?: Props['toolResults']): Citation[] {
  const seen = new Set<string>();
  const citations: Citation[] = [];

  // 1. Numbered references [1] https://...
  let match;
  while ((match = NUMBERED_REF_REGEX.exec(content)) !== null) {
    const url = match[2].replace(/[.,;:!?)]+$/, '');
    if (!seen.has(url)) {
      seen.add(url);
      citations.push({
        index: citations.length + 1,
        url,
        title: `Source ${match[1]}`,
        domain: extractDomain(url),
      });
    }
  }

  // 2. OpenAI-style 【source†text】
  while ((match = OPENAI_CITATION_REGEX.exec(content)) !== null) {
    const title = match[1].trim();
    const text = match[2].trim();
    // Try to find URL near citation
    const urlMatch = text.match(URL_REGEX);
    if (urlMatch && !seen.has(urlMatch[0])) {
      seen.add(urlMatch[0]);
      citations.push({
        index: citations.length + 1,
        url: urlMatch[0],
        title,
        domain: extractDomain(urlMatch[0]),
      });
    }
  }

  // 3. URLs from web search tool results
  if (toolResults) {
    for (const tool of toolResults) {
      if (!tool.result || !tool.name.toLowerCase().includes('search')) continue;
      const urls = tool.result.match(URL_REGEX) ?? [];
      for (const url of urls.slice(0, 5)) {
        const cleaned = url.replace(/[.,;:!?)]+$/, '');
        if (!seen.has(cleaned) && !cleaned.includes('localhost') && !cleaned.includes('127.0.0.1')) {
          seen.add(cleaned);
          citations.push({
            index: citations.length + 1,
            url: cleaned,
            title: extractDomain(cleaned),
            domain: extractDomain(cleaned),
          });
        }
      }
    }
  }

  return citations;
}

export function CitationLinks({ content, toolResults }: Props) {
  const citations = useMemo(() => extractCitations(content, toolResults), [content, toolResults]);

  if (citations.length === 0) return null;

  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 8,
      paddingTop: 8,
      borderTop: '1px solid var(--c-border, rgba(255,255,255,0.08))',
    }}>
      <span style={{ fontSize: 11, color: 'var(--c-text-3)', width: '100%', marginBottom: 2 }}>
        Sources
      </span>
      {citations.map((c) => (
        <a
          key={c.url}
          href={c.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '4px 10px',
            borderRadius: 6,
            background: 'var(--c-bg-3, rgba(255,255,255,0.06))',
            color: 'var(--c-accent, #6366f1)',
            fontSize: 12,
            textDecoration: 'none',
            border: '1px solid var(--c-border, rgba(255,255,255,0.08))',
            transition: 'background 0.15s',
            maxWidth: 220,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={c.url}
        >
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--c-text-3)', flexShrink: 0 }}>
            {c.index}
          </span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.domain}</span>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, opacity: 0.5 }}>
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </a>
      ))}
    </div>
  );
}

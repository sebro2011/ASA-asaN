/**
 * Assistant message rendering (Phase 3D-1).
 *
 * Markdown + GFM + syntax highlighting, rendered to React elements. Raw HTML is
 * never enabled (no `rehype-raw`), so a reply cannot inject markup; links are
 * forced to open in a new tab with `noopener`.
 */
import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

function safeHref(href: string | undefined): string | undefined {
  if (!href) return undefined;
  try {
    const url = new URL(href, window.location.origin);
    return ALLOWED_PROTOCOLS.has(url.protocol) ? href : undefined;
  } catch {
    return undefined;
  }
}

function MessageBody({ content }: { content: string }) {
  return (
    <div className="nova-prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: false, ignoreMissing: true }]]}
        components={{
          a({ href, children, ...props }) {
            const safe = safeHref(href);
            if (!safe) return <span>{children}</span>;
            return (
              <a {...props} href={safe} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            );
          },
          // Images from a model reply are links, not embedded resources.
          img({ src, alt }) {
            const safe = safeHref(src);
            if (!safe) return null;
            return (
              <a href={safe} target="_blank" rel="noopener noreferrer">
                {alt || safe}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export default memo(MessageBody);

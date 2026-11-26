import type { ChatCitation } from './chatClient';

export interface CitedChatSource {
  /** The original evidence-list index used by the answer's [Source N] marker. */
  number: number;
  source: ChatCitation;
}

const MARKDOWN_LABEL_PUNCTUATION = new Set(['\\', '`', '*', '_', '{', '}', '[', ']', '(', ')', '#', '+', '-', '.', '!', '|', '>', '~']);

function escapeMarkdownLabel(value: string): string {
  return [...value.replace(/\s+/g, ' ').trim()]
    .map((character) => MARKDOWN_LABEL_PUNCTUATION.has(character) ? `\\${character}` : character)
    .join('');
}

/** Keep each saved source's original index; filtering must never renumber citations. */
export function citedSources(content: string, sources: ChatCitation[]): CitedChatSource[] {
  const cited = new Set(
    [...content.matchAll(/\[Source\s+(\d+)\]/gi)].map((match) => Number(match[1])).filter(Number.isInteger),
  );
  return sources.flatMap((source, index) =>
    cited.has(index + 1) ? [{ number: index + 1, source }] : [],
  );
}

/** Append only cited source references using their original answer-visible number. */
export function withCitationReferences(
  content: string,
  sources: CitedChatSource[],
  labels: { heading: string; device: string; private: string },
): string {
  if (!sources.length) return content;
  const newline = String.fromCharCode(10);
  const references = sources.map(({ number, source }) => {
    const location = source.source === 'device-library' ? labels.device : labels.private;
    return `- **[Source ${number}]** ${escapeMarkdownLabel(source.title)} — ${location}`;
  });
  return `${content.trim()}${newline}${newline}**${labels.heading}**${newline}${references.join(newline)}`;
}

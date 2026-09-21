import { ReactNode } from "react";

// Minimal inline markup an author can add from the editor's bold/link
// buttons: **bold** and [label](url). Intentionally small — no italics,
// lists, etc. — since that's all the toolbar exposes.
const RICH_TEXT_REGEX = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*/g;

export function renderRichText(text: string): ReactNode {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;
  RICH_TEXT_REGEX.lastIndex = 0;
  while ((match = RICH_TEXT_REGEX.exec(text))) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    if (match[1] !== undefined) {
      nodes.push(
        <a key={key++} href={match[2]} target="_blank" rel="noreferrer" className="underline">
          {match[1]}
        </a>
      );
    } else if (match[3] !== undefined) {
      nodes.push(<strong key={key++}>{match[3]}</strong>);
    }
    lastIndex = RICH_TEXT_REGEX.lastIndex;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

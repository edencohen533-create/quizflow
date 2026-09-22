import { safeLink } from "@/lib/safe-content";
import { ReactNode } from "react";

// Authors commonly type a question as "...word ?" (space before the mark).
// When that line is close to the bubble's width, the browser can wrap right
// at that space and strand the "?" alone on its own line. Swapping the last
// such space for a non-breaking one keeps it glued to the preceding word,
// per line (so a manually multi-line message still wraps normally between
// its own lines).
function glueTrailingPunctuation(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/ +([?!:])\s*$/, " $1"))
    .join("\n");
}

// Minimal inline markup an author can add from the editor's bold/link
// buttons: **bold** and [label](url). Intentionally small — no italics,
// lists, etc. — since that's all the toolbar exposes.
const RICH_TEXT_REGEX = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*/g;

export function renderRichText(rawText: string): ReactNode {
  const text = glueTrailingPunctuation(rawText);
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;
  RICH_TEXT_REGEX.lastIndex = 0;
  while ((match = RICH_TEXT_REGEX.exec(text))) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    if (match[1] !== undefined) {
      nodes.push(
        <a key={key++} href={safeLink(match[2])} target="_blank" rel="noopener noreferrer" className="underline">
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

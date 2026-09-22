import { QuizTheme } from "./types";

// Assistant is the app's own default and is loaded globally via next/font
// in layout.tsx. The other options are only ever needed by a quiz that
// actually picked them, so they're loaded on demand (a plain Google Fonts
// stylesheet link, added only where that quiz is rendered) instead of
// shipping every weight of every font to every page load.
export const GOOGLE_FONT_STYLESHEET: Partial<Record<QuizTheme["fontFamily"], string>> = {
  heebo: "https://fonts.googleapis.com/css2?family=Heebo:wght@400;600;700&display=swap",
  nunito: "https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700&display=swap",
};

export const FONT_FAMILY_CSS: Record<QuizTheme["fontFamily"], string> = {
  assistant: "var(--font-assistant)",
  heebo: "'Heebo', sans-serif",
  nunito: "'Nunito', sans-serif",
};

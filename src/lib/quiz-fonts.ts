import { QuizTheme } from "./types";

// Assistant is loaded globally through next/font. Load the other families
// only for quizzes that select them, including the runtime's medium weight.
export const GOOGLE_FONT_STYLESHEET: Partial<Record<QuizTheme["fontFamily"], string>> = {
  heebo: "https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700&display=swap",
  nunito: "https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700&display=swap",
};

export const FONT_FAMILY_CSS: Record<QuizTheme["fontFamily"], string> = {
  assistant: "var(--font-assistant)",
  heebo: "'Heebo', sans-serif",
  nunito: "'Nunito', sans-serif",
};

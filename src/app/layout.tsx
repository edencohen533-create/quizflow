import type { Metadata } from "next";
import { Assistant, Heebo, Nunito } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const assistant = Assistant({
  variable: "--font-assistant",
  subsets: ["hebrew", "latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

// Loaded alongside the default Assistant font so a quiz can pick its own
// font in the design tab (see buildPalette()'s fontFamily → CSS variable
// mapping in quiz-runner.tsx) without a per-request dynamic font load.
const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["hebrew", "latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "QuizFlow",
  description: "בניית שאלונים אינטראקטיביים ליצירת לידים",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={`${assistant.variable} ${heebo.variable} ${nunito.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        {children}
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}

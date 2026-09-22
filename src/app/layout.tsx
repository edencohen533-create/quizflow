import type { Metadata } from "next";
import { Assistant } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const assistant = Assistant({
  variable: "--font-assistant",
  subsets: ["hebrew", "latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "QuizFlow",
  description: "בניית שאלונים אינטראקטיביים ליצירת לידים",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={`${assistant.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        {children}
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}

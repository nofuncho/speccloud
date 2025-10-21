import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SpecCloud",
  description: "Your personal spec OS — folders + AI.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-zinc-50 text-zinc-900 antialiased font-sans">{children}</body>
    </html>
  );
}

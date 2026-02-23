import type { Metadata } from "next";
import { Space_Mono } from "next/font/google";
import "./globals.css";

const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "acta",
  description: "AI-powered video stutter detection and cutting",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${spaceMono.variable} antialiased bg-[var(--retro-beige)] text-[var(--retro-text-dark)] min-h-screen`}
        style={{ fontFamily: "var(--font-space-mono), 'Space Mono', monospace" }}
      >
        {children}
      </body>
    </html>
  );
}

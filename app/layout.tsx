import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { UsageMeter } from "@/components/usage-meter";

export const metadata: Metadata = {
  title: "Competitor Brief",
  description:
    "Paste a raw product idea and get a verified competitor brief: scored competitors, screenshots, design patterns and opportunities.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <header
          data-print="hide"
          className="border-b border-stone-200 bg-white"
        >
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
            <Link href="/" className="text-sm font-semibold tracking-tight">
              Competitor Brief
            </Link>
            <nav className="flex items-center gap-4 text-sm text-stone-600">
              <Link href="/" className="hover:text-stone-900">
                New idea
              </Link>
              <Link href="/history" className="hover:text-stone-900">
                History
              </Link>
            </nav>
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>

        <footer
          data-print="hide"
          className="mt-10 border-t border-stone-200 bg-white"
        >
          <div className="mx-auto max-w-5xl px-6 py-6">
            <UsageMeter />
          </div>
        </footer>
      </body>
    </html>
  );
}

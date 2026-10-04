import type { Metadata, Viewport } from 'next';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Friends',
  description: 'A safe, private community.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

// Every page renders per request: the CSP nonce from src/proxy.ts only reaches dynamically
// rendered HTML. A prerendered page would ship nonce-less scripts that the CSP blocks.
export default async function RootLayout({ children }: { children: ReactNode }) {
  await connection();
  return (
    <html lang="en">
      <body className="min-h-dvh bg-white text-neutral-900 antialiased">{children}</body>
    </html>
  );
}

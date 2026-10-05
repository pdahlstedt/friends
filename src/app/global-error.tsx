'use client';

import './globals.css';

// Last-resort error page when the root layout itself fails. Replaces the built-in one, which
// uses inline styles the CSP blocks (AC16). Shows no error details.
export default function GlobalError() {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-white text-neutral-900 antialiased">
        <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4 py-12">
          <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
          <p className="text-neutral-600">Please reload the page in a moment.</p>
        </main>
      </body>
    </html>
  );
}

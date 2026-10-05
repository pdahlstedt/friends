'use client';

import { PageShell } from '@/app/_components/form';

// Replaces the built-in error page, which uses inline styles the CSP blocks (AC16). Shows no
// error details: they can contain internal information.
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <PageShell title="Something went wrong">
      <p className="text-neutral-600">Please try again in a moment.</p>
      <button
        type="button"
        onClick={reset}
        className="w-full rounded-md bg-neutral-900 px-4 py-2 font-medium text-white hover:bg-neutral-700"
      >
        Try again
      </button>
    </PageShell>
  );
}

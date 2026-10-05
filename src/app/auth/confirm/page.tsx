import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PageShell } from '@/app/_components/form';
import { ConfirmForm } from './confirm-form';

export const metadata: Metadata = {
  title: 'Confirm your email · Friends',
  robots: { index: false, follow: false },
};

// GET only renders the button; nothing is verified until the user presses it (AC2 amended).
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string | string[] }>;
}) {
  const { token_hash: tokenHash } = await searchParams;
  if (typeof tokenHash !== 'string' || tokenHash === '') redirect('/auth/invalid-link');

  return (
    <PageShell title="Confirm your email">
      <p className="text-neutral-600">Press the button to confirm your email and sign in.</p>
      <ConfirmForm tokenHash={tokenHash} />
    </PageShell>
  );
}

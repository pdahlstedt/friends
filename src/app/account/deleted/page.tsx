import type { Metadata } from 'next';
import Link from 'next/link';
import { PageShell } from '@/app/_components/form';

export const metadata: Metadata = {
  title: 'Account deleted · Friends',
  robots: { index: false, follow: false },
};

// Spec 0002, AC2. Static: it says nothing about any particular account.
export default function AccountDeletedPage() {
  return (
    <PageShell title="Your account has been deleted">
      <p className="text-neutral-600">
        Your account, your email address and your profile are gone. You have been logged out.
      </p>
      <p className="text-sm text-neutral-600">
        <Link href="/" className="font-medium underline underline-offset-4">
          Go to the home page
        </Link>{' '}
        or{' '}
        <Link href="/signup" className="font-medium underline underline-offset-4">
          create a new account
        </Link>
        .
      </p>
    </PageShell>
  );
}

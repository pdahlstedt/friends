import type { Metadata } from 'next';
import { PageShell } from '@/app/_components/form';

export const metadata: Metadata = { title: 'Check your email · Friends' };

// The same page for new and existing emails (AC4): it never says whether an account exists.
export default function CheckEmailPage() {
  return (
    <PageShell title="Check your email">
      <p className="text-neutral-600">
        We have sent you a link to confirm your email address. Open it and press{' '}
        <strong>Confirm my email</strong> to finish creating your account.
      </p>
      <p className="text-sm text-neutral-600">
        No email? Check your spam folder, or wait a few minutes before trying again.
      </p>
    </PageShell>
  );
}

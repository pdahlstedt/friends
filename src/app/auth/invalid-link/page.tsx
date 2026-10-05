import type { Metadata } from 'next';
import { PageShell } from '@/app/_components/form';
import { ResendForm } from './resend-form';

export const metadata: Metadata = { title: 'Link invalid or expired · Friends' };

// One generic message for expired, used and tampered links (AC5).
export default function InvalidLinkPage() {
  return (
    <PageShell title="Link invalid or expired">
      <p className="text-neutral-600">
        This confirmation link is invalid or has expired. Enter your email and we will send you a
        new one.
      </p>
      <ResendForm />
    </PageShell>
  );
}

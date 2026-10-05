import type { Metadata } from 'next';
import Link from 'next/link';
import { PageShell } from '@/app/_components/form';
import { LogInForm } from './log-in-form';

export const metadata: Metadata = { title: 'Log in · Friends' };

export default function LogInPage() {
  return (
    <PageShell title="Log in">
      <LogInForm />
      <p className="text-sm text-neutral-600">
        New here?{' '}
        <Link href="/signup" className="font-medium underline underline-offset-4">
          Create an account
        </Link>
      </p>
    </PageShell>
  );
}

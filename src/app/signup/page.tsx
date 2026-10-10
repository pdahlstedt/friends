import type { Metadata } from 'next';
import { PageShell } from '@/app/_components/form';
import { SignUpForm } from './sign-up-form';

export const metadata: Metadata = { title: 'Create an account · Friends' };

export default function SignUpPage() {
  return (
    <PageShell title="Create an account">
      <p className="text-neutral-600">All you need is an email address and a password.</p>
      <SignUpForm />
    </PageShell>
  );
}

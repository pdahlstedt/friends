import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PageShell } from '@/app/_components/form';
import { requestServices } from '@/server/container';
import { DeleteAccountForm } from './delete-account-form';

export const metadata: Metadata = {
  title: 'Delete your account · Friends',
  robots: { index: false, follow: false },
};

// Spec 0002, AC1: explains what happens before anything does. GET only renders; deletion needs
// the password and a POST (AC2, AC10). Visitors without a session go to log in (AC8).
export default async function DeleteAccountPage() {
  const { users } = await requestServices();
  if (!(await users.getCurrentUser())) redirect('/login');

  return (
    <PageShell title="Delete your account">
      <section aria-label="What will be deleted" className="flex flex-col gap-3 text-neutral-700">
        <p>Deleting your account removes, immediately:</p>
        <ul className="list-disc pl-6">
          <li>your account and your email address</li>
          <li>your profile</li>
        </ul>
        <p>
          <strong>This cannot be undone.</strong> You can create a new account later, but nothing
          from this one will come back.
        </p>
      </section>
      <DeleteAccountForm />
    </PageShell>
  );
}

import type { Metadata } from 'next';
import { PageShell } from '@/app/_components/form';
import { LogOutButton } from '@/app/_components/log-out-button';

export const metadata: Metadata = { title: 'Log out · Friends' };

// GET only shows the button; logging out is a POST (server action).
export default function LogOutPage() {
  return (
    <PageShell title="Log out">
      <p className="text-neutral-600">Log out of Friends on this device?</p>
      <LogOutButton />
    </PageShell>
  );
}

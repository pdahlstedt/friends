import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PageShell } from '@/app/_components/form';
import { LogOutButton } from '@/app/_components/log-out-button';
import { requestServices } from '@/server/container';

export const metadata: Metadata = {
  title: 'Your profile · Friends',
  robots: { index: false, follow: false },
};

const memberSince = new Intl.DateTimeFormat('en', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

// The signed-in user's own profile (AC11). Identity comes only from the server-verified session
// (AC14); visitors without one are redirected before any profile is read (AC12).
export default async function MePage() {
  const { users, profiles } = await requestServices();
  const user = await users.getCurrentUser();
  if (!user) redirect('/login');

  const profile = await profiles.getOwnProfile(user.id);

  return (
    <PageShell title="Your profile">
      <section
        aria-label="Profile"
        className="flex flex-col gap-6 rounded-lg border border-neutral-200 p-6"
      >
        <div className="flex items-center gap-4">
          <div
            role="img"
            aria-label="No profile picture yet"
            className="flex size-16 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-2xl text-neutral-500"
          >
            ?
          </div>
          <div className="min-w-0">
            <p className="font-medium text-neutral-500">No display name yet</p>
            {profile ? (
              <p className="text-sm text-neutral-600">
                Member since {memberSince.format(profile.createdAt)}
              </p>
            ) : null}
          </div>
        </div>
        <dl className="flex flex-col gap-1">
          <dt className="font-medium">Bio</dt>
          <dd className="text-neutral-500">No bio yet</dd>
        </dl>
        <p className="text-sm text-neutral-600">
          Your profile is empty for now. Soon you will be able to add a name, a short bio and a
          picture.
        </p>
      </section>
      <LogOutButton />
    </PageShell>
  );
}

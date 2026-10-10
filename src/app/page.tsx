import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Friends</h1>
      <p className="text-neutral-600">A safe, private community.</p>
      <nav aria-label="Account" className="flex flex-col gap-3 sm:flex-row">
        <Link
          href="/signup"
          className="rounded-md bg-neutral-900 px-4 py-2 text-center font-medium text-white hover:bg-neutral-700"
        >
          Create an account
        </Link>
        <Link
          href="/login"
          className="rounded-md border border-neutral-300 px-4 py-2 text-center font-medium hover:bg-neutral-100"
        >
          Log in
        </Link>
      </nav>
    </main>
  );
}

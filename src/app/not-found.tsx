import Link from 'next/link';

// Replaces the built-in 404 page, which uses inline styles that the CSP (AC16) blocks.
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Page not found</h1>
      <p className="text-neutral-600">The page you are looking for does not exist.</p>
      <Link href="/" className="font-medium underline underline-offset-4">
        Go to the home page
      </Link>
    </main>
  );
}

import type { ReactNode } from 'react';

// Shared form building blocks: labelled inputs, field errors tied to their input (aria), and
// mobile-first styling (AC15). Tailwind classes only: the CSP forbids inline styles (AC16).

export type FormState = {
  fieldErrors?: Partial<Record<'email' | 'password', string>>;
  /** Shown above the form, announced to screen readers. */
  message?: { tone: 'error' | 'success'; text: string };
  /** Echoed back so the user doesn't retype it. Never the password. */
  email?: string | undefined;
};

export const RATE_LIMITED_MESSAGE = 'Too many attempts. Please try again later.';

export function TextField({
  name,
  id = name,
  label,
  type,
  autoComplete,
  error,
  defaultValue,
}: {
  /** Defaults to `name`; set it when two forms on one page share a field name. */
  id?: string;
  name: 'email' | 'password';
  label: string;
  type: 'email' | 'password';
  autoComplete: string;
  error?: string | undefined;
  defaultValue?: string | undefined;
}) {
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        required
        defaultValue={defaultValue}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-base outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/20 aria-[invalid=true]:border-red-600"
      />
      {error ? (
        <p id={errorId} className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function SubmitButton({ pending, children }: { pending: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-neutral-900 px-4 py-2 font-medium text-white hover:bg-neutral-700 disabled:opacity-60"
    >
      {children}
    </button>
  );
}

export function FormMessage({ message }: { message: FormState['message'] }) {
  if (!message) return null;
  const tone =
    message.tone === 'error'
      ? 'border-red-200 bg-red-50 text-red-800'
      : 'border-green-200 bg-green-50 text-green-800';
  return (
    <p
      role={message.tone === 'error' ? 'alert' : 'status'}
      className={`rounded-md border px-3 py-2 ${tone}`}
    >
      {message.text}
    </p>
  );
}

export function PageShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {children}
    </main>
  );
}

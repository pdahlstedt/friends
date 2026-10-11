'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { FormMessage, type FormState, TextField } from '@/app/_components/form';
import { deleteAccountAction } from './actions';

export function DeleteAccountForm() {
  const [state, action, pending] = useActionState(deleteAccountAction, {} satisfies FormState);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage message={state.message} />
      <TextField
        name="password"
        label="Your password"
        type="password"
        autoComplete="current-password"
      />
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-red-700 px-4 py-2 font-medium text-white hover:bg-red-800 disabled:opacity-60"
      >
        Delete my account permanently
      </button>
      <Link href="/me" className="text-center text-sm font-medium underline underline-offset-4">
        Cancel, keep my account
      </Link>
    </form>
  );
}

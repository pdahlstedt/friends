'use client';

import { useActionState } from 'react';
import { FormMessage, SubmitButton, TextField, type FormState } from '@/app/_components/form';
import { resendAction } from './resend-action';

/** Requests a new verification email. Used on the invalid-link page and after an unconfirmed log-in. */
export function ResendForm({ email }: { email?: string | undefined }) {
  const [state, action, pending] = useActionState(resendAction, { email } satisfies FormState);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage message={state.message} />
      <TextField
        id="resend-email"
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        error={state.fieldErrors?.email}
        defaultValue={state.email}
      />
      <SubmitButton pending={pending}>Send a new link</SubmitButton>
    </form>
  );
}

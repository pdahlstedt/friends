'use client';

import { useActionState } from 'react';
import { FormMessage, SubmitButton, TextField, type FormState } from '@/app/_components/form';
import { resendAction } from './actions';

export function ResendForm() {
  const [state, action, pending] = useActionState(resendAction, {} satisfies FormState);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormMessage message={state.message} />
      <TextField
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

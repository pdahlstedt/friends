'use client';

import { useActionState } from 'react';
import { FormMessage, SubmitButton, TextField, type FormState } from '@/app/_components/form';
import { signUpAction } from './actions';

export function SignUpForm() {
  const [state, action, pending] = useActionState(signUpAction, {} satisfies FormState);
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
      <TextField
        name="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        error={state.fieldErrors?.password}
      />
      <p className="-mt-2 text-sm text-neutral-600">At least 12 characters.</p>
      <SubmitButton pending={pending}>Create account</SubmitButton>
    </form>
  );
}

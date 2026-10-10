'use client';

import { useActionState } from 'react';
import { FormMessage, SubmitButton, TextField } from '@/app/_components/form';
import { ResendForm } from '@/app/_components/resend-form';
import { logInAction, type LogInState } from './actions';

export function LogInForm() {
  const [state, action, pending] = useActionState(logInAction, {} satisfies LogInState);
  return (
    <div className="flex flex-col gap-8">
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
          autoComplete="current-password"
          error={state.fieldErrors?.password}
        />
        <SubmitButton pending={pending}>Log in</SubmitButton>
      </form>
      {state.unconfirmed ? (
        <section aria-labelledby="resend-heading" className="flex flex-col gap-4">
          <h2 id="resend-heading" className="text-lg font-semibold">
            Send a new confirmation link
          </h2>
          <ResendForm email={state.email} />
        </section>
      ) : null}
    </div>
  );
}

'use client';

import { useActionState } from 'react';
import { FormMessage, SubmitButton, type FormState } from '@/app/_components/form';
import { confirmAction } from './actions';

export function ConfirmForm({ tokenHash }: { tokenHash: string }) {
  const [state, action, pending] = useActionState(confirmAction, {} satisfies FormState);
  return (
    <form action={action} className="flex flex-col gap-4">
      <FormMessage message={state.message} />
      <input type="hidden" name="tokenHash" value={tokenHash} />
      <SubmitButton pending={pending}>Confirm my email</SubmitButton>
    </form>
  );
}

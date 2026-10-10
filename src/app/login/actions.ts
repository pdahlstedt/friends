'use server';

import { redirect } from 'next/navigation';
import { RATE_LIMITED_MESSAGE, type FormState } from '@/app/_components/form';
import { formFields } from '@/lib/http/form';
import { requestServices } from '@/server/container';

export type LogInState = FormState & { unconfirmed?: boolean };

// Wiring only (spec 0001 plan, "Routes"): the users module decides everything.
export async function logInAction(_previous: LogInState, form: FormData): Promise<LogInState> {
  const { users, ctx } = await requestServices();
  const input = formFields(form, ['email', 'password']);
  const result = await users.logIn(input, ctx);
  switch (result.kind) {
    case 'logged_in':
      redirect('/me');
    case 'invalid_credentials':
      // One message for unknown email and wrong password (AC7).
      return {
        message: { tone: 'error', text: 'Email or password is incorrect.' },
        email: input.email,
      };
    case 'email_not_confirmed':
      return {
        message: {
          tone: 'error',
          text: 'Please confirm your email first. We can send you a new link.',
        },
        email: input.email,
        unconfirmed: true,
      };
    case 'invalid':
      return { fieldErrors: result.fieldErrors, email: input.email };
    case 'rate_limited':
      return { message: { tone: 'error', text: RATE_LIMITED_MESSAGE }, email: input.email };
  }
}

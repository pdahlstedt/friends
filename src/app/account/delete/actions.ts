'use server';

import { redirect } from 'next/navigation';
import { RATE_LIMITED_MESSAGE, type FormState } from '@/app/_components/form';
import { formFields } from '@/lib/http/form';
import { requestServices } from '@/server/container';

// Wiring only (spec 0002 plan, "Routes"): the users module decides everything. POST only (a
// server action, with Next's Origin check): opening a link can never delete an account (AC10).
// Only the password is passed on; identity comes from the session (AC9).
export async function deleteAccountAction(
  _previous: FormState,
  form: FormData,
): Promise<FormState> {
  const { users, ctx } = await requestServices();
  const result = await users.deleteAccount(formFields(form, ['password']), ctx);
  switch (result.kind) {
    case 'deleted':
      redirect('/account/deleted');
    case 'not_signed_in':
      redirect('/login');
    case 'wrong_password':
      return { message: { tone: 'error', text: 'Password is incorrect.' } };
    case 'rate_limited':
      return { message: { tone: 'error', text: RATE_LIMITED_MESSAGE } };
    case 'failed':
      return {
        message: {
          tone: 'error',
          text: 'Something went wrong. Your account was not deleted. Please try again.',
        },
      };
  }
}

'use server';

import { redirect } from 'next/navigation';
import { RATE_LIMITED_MESSAGE, type FormState } from '@/app/_components/form';
import { formFields } from '@/lib/http/form';
import { requestServices } from '@/server/container';

// Wiring only (spec 0001 plan, "Routes"): the users module decides everything.
export async function signUpAction(_previous: FormState, form: FormData): Promise<FormState> {
  const { users, ctx } = await requestServices();
  const input = formFields(form, ['email', 'password']);
  const result = await users.signUp(input, ctx);
  switch (result.kind) {
    case 'check_email':
      redirect('/signup/check-email');
    case 'invalid':
      return { fieldErrors: result.fieldErrors, email: input.email };
    case 'rate_limited':
      return { message: { tone: 'error', text: RATE_LIMITED_MESSAGE }, email: input.email };
  }
}

'use server';

import { RATE_LIMITED_MESSAGE, type FormState } from '@/app/_components/form';
import { formFields } from '@/lib/http/form';
import { requestServices } from '@/server/container';

const RESEND_SENT_MESSAGE =
  'If that address has an account waiting for confirmation, we have sent it a new link.';

export async function resendAction(_previous: FormState, form: FormData): Promise<FormState> {
  const { users, ctx } = await requestServices();
  const input = formFields(form, ['email']);
  const result = await users.resendVerification(input, ctx);
  switch (result.kind) {
    // The same message whether or not the account exists (AC4).
    case 'sent_if_applicable':
      return { message: { tone: 'success', text: RESEND_SENT_MESSAGE } };
    case 'invalid':
      return { fieldErrors: result.fieldErrors, email: input.email };
    case 'rate_limited':
      return { message: { tone: 'error', text: RATE_LIMITED_MESSAGE }, email: input.email };
  }
}

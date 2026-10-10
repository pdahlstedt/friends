'use server';

import { redirect } from 'next/navigation';
import { RATE_LIMITED_MESSAGE, type FormState } from '@/app/_components/form';
import { formFields } from '@/lib/http/form';
import { requestServices } from '@/server/container';

// POST only: the token is consumed here, never by the GET that renders the page (AC2 amended),
// so email link scanners can't use it up.
export async function confirmAction(_previous: FormState, form: FormData): Promise<FormState> {
  const { users } = await requestServices();
  const result = await users.confirmEmail(formFields(form, ['tokenHash']));
  switch (result.kind) {
    case 'confirmed':
      redirect('/me');
    case 'invalid_link':
      redirect('/auth/invalid-link');
    case 'rate_limited':
      return { message: { tone: 'error', text: RATE_LIMITED_MESSAGE } };
  }
}

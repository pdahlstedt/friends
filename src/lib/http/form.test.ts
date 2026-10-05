import { describe, expect, it } from 'vitest';
import { formFields } from './form';

describe('formFields', () => {
  it('returns only the named string fields', () => {
    const form = new FormData();
    form.set('email', 'a@example.com');
    form.set('password', 'secret secret');
    form.set('$ACTION_ID_abc123', '');
    expect(formFields(form, ['email', 'password'])).toEqual({
      email: 'a@example.com',
      password: 'secret secret',
    });
  });

  it('[0001-AC14] ignores a client-supplied userId', () => {
    const form = new FormData();
    form.set('email', 'a@example.com');
    form.set('userId', '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b');
    expect(formFields(form, ['email'])).toEqual({ email: 'a@example.com' });
  });

  it('omits missing fields and files, so validation reports them', () => {
    const form = new FormData();
    form.set('password', new Blob(['x']), 'x.txt');
    expect(formFields(form, ['email', 'password'])).toEqual({});
  });

  it('takes the first value when a field is repeated', () => {
    const form = new FormData();
    form.append('email', 'first@example.com');
    form.append('email', 'second@example.com');
    expect(formFields(form, ['email'])).toEqual({ email: 'first@example.com' });
  });
});

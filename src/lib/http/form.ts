// Server actions receive the whole FormData, including Next.js's own `$ACTION_…` fields and
// anything a client adds (e.g. a forged userId). Pass module APIs only the expected fields;
// their strict schemas reject anything else as a second line of defence (AC14).

export function formFields<K extends string>(
  form: FormData,
  names: readonly K[],
): Partial<Record<K, string>> {
  const fields: Partial<Record<K, string>> = {};
  for (const name of names) {
    const value = form.get(name);
    if (typeof value === 'string') fields[name] = value;
  }
  return fields;
}

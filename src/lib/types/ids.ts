declare const userIdBrand: unique symbol;

/** A Supabase Auth user ID. Only obtainable via `toUserId`, so a raw string can't be passed by accident. */
export type UserId = string & { readonly [userIdBrand]: true };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function toUserId(value: string): UserId {
  // The value is not echoed: callers should never be handling untrusted IDs, but if they are, keep it out of logs.
  if (!UUID.test(value)) throw new Error('Invalid user ID');
  return value as UserId;
}

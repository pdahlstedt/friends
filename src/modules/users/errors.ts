export type UsersErrorCode =
  /** Anything unexpected from the database or network. */
  'unavailable';

/** Carries a code only: vendor messages can contain personal data and never leave the module. */
export class UsersError extends Error {
  constructor(readonly code: UsersErrorCode) {
    super(`Users error: ${code}`);
    this.name = 'UsersError';
  }
}

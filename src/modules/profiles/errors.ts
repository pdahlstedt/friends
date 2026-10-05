export type ProfilesErrorCode =
  /** The viewer may not read profiles at all (anonymous). */
  | 'permission_denied'
  /** No auth user with this ID. */
  | 'user_not_found'
  /** Anything else from the database or network. */
  | 'unavailable';

/** Carries a code only: vendor messages can contain personal data and never leave the module. */
export class ProfilesError extends Error {
  constructor(readonly code: ProfilesErrorCode) {
    super(`Profiles error: ${code}`);
    this.name = 'ProfilesError';
  }
}

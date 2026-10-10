# Story map

The user journey left to right (activities), stories top to bottom (most essential first).
Release lines cut horizontally: everything above a line is one shippable slice.
Each story becomes (part of) a spec in `docs/specs/`. Link the spec ID once created.

Priority rule: next slice = highest **value per effort** or highest **risk retired**.

## Activities

| Join                                        | Present myself                            | Share photos                       | Talk to people             | Pay for more                      | Run the site                                         |
| ------------------------------------------- | ----------------------------------------- | ---------------------------------- | -------------------------- | --------------------------------- | ---------------------------------------------------- |
| **Release 0 — Walking skeleton**            |                                           |                                    |                            |                                   |                                                      |
| Sign up with email, verify, log in, log out | See my own (empty) profile page           |                                    |                            |                                   | Deployed with CI, security headers, RLS test harness |
| **Release 1 — Minimum lovable**             |                                           |                                    |                            |                                   |                                                      |
| OAuth login                                 | Edit name, bio, avatar                    | Upload photo to my profile         |                            |                                   | Admin login behind Cloudflare Access                 |
| Delete my account (GDPR)                    | View other users' public profiles         | View a user's photos               |                            |                                   | Basic user list + suspend user                       |
| Password reset                              |                                           |                                    |                            |                                   |                                                      |
| Confirm I'm 18+ at sign-up                  |                                           |                                    |                            |                                   |                                                      |
| **Release 2 — Social**                      |                                           |                                    |                            |                                   |                                                      |
| Export my data (GDPR)                       | Privacy settings (public/private profile) | Delete my photo                    | 1:1 text chat              |                                   | Report content → moderation queue                    |
|                                             |                                           | Report a photo                     | Block a user               |                                   | Audit log of admin actions                           |
| **Release 3 — Revenue**                     |                                           |                                    |                            |                                   |                                                      |
|                                             | Subscriber badge                          | Larger photo quota for subscribers |                            | Subscribe via Stripe Checkout     | Manage ad slots                                      |
|                                             |                                           |                                    |                            | Manage/cancel via Customer Portal | See subscription stats                               |
| **Later**                                   |                                           |                                    |                            |                                   |                                                      |
| MFA for users                               |                                           | Albums                             | Group chat, images in chat | Yearly plan                       | Content analytics                                    |

## Spec index

| Spec                                                     | Slice                                                                                                                                                                            | Status      |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| [0001](../specs/0001-create-account-and-profile/spec.md) | Walking skeleton: create an account and see my profile (local stack + CI gates)                                                                                                  | Done        |
| [0002](../specs/0002-delete-my-account/spec.md)          | Delete my account (GDPR gate for going live)                                                                                                                                     | Approved    |
| 0003                                                     | Walking skeleton: live for the first real users (EU hosting, Cloudflare, real email, Turnstile, privacy notice, unconfirmed-account clean-up); who can sign up at launch is open | Not started |

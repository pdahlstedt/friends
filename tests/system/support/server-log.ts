import { readFile } from 'node:fs/promises';
import type { BrowserContext, Request } from '@playwright/test';

// 0001 AC20 and 0002 AC14: the server log (written by the Playwright webServer, see
// playwright.config.ts) must never contain a test's email addresses, passwords, verification
// tokens, session cookies, JWTs or user IDs.
// The secrets are collected from the browser's own traffic and cookie jar, so every test is
// covered without having to declare what it typed.

export const SERVER_LOG = 'logs/server.log';

// Form fields that carry personal data or credentials. Server actions may prefix field names.
const SECRET_FIELD = /(^|_)(email|password|tokenHash)$/;
const SECRET_QUERY_PARAMS = ['token_hash'];
// Shorter values (e.g. an empty field) would match unrelated log text.
const MIN_SECRET_LENGTH = 6;

export class SecretCollector {
  readonly secrets = new Set<string>();
  private readonly pending: Promise<void>[] = [];

  constructor(
    email: string,
    private readonly context: BrowserContext,
  ) {
    this.add(email);
    context.on('request', (request) => this.pending.push(this.fromRequest(request)));
    // Session cookies are read from the jar after each response: logging out clears them later.
    // (Response header lookups are avoided: they never settle for aborted or streamed requests.)
    context.on('response', () => this.pending.push(this.fromCookies()));
  }

  /** Inspects everything seen so far, plus the cookies the browser holds now. */
  async settled() {
    this.pending.push(this.fromCookies());
    await Promise.all(this.pending);
  }

  private add(value: string | null | undefined) {
    if (value && value.length >= MIN_SECRET_LENGTH) this.secrets.add(value);
  }

  private async fromRequest(request: Request) {
    const url = new URL(request.url());
    for (const param of SECRET_QUERY_PARAMS) this.add(url.searchParams.get(param));

    const body = request.postDataBuffer();
    const contentType = request.headers()['content-type'];
    if (!body || !contentType || !/multipart\/form-data|urlencoded/.test(contentType)) return;
    const form = await new globalThis.Response(new Uint8Array(body), {
      headers: { 'content-type': contentType },
    }).formData();
    for (const [name, value] of form) {
      if (SECRET_FIELD.test(name) && typeof value === 'string') this.add(value);
    }
  }

  /** Session cookies (`sb-…`, possibly chunked as `.0`, `.1`, …) and the tokens inside them. */
  private async fromCookies() {
    const chunks = new Map<string, string[]>();
    for (const { name, value } of await this.context.cookies()) {
      const match = /^(sb-[^.]+)(?:\.(\d+))?$/.exec(name);
      if (!match) continue;
      this.add(value);
      const parts = chunks.get(match[1]!) ?? [];
      parts[Number(match[2] ?? 0)] = value;
      chunks.set(match[1]!, parts);
    }
    for (const parts of chunks.values()) this.addSessionTokens(parts.join(''));
  }

  private addSessionTokens(cookieValue: string) {
    if (!cookieValue.startsWith('base64-')) return;
    try {
      const json = Buffer.from(cookieValue.slice('base64-'.length), 'base64url').toString('utf8');
      const session = JSON.parse(json) as {
        access_token?: string;
        refresh_token?: string;
        user?: { id?: string };
      };
      this.add(session.access_token);
      this.add(session.refresh_token);
      this.add(session.user?.id);
    } catch {
      // Not a session payload; the raw cookie value is already collected.
    }
  }
}

/** The collected secrets that appear in the server log. */
export async function secretsInServerLog(secrets: Iterable<string>): Promise<string[]> {
  const log = await readFile(SERVER_LOG, 'utf8');
  return [...secrets].filter((secret) => log.includes(secret));
}

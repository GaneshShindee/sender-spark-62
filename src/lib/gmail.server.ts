/**
 * Server-only Gmail / Google OAuth helpers. Never import from client code.
 *
 * Implements Authorization Code Flow with:
 *  - offline access + consent prompt (refresh_token guaranteed on first connect)
 *  - PKCE (S256) for defense-in-depth
 *  - state parameter (CSRF) bound to the user id
 *  - a pinned, server-side redirect URI (never trusted from the client)
 *  - automatic access-token refresh
 *  - structured error mapping with dev-only verbose logging
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

export const GMAIL_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.send",
].join(" ");

const isDev = process.env.NODE_ENV !== "production";

function devLog(...args: unknown[]) {
  if (isDev) console.log("[gmail-oauth]", ...args);
}

export class OAuthConfigError extends Error {
  code = "oauth_config_error";
  constructor(message: string) {
    super(message);
    this.name = "OAuthConfigError";
  }
}

export class OAuthFlowError extends Error {
  constructor(public code: string, message: string, public detail?: unknown) {
    super(message);
    this.name = "OAuthFlowError";
  }
}

/** Validates required OAuth env vars and returns a sanitized config. */
export function getOAuthConfig(): {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
} {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GMAIL_REDIRECT_URI;

  const missing: string[] = [];
  if (!clientId) missing.push("GOOGLE_CLIENT_ID");
  if (!clientSecret) missing.push("GOOGLE_CLIENT_SECRET");
  if (!redirectUri) missing.push("GMAIL_REDIRECT_URI");
  if (missing.length) {
    throw new OAuthConfigError(
      `Gmail OAuth is misconfigured. Missing: ${missing.join(", ")}. ` +
        `Set these in project secrets, then retry.`,
    );
  }

  // Hard validation of redirect URI format.
  let parsed: URL;
  try {
    parsed = new URL(redirectUri!);
  } catch {
    throw new OAuthConfigError(
      `GMAIL_REDIRECT_URI is not a valid URL: "${redirectUri}". ` +
        `Expected an absolute https URL ending with /auth/callback/gmail.`,
    );
  }
  if (parsed.protocol !== "https:") {
    throw new OAuthConfigError(
      `GMAIL_REDIRECT_URI must use https:// (got ${parsed.protocol}).`,
    );
  }
  if (!parsed.pathname.endsWith("/auth/callback/gmail")) {
    throw new OAuthConfigError(
      `GMAIL_REDIRECT_URI must end with /auth/callback/gmail (got ${parsed.pathname}). ` +
        `It must exactly match an Authorized redirect URI in your Google Cloud OAuth client.`,
    );
  }

  return {
    clientId: clientId!,
    clientSecret: clientSecret!,
    // Normalize: strip trailing slash, no query/hash allowed.
    redirectUri: `${parsed.origin}${parsed.pathname.replace(/\/$/, "")}`,
  };
}

/** PKCE helpers (S256). */
export function generatePkcePair(): { verifier: string; challenge: string } {
  const verifier = base64UrlEncodeBytes(crypto.getRandomValues(new Uint8Array(64)));
  // challenge will be computed async via subtle crypto
  return { verifier, challenge: "" };
}

export async function pkceChallengeFromVerifier(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncodeBytes(new Uint8Array(digest));
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function buildAuthorizationUrl(opts: {
  state: string;
  codeChallenge: string;
}): { url: string; redirectUri: string } {
  const cfg = getOAuthConfig();
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: GMAIL_SCOPES,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: opts.state,
    code_challenge: opts.codeChallenge,
    code_challenge_method: "S256",
  });
  return { url: `${AUTH_URL}?${params.toString()}`, redirectUri: cfg.redirectUri };
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
  id_token?: string;
}

/** Maps Google's `error` field to a stable code + user-friendly message. */
function mapTokenError(status: number, body: unknown): OAuthFlowError {
  const err =
    body && typeof body === "object" && "error" in body
      ? String((body as { error: unknown }).error)
      : `http_${status}`;
  const desc =
    body && typeof body === "object" && "error_description" in body
      ? String((body as { error_description: unknown }).error_description)
      : "";

  const friendly: Record<string, string> = {
    redirect_uri_mismatch:
      "The redirect URI does not match any Authorized redirect URI in your Google Cloud OAuth client. " +
      "Add the exact URL shown in Settings to the OAuth client, save, and retry.",
    invalid_client:
      "Google rejected the client credentials. Check GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in project secrets.",
    invalid_grant:
      "The authorization code is invalid or expired. Start the connect flow again.",
    access_denied: "You declined Gmail access.",
    unauthorized_client:
      "This OAuth client isn't authorized for the requested flow. Verify the client type is 'Web application'.",
    invalid_scope:
      "One of the requested scopes is not enabled for this OAuth client. Ensure Gmail API is enabled and gmail.send is allowed.",
  };
  const message = friendly[err] ?? `Google OAuth error: ${err}${desc ? ` — ${desc}` : ""}`;
  return new OAuthFlowError(err, message, { status, body });
}

export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
): Promise<TokenResponse> {
  const cfg = getOAuthConfig();
  const body = new URLSearchParams({
    code,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: cfg.redirectUri,
    grant_type: "authorization_code",
    code_verifier: codeVerifier,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    devLog("token exchange failed", res.status, text);
    throw mapTokenError(res.status, json ?? text);
  }
  return json as TokenResponse;
}

export async function refreshAccessToken(
  refreshToken: string,
): Promise<{ access_token: string; expires_in: number }> {
  const cfg = getOAuthConfig();
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: "refresh_token",
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    devLog("token refresh failed", res.status, text);
    throw mapTokenError(res.status, json ?? text);
  }
  return json as { access_token: string; expires_in: number };
}

export async function fetchGoogleUserInfo(
  accessToken: string,
): Promise<{ email: string; name?: string }> {
  const res = await fetch(USERINFO_URL, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    devLog("userinfo failed", res.status, text);
    throw new OAuthFlowError("userinfo_failed", `Could not fetch Google user info (${res.status}).`);
  }
  return (await res.json()) as { email: string; name?: string };
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export interface SendArgs {
  accessToken: string;
  from: string;
  to: string;
  bcc?: string;
  subject: string;
  body: string;
  html?: boolean;
}

export async function sendGmailMessage(
  args: SendArgs,
): Promise<{ id: string; threadId: string }> {
  const headers = [
    `From: ${args.from}`,
    `To: ${args.to}`,
    args.bcc ? `Bcc: ${args.bcc}` : null,
    `Subject: ${encodeMimeHeader(args.subject)}`,
    "MIME-Version: 1.0",
    args.html
      ? 'Content-Type: text/html; charset="UTF-8"'
      : 'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
  ].filter(Boolean);
  const raw = base64UrlEncode(headers.join("\r\n") + "\r\n\r\n" + args.body);
  const res = await fetch(GMAIL_SEND_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${args.accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) {
    const txt = await res.text();
    devLog("gmail send failed", res.status, txt);
    throw new Error(`Gmail send failed: ${res.status} ${txt}`);
  }
  return (await res.json()) as { id: string; threadId: string };
}

function encodeMimeHeader(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

import { createServerFn } from "@tanstack/react-start";
import { setCookie, getCookie, deleteCookie } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const PKCE_COOKIE = "gmail_oauth_pkce";
const STATE_COOKIE = "gmail_oauth_state";

/** Build the Google authorization URL for the current user to connect Gmail. */
export const startGmailOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const {
      buildAuthorizationUrl,
      generatePkcePair,
      pkceChallengeFromVerifier,
      getOAuthConfig,
    } = await import("./gmail.server");

    // Validate config up front so users see a clear error instead of a Google redirect failure.
    const cfg = getOAuthConfig();

    const { verifier } = generatePkcePair();
    const challenge = await pkceChallengeFromVerifier(verifier);

    // state binds CSRF to the user id; we re-verify against authenticated context on callback
    const state = `${context.userId}.${crypto.randomUUID()}`;

    const { url, redirectUri } = buildAuthorizationUrl({
      state,
      codeChallenge: challenge,
    });

    // Stash verifier + state in httpOnly cookies. Cookies are scoped to our origin
    // so the verifier never leaves the server-trust boundary.
    const cookieOpts = {
      httpOnly: true,
      secure: true,
      sameSite: "lax" as const,
      path: "/",
      maxAge: 60 * 10, // 10 minutes — long enough for consent screen
    };
    setCookie(PKCE_COOKIE, verifier, cookieOpts);
    setCookie(STATE_COOKIE, state, cookieOpts);

    return { url, redirectUri, expectedRedirectUri: cfg.redirectUri };
  });

/** Complete Gmail OAuth: exchange code for tokens, store under current user. */
export const completeGmailOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { code: string; state: string }) =>
    z
      .object({
        code: z.string().min(1),
        state: z.string().min(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { exchangeCodeForTokens, fetchGoogleUserInfo, OAuthFlowError } = await import(
      "./gmail.server"
    );

    // CSRF: state must match the cookie AND begin with the authenticated user's id.
    const expectedState = getCookie(STATE_COOKIE);
    const verifier = getCookie(PKCE_COOKIE);
    deleteCookie(STATE_COOKIE, { path: "/" });
    deleteCookie(PKCE_COOKIE, { path: "/" });

    if (!expectedState || expectedState !== data.state) {
      throw new OAuthFlowError(
        "state_mismatch",
        "Security check failed (state mismatch). Start the connect flow again from Settings.",
      );
    }
    if (!data.state.startsWith(`${context.userId}.`)) {
      throw new OAuthFlowError(
        "state_user_mismatch",
        "The authorization request belongs to a different account. Please sign in again and retry.",
      );
    }
    if (!verifier) {
      throw new OAuthFlowError(
        "pkce_missing",
        "Connect flow expired before completing. Click Connect Gmail again.",
      );
    }

    const tokens = await exchangeCodeForTokens(data.code, verifier);
    if (!tokens.refresh_token) {
      throw new OAuthFlowError(
        "no_refresh_token",
        "Google did not return a refresh token. Open https://myaccount.google.com/permissions, revoke access for this app, then click Connect Gmail again.",
      );
    }
    const info = await fetchGoogleUserInfo(tokens.access_token);
    const expiry = new Date(Date.now() + (tokens.expires_in - 60) * 1000).toISOString();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("gmail_connections").upsert(
      {
        user_id: context.userId,
        gmail_address: info.email,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expiry,
        scope: tokens.scope,
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true, email: info.email };
  });

/** Get the current user's Gmail connection (metadata only, no tokens). */
export const getMyGmailConnection = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("gmail_connections")
      .select("gmail_address, created_at, updated_at, scope")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

/** Disconnect Gmail for current user. */
export const disconnectGmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("gmail_connections")
      .delete()
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Read the configured redirect URI (for the Settings UI to show users what to whitelist). */
export const getGmailOAuthConfigStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    try {
      const { getOAuthConfig } = await import("./gmail.server");
      const cfg = getOAuthConfig();
      return { ok: true as const, redirectUri: cfg.redirectUri };
    } catch (e) {
      return {
        ok: false as const,
        message: e instanceof Error ? e.message : "OAuth not configured",
      };
    }
  });

/** Send an email via Gmail API using the user's stored credentials. */
export const sendEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    to: string;
    subject: string;
    body: string;
    bccSelf?: boolean;
    templateId?: string | null;
  }) =>
    z
      .object({
        to: z.string().email().max(320),
        subject: z.string().min(1).max(998),
        body: z.string().min(1).max(100_000),
        bccSelf: z.boolean().optional(),
        templateId: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { refreshAccessToken, sendGmailMessage } = await import("./gmail.server");

    const { data: conn, error: connErr } = await supabaseAdmin
      .from("gmail_connections")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (connErr) throw new Error(connErr.message);
    if (!conn) throw new Error("Gmail is not connected. Connect it in Settings.");

    let accessToken = conn.access_token;
    const expiresAt = new Date(conn.expiry).getTime();
    if (Number.isNaN(expiresAt) || expiresAt < Date.now() + 30_000) {
      const fresh = await refreshAccessToken(conn.refresh_token);
      accessToken = fresh.access_token;
      const newExpiry = new Date(Date.now() + (fresh.expires_in - 60) * 1000).toISOString();
      await supabaseAdmin
        .from("gmail_connections")
        .update({ access_token: accessToken, expiry: newExpiry })
        .eq("user_id", context.userId);
    }

    let status = "sent";
    let errorMsg: string | null = null;
    let messageId: string | null = null;
    try {
      const result = await sendGmailMessage({
        accessToken,
        from: conn.gmail_address,
        to: data.to,
        bcc: data.bccSelf ? conn.gmail_address : undefined,
        subject: data.subject,
        body: data.body,
      });
      messageId = result.id;
    } catch (e) {
      status = "failed";
      errorMsg = e instanceof Error ? e.message : String(e);
    }

    await supabaseAdmin.from("email_history").insert({
      user_id: context.userId,
      template_id: data.templateId ?? null,
      recipient: data.to,
      bcc: data.bccSelf ? conn.gmail_address : null,
      subject: data.subject,
      body: data.body,
      status,
      error: errorMsg,
      gmail_message_id: messageId,
    });

    if (status === "failed") throw new Error(errorMsg ?? "Send failed");
    return { ok: true, id: messageId };
  });

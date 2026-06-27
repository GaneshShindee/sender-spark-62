import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/** Build the Google authorization URL for the current user to connect Gmail. */
export const startGmailOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { origin: string }) =>
    z.object({ origin: z.string().url() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { buildAuthorizationUrl } = await import("./gmail.server");
    const redirectUri = `${data.origin.replace(/\/$/, "")}/auth/callback/gmail`;
    // state binds CSRF to the user id; we re-verify against authenticated context on callback
    const state = `${context.userId}.${crypto.randomUUID()}`;
    const url = buildAuthorizationUrl({ redirectUri, state });
    return { url, state, redirectUri };
  });

/** Complete Gmail OAuth: exchange code for tokens, store under current user. */
export const completeGmailOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { code: string; state: string; origin: string }) =>
    z.object({
      code: z.string().min(1),
      state: z.string().min(1),
      origin: z.string().url(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // verify the state encodes the same user (CSRF defense)
    const expectedPrefix = `${context.userId}.`;
    if (!data.state.startsWith(expectedPrefix)) {
      throw new Error("State mismatch — please try connecting again.");
    }
    const { exchangeCodeForTokens, fetchGoogleUserInfo } = await import("./gmail.server");
    const redirectUri = `${data.origin.replace(/\/$/, "")}/auth/callback/gmail`;
    const tokens = await exchangeCodeForTokens(data.code, redirectUri);
    if (!tokens.refresh_token) {
      throw new Error(
        "Google did not return a refresh token. Revoke app access at myaccount.google.com/permissions and try again.",
      );
    }
    const info = await fetchGoogleUserInfo(tokens.access_token);
    const expiry = new Date(Date.now() + (tokens.expires_in - 60) * 1000).toISOString();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("gmail_connections")
      .upsert(
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
    z.object({
      to: z.string().email().max(320),
      subject: z.string().min(1).max(998),
      body: z.string().min(1).max(100_000),
      bccSelf: z.boolean().optional(),
      templateId: z.string().uuid().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { refreshAccessToken, sendGmailMessage } = await import("./gmail.server");

    // load connection with tokens via admin (RLS would hide tokens otherwise — they're sensitive)
    const { data: conn, error: connErr } = await supabaseAdmin
      .from("gmail_connections")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (connErr) throw new Error(connErr.message);
    if (!conn) throw new Error("Gmail is not connected. Connect it in Settings.");

    // refresh if expired
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

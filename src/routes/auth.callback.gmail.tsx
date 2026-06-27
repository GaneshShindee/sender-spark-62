import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { completeGmailOAuth } from "@/lib/gmail.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/auth/callback/gmail")({
  head: () => ({ meta: [{ title: "Connecting Gmail…" }] }),
  component: GmailCallback,
});

/** Map Google's `error` query param to a user-friendly explanation. */
function explainGoogleError(code: string): string {
  switch (code) {
    case "access_denied":
      return "You declined Gmail access. Click Connect Gmail to try again.";
    case "redirect_uri_mismatch":
      return "Redirect URI mismatch. Add the exact URL shown in Settings to your Google Cloud OAuth client's Authorized redirect URIs.";
    case "invalid_client":
      return "Invalid OAuth client. Check GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in project secrets.";
    case "invalid_request":
      return "Google rejected the request as malformed. Start the connect flow again.";
    case "unauthorized_client":
      return "This OAuth client isn't authorized for this flow. Confirm the client type is 'Web application'.";
    case "invalid_scope":
      return "A requested scope is not allowed. Ensure the Gmail API is enabled for the project.";
    default:
      return `Google returned: ${code}`;
  }
}

function GmailCallback() {
  const navigate = useNavigate();
  const complete = useServerFn(completeGmailOAuth);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [message, setMessage] = useState("Connecting your Gmail account…");
  const [detail, setDetail] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    (async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const stateParam = params.get("state");
      const err = params.get("error");
      const errDesc = params.get("error_description");

      if (err) {
        setState("error");
        setMessage(explainGoogleError(err));
        if (errDesc) setDetail(errDesc);
        if (import.meta.env.DEV) console.error("[gmail-oauth] callback error", err, errDesc);
        return;
      }
      if (!code || !stateParam) {
        setState("error");
        setMessage("Missing authorization code in the callback URL.");
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        navigate({ to: "/auth", replace: true });
        return;
      }

      try {
        const r = await complete({ data: { code, state: stateParam } });
        setState("ok");
        setMessage(`Gmail connected: ${r.email}`);
        setTimeout(() => navigate({ to: "/dashboard", replace: true }), 900);
      } catch (e) {
        setState("error");
        const msg = e instanceof Error ? e.message : "Failed to connect Gmail";
        setMessage(msg);
        if (import.meta.env.DEV) console.error("[gmail-oauth] exchange failed", e);
      }
    })();
  }, [complete, navigate]);

  return (
    <div className="grid min-h-screen place-items-center px-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-glow">
        {state === "loading" && <Loader2 className="mx-auto size-8 animate-spin text-primary" />}
        {state === "ok" && <CheckCircle2 className="mx-auto size-8 text-[oklch(0.7_0.16_160)]" />}
        {state === "error" && <AlertCircle className="mx-auto size-8 text-destructive" />}
        <h1 className="mt-4 text-lg font-semibold">
          {state === "loading"
            ? "Connecting Gmail"
            : state === "ok"
              ? "Connected"
              : "Couldn't connect"}
        </h1>
        <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{message}</p>
        {detail && (
          <p className="mt-2 break-words text-xs text-muted-foreground/80">{detail}</p>
        )}
        {state === "error" && (
          <Button className="mt-6" onClick={() => navigate({ to: "/settings" })}>
            Back to settings
          </Button>
        )}
      </div>
    </div>
  );
}

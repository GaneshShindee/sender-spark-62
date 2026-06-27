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

function GmailCallback() {
  const navigate = useNavigate();
  const complete = useServerFn(completeGmailOAuth);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [message, setMessage] = useState("Connecting your Gmail account…");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    (async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const stateParam = params.get("state");
      const err = params.get("error");
      if (err) {
        setState("error");
        setMessage(err === "access_denied" ? "You declined Gmail access." : `Google returned: ${err}`);
        return;
      }
      if (!code || !stateParam) {
        setState("error");
        setMessage("Missing authorization code.");
        return;
      }
      // ensure session
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        navigate({ to: "/auth", replace: true });
        return;
      }
      try {
        const r = await complete({ data: { code, state: stateParam, origin: window.location.origin } });
        setState("ok");
        setMessage(`Gmail connected: ${r.email}`);
        setTimeout(() => navigate({ to: "/dashboard", replace: true }), 900);
      } catch (e) {
        setState("error");
        setMessage(e instanceof Error ? e.message : "Failed to connect Gmail");
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
          {state === "loading" ? "Connecting Gmail" : state === "ok" ? "Connected" : "Couldn't connect"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        {state === "error" && (
          <Button className="mt-6" onClick={() => navigate({ to: "/settings" })}>
            Back to settings
          </Button>
        )}
      </div>
    </div>
  );
}

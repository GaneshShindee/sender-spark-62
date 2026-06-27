import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Mail, Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Smart Email Sender" },
      { name: "description", content: "Sign in or create an account to start sending personalized email from your Gmail." },
    ],
  }),
  component: AuthPage,
});

const schema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(8, "At least 8 characters").max(128),
});
type Values = z.infer<typeof schema>;

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [loading, setLoading] = useState(false);

  // already signed in?
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: Values) {
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: values.email,
          password: values.password,
          options: { emailRedirectTo: `${window.location.origin}/dashboard` },
        });
        if (error) throw error;
        toast.success("Account created — you're signed in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword(values);
        if (error) throw error;
        toast.success("Welcome back.");
      }
      navigate({ to: "/dashboard", replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <aside className="relative hidden gradient-brand p-10 text-primary-foreground md:flex md:flex-col md:justify-between">
        <Link to="/" className="inline-flex items-center gap-2 text-sm opacity-90 hover:opacity-100">
          <ArrowLeft className="size-4" /> Back home
        </Link>
        <div>
          <div className="grid size-10 place-items-center rounded-lg bg-white/15 backdrop-blur">
            <Mail className="size-5" />
          </div>
          <h2 className="mt-6 text-3xl font-semibold tracking-tight">
            Send personalized email from your own Gmail.
          </h2>
          <p className="mt-3 max-w-md text-sm opacity-90">
            Save templates with placeholders. Pick recipients. Preview. Send. We never touch your inbox without your consent.
          </p>
        </div>
        <p className="text-xs opacity-70">© {new Date().getFullYear()} Smart Email Sender</p>
      </aside>

      <main className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="md:hidden mb-6">
            <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="size-4" /> Back</Link>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Welcome</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in or create an account to continue.</p>

          <Button
            type="button"
            variant="outline"
            className="mt-6 w-full"
            onClick={async () => {
              const r = await lovable.auth.signInWithOAuth("google", {
                redirect_uri: window.location.origin,
              });
              if (r.error) toast.error(r.error.message ?? "Google sign-in failed");
              else if (!r.redirected) navigate({ to: "/dashboard", replace: true });
            }}
          >
            <svg className="mr-2 size-4" viewBox="0 0 24 24"><path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.4 14.6 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12s4.3 9.6 9.6 9.6c5.5 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-1.6H12z"/></svg>
            Continue with Google
          </Button>

          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            or with email
            <div className="h-px flex-1 bg-border" />
          </div>

          <Tabs value={mode} onValueChange={(v) => setMode(v as "signin" | "signup")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Create account</TabsTrigger>
            </TabsList>
            <TabsContent value={mode}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="mt-4 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" autoComplete="email" {...form.register("email")} />
                  {form.formState.errors.email && (
                    <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} {...form.register("password")} />
                  {form.formState.errors.password && (
                    <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
                  )}
                </div>
                <Button type="submit" disabled={loading} className="w-full gradient-brand text-primary-foreground shadow-glow">
                  {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
                  {mode === "signup" ? "Create account" : "Sign in"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            By continuing you agree to use your own Gmail account to send emails.
          </p>
        </div>
      </main>
    </div>
  );
}

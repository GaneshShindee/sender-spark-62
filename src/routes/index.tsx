import { createFileRoute, Link } from "@tanstack/react-router";
import { Mail, Send, FileText, Sparkles, ArrowRight, Shield, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Smart Email Sender — Mail merge from your own Gmail" },
      { name: "description", content: "Create reusable templates with {{placeholders}}, preview, and send personalized emails directly from your own Gmail account. No SMTP, no shared inbox." },
      { property: "og:title", content: "Smart Email Sender" },
      { property: "og:description", content: "Lightweight mail merge that sends from your own Gmail." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen gradient-surface">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <div className="grid size-8 place-items-center rounded-lg gradient-brand text-primary-foreground shadow-glow">
            <Mail className="size-4" />
          </div>
          <span className="font-semibold tracking-tight">Smart Email Sender</span>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button asChild variant="ghost"><Link to="/auth">Sign in</Link></Button>
          <Button asChild className="gradient-brand text-primary-foreground shadow-glow">
            <Link to="/auth">Get started <ArrowRight className="ml-1 size-4" /></Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-24 pt-12">
        <section className="text-center">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
            <Sparkles className="size-3" /> Mail merge for your own Gmail
          </div>
          <h1 className="mx-auto mt-6 max-w-3xl text-balance text-5xl font-semibold tracking-tight md:text-6xl">
            Send personalized email <span className="text-gradient">from your own Gmail</span> — in seconds.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-balance text-lg text-muted-foreground">
            Save templates with <code className="rounded bg-muted px-1.5 py-0.5 text-sm">{`{{placeholders}}`}</code>, fill recipient details, preview, and send. Emails land in <em>your</em> sent folder, not ours.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="gradient-brand text-primary-foreground shadow-glow">
              <Link to="/auth">Start free <ArrowRight className="ml-1 size-4" /></Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#how">See how it works</a>
            </Button>
          </div>
        </section>

        <section id="how" className="mt-24 grid gap-4 md:grid-cols-3">
          {[
            { icon: FileText, title: "Build templates once", desc: "Save subject + body with reusable {{name}}, {{company}}, {{position}} placeholders." },
            { icon: Sparkles, title: "Auto-detect fields", desc: "Pick a template — we generate the input form for you. No copy-pasting." },
            { icon: Send, title: "Send from your Gmail", desc: "We use the Gmail API with your consent. Messages appear in your own Sent folder." },
          ].map((f) => (
            <div key={f.title} className="glass rounded-2xl border border-border p-6">
              <div className="grid size-10 place-items-center rounded-lg gradient-brand text-primary-foreground"><f.icon className="size-5" /></div>
              <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </section>

        <section className="mt-16 grid gap-4 rounded-2xl border border-border bg-card/60 p-6 md:grid-cols-2">
          <div className="flex items-start gap-3">
            <Shield className="mt-1 size-5 text-primary" />
            <div>
              <h4 className="font-semibold">Your data stays yours</h4>
              <p className="text-sm text-muted-foreground">Refresh tokens are stored server-side and never exposed to the browser. Per-user row-level security in the database.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Zap className="mt-1 size-5 text-primary" />
            <div>
              <h4 className="font-semibold">No SMTP setup</h4>
              <p className="text-sm text-muted-foreground">One-time Google consent. We auto-refresh access tokens so you never re-authorize.</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} Smart Email Sender
      </footer>
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Mail, FileText, Send, History, CheckCircle2, AlertCircle, ArrowRight } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { getMyGmailConnection } from "@/lib/gmail.functions";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Smart Email Sender" }] }),
  component: Dashboard,
});

function Dashboard() {
  const getConn = useServerFn(getMyGmailConnection);

  const conn = useQuery({ queryKey: ["gmail-connection"], queryFn: () => getConn() });
  const stats = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [tpl, sent, failed, recent] = await Promise.all([
        supabase.from("templates").select("id", { count: "exact", head: true }),
        supabase.from("email_history").select("id", { count: "exact", head: true }).eq("status", "sent"),
        supabase.from("email_history").select("id", { count: "exact", head: true }).eq("status", "failed"),
        supabase.from("email_history").select("id, recipient, subject, status, sent_at").order("sent_at", { ascending: false }).limit(5),
      ]);
      return {
        templates: tpl.count ?? 0,
        sent: sent.count ?? 0,
        failed: failed.count ?? 0,
        recent: recent.data ?? [],
      };
    },
  });

  const connected = !!conn.data;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Your sending overview at a glance.</p>
        </div>
        <Button asChild className="gradient-brand text-primary-foreground shadow-glow">
          <Link to="/send"><Send className="mr-2 size-4" /> Quick send</Link>
        </Button>
      </div>

      {!conn.isLoading && !connected && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-5">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-lg gradient-brand text-primary-foreground"><Mail className="size-5" /></div>
              <div>
                <p className="font-medium">Connect your Gmail to start sending</p>
                <p className="text-sm text-muted-foreground">One-time consent. Emails will be sent from your own Gmail.</p>
              </div>
            </div>
            <Button asChild><Link to="/settings">Connect Gmail <ArrowRight className="ml-2 size-4" /></Link></Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Gmail" value={conn.isLoading ? null : (connected ? "Connected" : "Not connected")} icon={Mail} sub={conn.data?.gmail_address} />
        <StatCard label="Emails sent" value={stats.data?.sent ?? null} icon={Send} />
        <StatCard label="Templates" value={stats.data?.templates ?? null} icon={FileText} />
        <StatCard label="Failed" value={stats.data?.failed ?? null} icon={AlertCircle} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Recent activity</CardTitle>
          <Button asChild variant="ghost" size="sm"><Link to="/history">View all <History className="ml-2 size-4" /></Link></Button>
        </CardHeader>
        <CardContent>
          {stats.isLoading ? (
            <div className="space-y-2">{[0,1,2].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : (stats.data?.recent.length ?? 0) === 0 ? (
            <EmptyState
              title="No emails yet"
              description="Send your first email to see it here."
              action={<Button asChild><Link to="/send">Send first email</Link></Button>}
            />
          ) : (
            <ul className="divide-y divide-border">
              {stats.data!.recent.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{r.subject}</p>
                    <p className="truncate text-xs text-muted-foreground">{r.recipient}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={r.status} />
                    <span className="hidden text-xs text-muted-foreground sm:inline">{new Date(r.sent_at).toLocaleString()}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, sub }: { label: string; value: number | string | null; icon: any; sub?: string | null }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 py-5">
        <div className="grid size-10 place-items-center rounded-lg bg-accent text-accent-foreground"><Icon className="size-5" /></div>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          {value === null ? <Skeleton className="mt-1 h-6 w-20" /> : <p className="truncate text-xl font-semibold">{value}</p>}
          {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "sent") return <Badge variant="secondary" className="gap-1"><CheckCircle2 className="size-3 text-[oklch(0.65_0.16_160)]" /> Sent</Badge>;
  if (status === "failed") return <Badge variant="destructive" className="gap-1"><AlertCircle className="size-3" /> Failed</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

function EmptyState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed border-border py-12 text-center">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

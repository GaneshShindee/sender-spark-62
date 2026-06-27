import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search, Download, CheckCircle2, AlertCircle, Send, Eye } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({ meta: [{ title: "History — Smart Email Sender" }] }),
  component: HistoryPage,
});

const PAGE_SIZE = 25;

function HistoryPage() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<any | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["history", { q, status, page }],
    queryFn: async () => {
      let query = supabase
        .from("email_history")
        .select("*", { count: "exact" })
        .order("sent_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (status !== "all") query = query.eq("status", status);
      if (q.trim()) {
        const s = `%${q.trim()}%`;
        query = query.or(`recipient.ilike.${s},subject.ilike.${s}`);
      }
      const { data, error, count } = await query;
      if (error) throw error;
      return { rows: data ?? [], total: count ?? 0 };
    },
  });

  const pages = useMemo(() => Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE)), [data]);

  async function exportCsv() {
    const { data, error } = await supabase
      .from("email_history")
      .select("sent_at, recipient, bcc, subject, status, error, gmail_message_id")
      .order("sent_at", { ascending: false })
      .limit(5000);
    if (error) return;
    const rows = data ?? [];
    const header = ["sent_at", "recipient", "bcc", "subject", "status", "error", "gmail_message_id"];
    const escape = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [header.join(","), ...rows.map((r: any) => header.map((h) => escape(r[h])).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `email-history-${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">History</h1>
          <p className="text-sm text-muted-foreground">Every email you've sent through Smart Email Sender.</p>
        </div>
        <Button variant="outline" onClick={exportCsv}><Download className="mr-2 size-4" /> Export CSV</Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => { setPage(0); setQ(e.target.value); }} placeholder="Search recipient or subject…" className="pl-9" />
        </div>
        <Select value={status} onValueChange={(v) => { setPage(0); setStatus(v); }}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="queued">Queued</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">{[0,1,2,3,4].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (data?.rows.length ?? 0) === 0 ? (
            <div className="grid place-items-center py-16 text-center">
              <Send className="size-8 text-muted-foreground" />
              <p className="mt-3 font-medium">No emails yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Sent emails will appear here.</p>
              <Button asChild className="mt-4"><Link to="/send">Send your first email</Link></Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data!.rows.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs text-muted-foreground">{new Date(r.sent_at).toLocaleString()}</TableCell>
                    <TableCell className="max-w-[14rem] truncate">{r.recipient}</TableCell>
                    <TableCell className="max-w-[20rem] truncate">{r.subject}</TableCell>
                    <TableCell>
                      {r.status === "sent" ? <Badge variant="secondary" className="gap-1"><CheckCircle2 className="size-3 text-[oklch(0.65_0.16_160)]" />Sent</Badge> :
                        r.status === "failed" ? <Badge variant="destructive" className="gap-1"><AlertCircle className="size-3" />Failed</Badge> :
                        <Badge variant="outline">{r.status}</Badge>}
                    </TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" onClick={() => setSelected(r)} aria-label="View"><Eye className="size-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {(data?.total ?? 0) > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Page {page + 1} of {pages} · {data?.total} total</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Previous</Button>
            <Button size="sm" variant="outline" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{selected?.subject}</SheetTitle>
            <SheetDescription>{selected && new Date(selected.sent_at).toLocaleString()}</SheetDescription>
          </SheetHeader>
          {selected && (
            <div className="mt-4 space-y-3 text-sm">
              <div className="space-y-1 rounded-lg border border-border p-3 text-xs">
                <div><span className="text-muted-foreground">To: </span>{selected.recipient}</div>
                {selected.bcc && <div><span className="text-muted-foreground">BCC: </span>{selected.bcc}</div>}
                <div><span className="text-muted-foreground">Status: </span>{selected.status}</div>
                {selected.gmail_message_id && <div className="break-all"><span className="text-muted-foreground">Gmail ID: </span>{selected.gmail_message_id}</div>}
              </div>
              {selected.error && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">{selected.error}</div>
              )}
              <div className="whitespace-pre-wrap rounded-lg border border-border bg-card p-3">{selected.body}</div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

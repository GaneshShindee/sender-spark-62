import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState, useEffect } from "react";
import { Send, Eye, Loader2, Upload, X, Mail } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { extractPlaceholders, applyPlaceholders, humanizeKey } from "@/lib/placeholders";
import { sendEmail, getMyGmailConnection } from "@/lib/gmail.functions";
import type { Database } from "@/integrations/supabase/types";

type Template = Database["public"]["Tables"]["templates"]["Row"];

export const Route = createFileRoute("/_authenticated/send")({
  head: () => ({ meta: [{ title: "Send email — Smart Email Sender" }] }),
  component: SendPage,
});

function parseRecipients(input: string): string[] {
  return Array.from(new Set(
    input.split(/[\s,;\n]+/).map((s) => s.trim()).filter((s) => /.+@.+\..+/.test(s))
  ));
}

function SendPage() {
  const sendFn = useServerFn(sendEmail);
  const getConn = useServerFn(getMyGmailConnection);

  const conn = useQuery({ queryKey: ["gmail-connection"], queryFn: () => getConn() });

  const { data: templates, isLoading } = useQuery({
    queryKey: ["templates", "for-send"],
    queryFn: async () => {
      const { data, error } = await supabase.from("templates").select("*").order("updated_at", { ascending: false });
      if (error) throw error;
      return data as Template[];
    },
  });

  const [templateId, setTemplateId] = useState<string>("");
  const [recipientsText, setRecipientsText] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [vars, setVars] = useState<Record<string, string>>({});
  const [bccSelf, setBccSelf] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);

  const recipients = useMemo(() => parseRecipients(recipientsText), [recipientsText]);
  const placeholders = useMemo(() => extractPlaceholders(subject, body), [subject, body]);

  // Load template
  useEffect(() => {
    if (!templateId || !templates) return;
    const t = templates.find((x) => x.id === templateId);
    if (!t) return;
    setSubject(t.subject);
    setBody(t.body);
    setVars((prev) => {
      const next: Record<string, string> = {};
      for (const k of extractPlaceholders(t.subject, t.body)) next[k] = prev[k] ?? "";
      return next;
    });
  }, [templateId, templates]);

  // Keep vars keys in sync with current placeholders (manual edits)
  useEffect(() => {
    setVars((prev) => {
      const next: Record<string, string> = {};
      for (const k of placeholders) next[k] = prev[k] ?? "";
      return next;
    });
  }, [placeholders]);

  const finalSubject = useMemo(() => applyPlaceholders(subject, vars), [subject, vars]);
  const finalBody = useMemo(() => applyPlaceholders(body, vars), [body, vars]);

  function handleCsv(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const txt = String(reader.result ?? "");
      const found = parseRecipients(txt);
      if (found.length === 0) { toast.error("No valid emails found in file"); return; }
      setRecipientsText((cur) => {
        const existing = parseRecipients(cur);
        const merged = Array.from(new Set([...existing, ...found]));
        return merged.join(", ");
      });
      toast.success(`Imported ${found.length} recipient${found.length === 1 ? "" : "s"}`);
    };
    reader.readAsText(file);
  }

  const send = useMutation({
    mutationFn: async () => {
      if (!conn.data) throw new Error("Gmail not connected.");
      if (recipients.length === 0) throw new Error("Add at least one recipient.");
      if (!finalSubject.trim()) throw new Error("Subject is required.");
      if (!finalBody.trim()) throw new Error("Body is required.");
      const results = { ok: 0, fail: 0 };
      for (const to of recipients) {
        try {
          await sendFn({ data: { to, subject: finalSubject, body: finalBody, bccSelf, templateId: templateId || null } });
          results.ok++;
        } catch {
          results.fail++;
        }
      }
      return results;
    },
    onSuccess: (r) => {
      if (r.fail === 0) toast.success(`Sent ${r.ok} email${r.ok === 1 ? "" : "s"}`);
      else toast.warning(`Sent ${r.ok}, failed ${r.fail}. See History for details.`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Send email</h1>
          <p className="text-sm text-muted-foreground">Pick a template, fill the variables, preview, and send from your Gmail.</p>
        </div>

        {!conn.isLoading && !conn.data && (
          <Card className="border-primary/40 bg-primary/5">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-5">
              <div className="flex items-center gap-3">
                <Mail className="size-5 text-primary" />
                <p className="text-sm">Connect your Gmail account before sending.</p>
              </div>
              <Button asChild size="sm"><Link to="/settings">Connect Gmail</Link></Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle className="text-base">1 · Template</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-10 w-full" /> : (
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger><SelectValue placeholder={templates && templates.length ? "Choose a template (optional)" : "No templates yet"} /></SelectTrigger>
                <SelectContent>
                  {templates?.map((t) => (<SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>))}
                </SelectContent>
              </Select>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">2 · Recipients</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={recipientsText}
              onChange={(e) => setRecipientsText(e.target.value)}
              placeholder="alice@example.com, bob@example.com"
              rows={3}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Label htmlFor="csv" className="cursor-pointer">
                <span className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-xs hover:bg-accent">
                  <Upload className="size-3.5" /> Import CSV / TXT
                </span>
                <input id="csv" type="file" accept=".csv,.txt,text/csv,text/plain" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCsv(f); e.target.value = ""; }} />
              </Label>
              <span className="text-xs text-muted-foreground">{recipients.length} valid recipient{recipients.length === 1 ? "" : "s"}</span>
              {recipients.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setRecipientsText("")}><X className="mr-1 size-3.5" /> Clear</Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">3 · Subject & body</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="subj">Subject</Label>
              <Input id="subj" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Application for {{position}}" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="body">Body</Label>
              <Textarea id="body" value={body} onChange={(e) => setBody(e.target.value)} rows={10} placeholder="Hello {{name}}, …" />
            </div>
          </CardContent>
        </Card>

        {placeholders.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">4 · Fill placeholders</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2">
                {placeholders.map((k) => (
                  <div key={k} className="space-y-1.5">
                    <Label htmlFor={`v-${k}`} className="flex items-center gap-2">
                      {humanizeKey(k)} <Badge variant="secondary" className="font-mono text-[10px]">{`{{${k}}}`}</Badge>
                    </Label>
                    <Input id={`v-${k}`} value={vars[k] ?? ""} onChange={(e) => setVars({ ...vars, [k]: e.target.value })} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-5">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={bccSelf} onCheckedChange={(v) => setBccSelf(!!v)} /> BCC me ({conn.data?.gmail_address ?? "connected Gmail"})
            </label>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setPreviewOpen(true)}><Eye className="mr-2 size-4" /> Preview</Button>
              <Button onClick={() => send.mutate()} disabled={send.isPending || !conn.data || recipients.length === 0}
                className="gradient-brand text-primary-foreground shadow-glow">
                {send.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Send className="mr-2 size-4" />}
                Send {recipients.length > 0 ? `(${recipients.length})` : ""}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <aside className="space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Live preview</CardTitle></CardHeader>
          <CardContent>
            <PreviewBlock from={conn.data?.gmail_address ?? "your-gmail@gmail.com"} to={recipients} bcc={bccSelf ? conn.data?.gmail_address ?? null : null} subject={finalSubject} body={finalBody} compact />
          </CardContent>
        </Card>
      </aside>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Email preview</DialogTitle></DialogHeader>
          <PreviewBlock from={conn.data?.gmail_address ?? "your-gmail@gmail.com"} to={recipients} bcc={bccSelf ? conn.data?.gmail_address ?? null : null} subject={finalSubject} body={finalBody} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PreviewBlock({ from, to, bcc, subject, body, compact }: { from: string; to: string[]; bcc: string | null; subject: string; body: string; compact?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="space-y-1 border-b border-border p-4 text-xs">
        <Row label="From" value={from} />
        <Row label="To" value={to.length === 0 ? <span className="italic text-muted-foreground">no recipients</span> : to.join(", ")} />
        {bcc && <Row label="BCC" value={bcc} />}
        <Row label="Subject" value={<span className="font-medium text-foreground">{subject || <span className="italic text-muted-foreground">no subject</span>}</span>} />
      </div>
      <div className={`whitespace-pre-wrap p-4 text-sm ${compact ? "max-h-72 overflow-auto" : ""}`}>
        {body || <span className="italic text-muted-foreground">empty body</span>}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="w-14 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate">{value}</span>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Plus, Search, Star, Copy, Trash2, Pencil, FileText } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { extractPlaceholders } from "@/lib/placeholders";
import type { Database } from "@/integrations/supabase/types";

type Template = Database["public"]["Tables"]["templates"]["Row"];

export const Route = createFileRoute("/_authenticated/templates")({
  head: () => ({ meta: [{ title: "Templates — Smart Email Sender" }] }),
  component: TemplatesPage,
});

function TemplatesPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Template | null>(null);
  const [open, setOpen] = useState(false);

  const { data: templates, isLoading } = useQuery({
    queryKey: ["templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("templates")
        .select("*")
        .order("favorite", { ascending: false })
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filtered = useMemo(() => {
    if (!templates) return [];
    const s = q.trim().toLowerCase();
    if (!s) return templates;
    return templates.filter((t) =>
      t.name.toLowerCase().includes(s) ||
      (t.category ?? "").toLowerCase().includes(s) ||
      t.subject.toLowerCase().includes(s)
    );
  }, [templates, q]);

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Template deleted");
      qc.invalidateQueries({ queryKey: ["templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const favoriteMut = useMutation({
    mutationFn: async (t: Template) => {
      const { error } = await supabase.from("templates").update({ favorite: !t.favorite }).eq("id", t.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["templates"] }),
  });

  const duplicateMut = useMutation({
    mutationFn: async (t: Template) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase.from("templates").insert({
        user_id: user.id,
        name: `${t.name} (copy)`,
        category: t.category,
        subject: t.subject,
        body: t.body,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Template duplicated");
      qc.invalidateQueries({ queryKey: ["templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openCreate() { setEditing(null); setOpen(true); }
  function openEdit(t: Template) { setEditing(t); setOpen(true); }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Templates</h1>
          <p className="text-sm text-muted-foreground">Reusable email templates with <code className="rounded bg-muted px-1 text-xs">{`{{placeholders}}`}</code>.</p>
        </div>
        <Button onClick={openCreate} className="gradient-brand text-primary-foreground shadow-glow">
          <Plus className="mr-2 size-4" /> New template
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search templates…" className="pl-9" />
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0,1,2,3,4,5].map(i => <Skeleton key={i} className="h-40" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="grid place-items-center py-16 text-center">
            <div className="grid size-12 place-items-center rounded-xl bg-accent"><FileText className="size-6 text-accent-foreground" /></div>
            <p className="mt-4 font-medium">{q ? "No matches" : "No templates yet"}</p>
            <p className="mt-1 text-sm text-muted-foreground">{q ? "Try a different search term." : "Create your first template to get started."}</p>
            {!q && <Button className="mt-4" onClick={openCreate}><Plus className="mr-2 size-4" /> New template</Button>}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => {
            const vars = extractPlaceholders(t.subject, t.body);
            return (
              <Card key={t.id} className="flex flex-col">
                <CardContent className="flex flex-1 flex-col gap-3 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{t.name}</p>
                      {t.category && <Badge variant="outline" className="mt-1">{t.category}</Badge>}
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => favoriteMut.mutate(t)} aria-label="Favorite">
                      <Star className={`size-4 ${t.favorite ? "fill-[oklch(0.78_0.16_75)] text-[oklch(0.78_0.16_75)]" : ""}`} />
                    </Button>
                  </div>
                  <p className="truncate text-sm text-muted-foreground">{t.subject || <em>No subject</em>}</p>
                  <p className="line-clamp-3 flex-1 text-sm text-muted-foreground/80">{t.body}</p>
                  {vars.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {vars.slice(0, 4).map((v) => (<Badge key={v} variant="secondary" className="font-mono text-[10px]">{`{{${v}}}`}</Badge>))}
                      {vars.length > 4 && <Badge variant="secondary" className="text-[10px]">+{vars.length - 4}</Badge>}
                    </div>
                  )}
                  <div className="flex items-center gap-1 pt-1">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(t)}><Pencil className="mr-1 size-3.5" /> Edit</Button>
                    <Button size="sm" variant="ghost" onClick={() => duplicateMut.mutate(t)}><Copy className="mr-1 size-3.5" /> Copy</Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" className="ml-auto text-destructive hover:text-destructive"><Trash2 className="size-3.5" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete this template?</AlertDialogTitle>
                          <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteMut.mutate(t.id)}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <TemplateDialog open={open} setOpen={setOpen} editing={editing} />
    </div>
  );
}

function TemplateDialog({ open, setOpen, editing }: { open: boolean; setOpen: (v: boolean) => void; editing: Template | null }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  // sync form when opening
  useMemo(() => {
    if (open) {
      setName(editing?.name ?? "");
      setCategory(editing?.category ?? "");
      setSubject(editing?.subject ?? "");
      setBody(editing?.body ?? "");
    }
  }, [open, editing]);

  const vars = extractPlaceholders(subject, body);

  const save = useMutation({
    mutationFn: async () => {
      const trimmed = { name: name.trim(), subject: subject.trim(), body: body.trim() };
      if (!trimmed.name) throw new Error("Name is required");
      if (!trimmed.subject) throw new Error("Subject is required");
      if (!trimmed.body) throw new Error("Body is required");
      if (editing) {
        const { error } = await supabase.from("templates").update({
          name: trimmed.name, category: category.trim() || null, subject: trimmed.subject, body: trimmed.body,
        }).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not signed in");
        const { error } = await supabase.from("templates").insert({
          user_id: user.id, name: trimmed.name, category: category.trim() || null, subject: trimmed.subject, body: trimmed.body,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Template updated" : "Template created");
      qc.invalidateQueries({ queryKey: ["templates"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit template" : "New template"}</DialogTitle>
          <DialogDescription>Use <code className="rounded bg-muted px-1 text-xs">{`{{variable}}`}</code> to add fields you'll fill in when sending.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="t-name">Name</Label>
              <Input id="t-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Job application" maxLength={120} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-cat">Category</Label>
              <Input id="t-cat" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Outreach" maxLength={60} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-subj">Subject</Label>
            <Input id="t-subj" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Application for {{position}}" maxLength={250} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-body">Body</Label>
            <Textarea id="t-body" value={body} onChange={(e) => setBody(e.target.value)} placeholder={"Hello {{name}},\n\nI'm reaching out about {{position}} at {{company}}.\n\nThanks,\n{{sender_name}}"} rows={9} />
          </div>
          {vars.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Detected fields</Label>
              <div className="flex flex-wrap gap-1.5">
                {vars.map((v) => (<Badge key={v} variant="secondary" className="font-mono">{`{{${v}}}`}</Badge>))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending} className="gradient-brand text-primary-foreground">
            {editing ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

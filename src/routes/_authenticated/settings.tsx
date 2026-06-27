import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Mail, Link2, Unlink, Loader2, LogOut, Trash2, User } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { startGmailOAuth, getMyGmailConnection, disconnectGmail } from "@/lib/gmail.functions";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — Smart Email Sender" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const startFn = useServerFn(startGmailOAuth);
  const getConn = useServerFn(getMyGmailConnection);
  const disconnectFn = useServerFn(disconnectGmail);

  const conn = useQuery({ queryKey: ["gmail-connection"], queryFn: () => getConn() });

  const [user, setUser] = useState<{ id: string; email: string | null } | null>(null);
  const [profile, setProfile] = useState<{ full_name: string | null } | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [savingName, setSavingName] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUser({ id: user.id, email: user.email ?? null });
      const { data: p } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
      setProfile(p ?? null);
      setDisplayName(p?.full_name ?? "");
    })();
  }, []);

  const connect = useMutation({
    mutationFn: async () => startFn(),
    onSuccess: (r) => { window.location.href = r.url; },
    onError: (e: Error) => toast.error(e.message),
  });

  const disconnect = useMutation({
    mutationFn: async () => disconnectFn(),
    onSuccess: () => { toast.success("Gmail disconnected"); qc.invalidateQueries({ queryKey: ["gmail-connection"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  async function saveProfile() {
    if (!user) return;
    setSavingName(true);
    const { error } = await supabase.from("profiles").update({ full_name: displayName.trim() || null }).eq("id", user.id);
    setSavingName(false);
    if (error) toast.error(error.message); else toast.success("Profile updated");
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }

  async function deleteAccount() {
    if (!user) return;
    // best-effort cascade: delete user-owned rows; auth.users row requires admin, so we sign out after.
    await Promise.all([
      supabase.from("email_history").delete().eq("user_id", user.id),
      supabase.from("templates").delete().eq("user_id", user.id),
      supabase.from("gmail_connections").delete().eq("user_id", user.id),
      supabase.from("profiles").delete().eq("id", user.id),
    ]);
    await supabase.auth.signOut();
    toast.success("Account data deleted");
    navigate({ to: "/", replace: true });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Profile, Gmail connection, and account.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><User className="size-4" /> Profile</CardTitle>
          <CardDescription>This name appears as <code className="rounded bg-muted px-1 text-xs">{`{{sender_name}}`}</code> defaults.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input value={user?.email ?? ""} disabled />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dn">Display name</Label>
            <Input id="dn" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" maxLength={120} />
          </div>
          <div className="flex justify-end">
            <Button onClick={saveProfile} disabled={savingName}>
              {savingName && <Loader2 className="mr-2 size-4 animate-spin" />} Save
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Mail className="size-4" /> Gmail connection</CardTitle>
          <CardDescription>Emails are sent from your own Gmail account using the gmail.send scope.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {conn.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : conn.data ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-3">
                <div className="grid size-10 place-items-center rounded-lg bg-accent"><Mail className="size-5" /></div>
                <div>
                  <p className="font-medium">{conn.data.gmail_address}</p>
                  <p className="text-xs text-muted-foreground">Connected · scope {conn.data.scope?.includes("gmail.send") ? "✓ gmail.send" : conn.data.scope}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => connect.mutate()} disabled={connect.isPending}>
                  {connect.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Link2 className="mr-2 size-4" />} Reconnect
                </Button>
                <Button variant="outline" onClick={() => disconnect.mutate()} disabled={disconnect.isPending}>
                  <Unlink className="mr-2 size-4" /> Disconnect
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-border p-6 text-center">
              <div className="text-left">
                <p className="font-medium">No Gmail account connected</p>
                <p className="text-sm text-muted-foreground">Connect once to start sending. You'll be redirected to Google.</p>
              </div>
              <Button onClick={() => connect.mutate()} disabled={connect.isPending} className="gradient-brand text-primary-foreground shadow-glow">
                {connect.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Link2 className="mr-2 size-4" />} Connect Gmail
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button variant="outline" onClick={signOut}><LogOut className="mr-2 size-4" /> Sign out</Button>
          <Separator />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive"><Trash2 className="mr-2 size-4" /> Delete my data</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete all your data?</AlertDialogTitle>
                <AlertDialogDescription>
                  This removes your templates, email history, Gmail connection, and profile. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={deleteAccount}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}

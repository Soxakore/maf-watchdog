import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { addPlayer, listPlayers, refreshPlayer, deletePlayer } from "@/lib/players.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { RefreshCw, Trash2, ExternalLink, Plus, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authed/roster")({ component: RosterPage });

function RosterPage() {
  const qc = useQueryClient();
  const list = useServerFn(listPlayers);
  const add = useServerFn(addPlayer);
  const refresh = useServerFn(refreshPlayer);
  const del = useServerFn(deletePlayer);

  const { data, isLoading } = useQuery({ queryKey: ["players"], queryFn: () => list() });

  const [fid, setFid] = useState("");
  const [alliance, setAlliance] = useState("MAF");
  const [power, setPower] = useState("");

  const addMut = useMutation({
    mutationFn: (vars: { fid: string; alliance: string; power: string }) =>
      add({
        data: {
          fid: vars.fid,
          alliance: vars.alliance || undefined,
          power: vars.power ? Number(vars.power) : undefined,
        } as never,
      }),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success(`Added ${res.nickname} (state ${res.state})`);
        setFid(""); setPower("");
        qc.invalidateQueries({ queryKey: ["players"] });
        qc.invalidateQueries({ queryKey: ["alerts-unread"] });
      } else {
        toast.error(`API: ${res.status}`);
      }
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const refreshMut = useMutation({
    mutationFn: (f: number) => refresh({ data: { fid: f } as never }),
    onSuccess: (res, f) => {
      if (res.ok) toast.success(`Refreshed FID ${f}`);
      else toast.error(`FID ${f}: ${res.status}`);
      qc.invalidateQueries({ queryKey: ["players"] });
      qc.invalidateQueries({ queryKey: ["alerts-unread"] });
    },
  });

  const delMut = useMutation({
    mutationFn: (f: number) => del({ data: { fid: f } as never }),
    onSuccess: () => { toast.success("Removed"); qc.invalidateQueries({ queryKey: ["players"] }); },
  });

  function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!fid) return;
    addMut.mutate({ fid, alliance, power });
  }

  const players = data?.players ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Roster</h1>
          <p className="text-sm text-muted-foreground">
            {players.length} tracked · daily snapshot 06:00 UTC
          </p>
        </div>
      </div>

      <Card className="p-5">
        <form onSubmit={onAdd} className="grid gap-3 md:grid-cols-[1fr_120px_140px_auto] md:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="fid">Player FID</Label>
            <Input id="fid" required value={fid} onChange={(e) => setFid(e.target.value)} placeholder="e.g. 12345678" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="alliance">Alliance</Label>
            <Input id="alliance" value={alliance} onChange={(e) => setAlliance(e.target.value)} placeholder="MAF" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="power">Power (opt.)</Label>
            <Input id="power" type="number" value={power} onChange={(e) => setPower(e.target.value)} placeholder="0" />
          </div>
          <Button type="submit" disabled={addMut.isPending}>
            <Plus className="mr-1 size-4" /> {addMut.isPending ? "Fetching…" : "Track"}
          </Button>
        </form>
      </Card>

      <Card className="overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5">Player</th>
              <th className="px-4 py-2.5">FID</th>
              <th className="px-4 py-2.5">State</th>
              <th className="px-4 py-2.5">Furnace</th>
              <th className="px-4 py-2.5">Alliance</th>
              <th className="px-4 py-2.5">Power</th>
              <th className="px-4 py-2.5">Last check</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
            )}
            {!isLoading && players.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">No players tracked yet. Add one above.</td></tr>
            )}
            {players.map((p) => {
              const offState = p.state != null && p.state !== 4285;
              const offAlliance = p.alliance && p.alliance !== "MAF";
              return (
                <tr key={p.fid} className="hover:bg-secondary/30">
                  <td className="px-4 py-3 font-medium">
                    <Link to="/player/$fid" params={{ fid: String(p.fid) }} className="hover:underline">
                      {p.nickname ?? "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{p.fid}</td>
                  <td className="px-4 py-3">
                    {p.state == null ? "—" : (
                      <Badge variant={offState ? "destructive" : "secondary"}>
                        {offState && <AlertTriangle className="mr-1 size-3" />}
                        {p.state}
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono">{p.furnace_level ?? "—"}</td>
                  <td className="px-4 py-3">
                    {p.alliance ? (
                      <Badge variant={offAlliance ? "destructive" : "default"}>{p.alliance}</Badge>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {p.power ? p.power.toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {p.last_checked_at ? new Date(p.last_checked_at).toLocaleString() : "never"}
                    {p.last_api_status && p.last_api_status !== "ok" && (
                      <div className="text-destructive">{p.last_api_status}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => refreshMut.mutate(p.fid)}>
                        <RefreshCw className="size-3.5" />
                      </Button>
                      <Link to="/player/$fid" params={{ fid: String(p.fid) }}>
                        <Button size="icon" variant="ghost"><ExternalLink className="size-3.5" /></Button>
                      </Link>
                      <Button
                        size="icon" variant="ghost"
                        onClick={() => { if (confirm(`Remove ${p.nickname}?`)) delMut.mutate(p.fid); }}
                      ><Trash2 className="size-3.5" /></Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getPlayerHistory, refreshPlayer, updateManualStats } from "@/lib/players.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authed/player/$fid")({ component: PlayerPage });

function PlayerPage() {
  const { fid } = Route.useParams();
  const qc = useQueryClient();
  const fetchHistory = useServerFn(getPlayerHistory);
  const refresh = useServerFn(refreshPlayer);
  const update = useServerFn(updateManualStats);

  const { data, isLoading } = useQuery({
    queryKey: ["player", fid],
    queryFn: () => fetchHistory({ data: { fid: Number(fid) } as never }),
  });

  const [alliance, setAlliance] = useState("");
  const [power, setPower] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (data?.player) {
      setAlliance(data.player.alliance ?? "");
      setPower(data.player.power != null ? String(data.player.power) : "");
      setNotes(data.player.notes ?? "");
    }
  }, [data]);

  const refreshMut = useMutation({
    mutationFn: () => refresh({ data: { fid: Number(fid) } as never }),
    onSuccess: () => {
      toast.success("Refreshed");
      qc.invalidateQueries({ queryKey: ["player", fid] });
    },
  });

  const updateMut = useMutation({
    mutationFn: () =>
      update({
        data: {
          fid: Number(fid),
          alliance: alliance || null,
          power: power ? Number(power) : null,
          notes: notes || null,
        } as never,
      }),
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["player", fid] });
      qc.invalidateQueries({ queryKey: ["players"] });
      qc.invalidateQueries({ queryKey: ["alerts-unread"] });
    },
  });

  if (isLoading) return <div className="text-muted-foreground">Loading…</div>;
  if (!data?.player) return <div className="text-muted-foreground">Not found.</div>;

  const p = data.player;
  const offState = p.state != null && p.state !== 4285;

  return (
    <div className="space-y-6">
      <Link
        to="/roster"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to roster
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{p.nickname}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-mono text-muted-foreground">FID {p.fid}</span>
            <Badge variant={offState ? "destructive" : "secondary"}>State {p.state}</Badge>
            <Badge variant="secondary">FC {p.furnace_level}</Badge>
            {p.alliance && (
              <Badge variant={p.alliance === "MAF" ? "default" : "destructive"}>
                [{p.alliance}]
              </Badge>
            )}
            {p.power != null && <Badge variant="secondary">Power {p.power.toLocaleString()}</Badge>}
            {p.api_source && <Badge variant="outline">{p.api_source}</Badge>}
          </div>
        </div>
        <Button
          variant="outline"
          onClick={() => refreshMut.mutate()}
          disabled={refreshMut.isPending}
        >
          <RefreshCw className={`mr-1.5 size-4 ${refreshMut.isPending ? "animate-spin" : ""}`} />{" "}
          Refresh
        </Button>
      </div>

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Tracked stats
        </h2>
        <div className="grid gap-3 md:grid-cols-[140px_180px_1fr_auto] md:items-end">
          <div className="space-y-1.5">
            <Label>Alliance fallback</Label>
            <Input
              value={alliance}
              onChange={(e) => setAlliance(e.target.value)}
              placeholder="MAF"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Power fallback</Label>
            <Input type="number" value={power} onChange={(e) => setPower(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <Button onClick={() => updateMut.mutate()} disabled={updateMut.isPending}>
            <Save className="mr-1.5 size-4" /> Save
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          API values update automatically when available. Fallbacks stay in place when the API does
          not provide alliance or power.
        </p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-0">
          <h2 className="border-b border-border px-4 py-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Snapshot history
          </h2>
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">State</th>
                  <th className="px-3 py-2">FC</th>
                  <th className="px-3 py-2">Alliance</th>
                  <th className="px-3 py-2">Power</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.snapshots.map((s) => (
                  <tr key={s.id}>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {new Date(s.captured_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 font-mono">{s.state ?? "—"}</td>
                    <td className="px-3 py-2 font-mono">{s.furnace_level ?? "—"}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span>{s.alliance ?? "—"}</span>
                        {s.alliance_source && <Badge variant="outline">{s.alliance_source}</Badge>}
                      </div>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span>{s.power != null ? s.power.toLocaleString() : "—"}</span>
                        {s.power_source && <Badge variant="outline">{s.power_source}</Badge>}
                      </div>
                    </td>
                  </tr>
                ))}
                {data.snapshots.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                      No history yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-0">
          <h2 className="border-b border-border px-4 py-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Alerts
          </h2>
          <div className="max-h-96 overflow-auto">
            <ul className="divide-y divide-border">
              {data.alerts.map((a) => (
                <li key={a.id} className="px-4 py-3">
                  <div className="text-sm">{a.message}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {new Date(a.created_at).toLocaleString()}
                  </div>
                </li>
              ))}
              {data.alerts.length === 0 && (
                <li className="px-4 py-6 text-center text-sm text-muted-foreground">No alerts.</li>
              )}
            </ul>
          </div>
        </Card>
      </div>
    </div>
  );
}

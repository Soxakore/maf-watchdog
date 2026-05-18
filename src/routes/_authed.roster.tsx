import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  addPlayer,
  listPlayers,
  refreshPlayer,
  deletePlayer,
  updateManualStats,
} from "@/lib/players.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { RefreshCw, Trash2, ExternalLink, Plus, AlertTriangle, Save } from "lucide-react";

export const Route = createFileRoute("/_authed/roster")({ component: RosterPage });

function parsePowerInput(value: string): number | null {
  const trimmed = value.trim().toLowerCase().replace(/,/g, "").replace(/\s/g, "");
  if (!trimmed) return null;

  const match = trimmed.match(/^(\d+(?:\.\d+)?)([kmb])?$/);
  if (!match) return Number.NaN;

  const amount = Number(match[1]);
  const multiplier =
    match[2] === "b" ? 1_000_000_000 : match[2] === "m" ? 1_000_000 : match[2] === "k" ? 1_000 : 1;
  return Math.round(amount * multiplier);
}

function powerChanged(draft: string, saved: number | null): boolean {
  const parsed = parsePowerInput(draft);
  if (Number.isNaN(parsed)) return true;
  return parsed !== saved;
}

function RosterPage() {
  const qc = useQueryClient();
  const list = useServerFn(listPlayers);
  const add = useServerFn(addPlayer);
  const refresh = useServerFn(refreshPlayer);
  const del = useServerFn(deletePlayer);
  const update = useServerFn(updateManualStats);

  const { data, isLoading } = useQuery({ queryKey: ["players"], queryFn: () => list() });

  const [fid, setFid] = useState("");
  const [alliance, setAlliance] = useState("MAF");
  const [power, setPower] = useState("");
  const [powerDrafts, setPowerDrafts] = useState<Record<string, string>>({});
  const players = useMemo(() => data?.players ?? [], [data?.players]);

  useEffect(() => {
    setPowerDrafts((current) => {
      const next = { ...current };
      for (const player of players) {
        const key = String(player.fid);
        if (!(key in next)) next[key] = player.power != null ? String(player.power) : "";
      }
      return next;
    });
  }, [players]);

  const addMut = useMutation({
    mutationFn: (vars: { fid: string; alliance: string; power: string }) => {
      const parsedPower = parsePowerInput(vars.power);
      if (Number.isNaN(parsedPower)) {
        throw new Error("Power must be a number, or use K/M/B suffix.");
      }
      return add({
        data: {
          fid: vars.fid,
          alliance: vars.alliance || undefined,
          power: parsedPower ?? undefined,
        } as never,
      });
    },
    onSuccess: (res) => {
      if (res.ok) {
        toast.success(`Added ${res.nickname} (state ${res.state})`);
        setFid("");
        setPower("");
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
    onSuccess: () => {
      toast.success("Removed");
      qc.invalidateQueries({ queryKey: ["players"] });
    },
  });

  const updatePowerMut = useMutation({
    mutationFn: (vars: {
      fid: number;
      nickname: string | null;
      alliance: string | null;
      notes: string | null;
      power: string;
    }) => {
      const parsedPower = parsePowerInput(vars.power);
      if (Number.isNaN(parsedPower)) {
        throw new Error("Power must be a number, or use K/M/B suffix.");
      }

      return update({
        data: {
          fid: vars.fid,
          alliance: vars.alliance,
          power: parsedPower,
          notes: vars.notes,
        } as never,
      });
    },
    onSuccess: (_, vars) => {
      toast.success(`Saved power for ${vars.nickname ?? `FID ${vars.fid}`}`);
      qc.invalidateQueries({ queryKey: ["players"] });
      qc.invalidateQueries({ queryKey: ["alerts-unread"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!fid) return;
    addMut.mutate({ fid, alliance, power });
  }

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
        <form
          onSubmit={onAdd}
          className="grid gap-3 md:grid-cols-[1fr_120px_140px_auto] md:items-end"
        >
          <div className="space-y-1.5">
            <Label htmlFor="fid">Player FID</Label>
            <Input
              id="fid"
              required
              value={fid}
              onChange={(e) => setFid(e.target.value)}
              placeholder="e.g. 12345678"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="alliance">Alliance</Label>
            <Input
              id="alliance"
              value={alliance}
              onChange={(e) => setAlliance(e.target.value)}
              placeholder="MAF"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="power">Power</Label>
            <Input
              id="power"
              inputMode="decimal"
              value={power}
              onChange={(e) => setPower(e.target.value)}
              placeholder="85M"
            />
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
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {!isLoading && players.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                  No players tracked yet. Add one above.
                </td>
              </tr>
            )}
            {players.map((p) => {
              const offState = p.state != null && p.state !== 4285;
              const offAlliance = p.alliance && p.alliance !== "MAF";
              const draftPower = powerDrafts[String(p.fid)] ?? "";
              const parsedDraftPower = parsePowerInput(draftPower);
              const invalidPower = Number.isNaN(parsedDraftPower);
              return (
                <tr key={p.fid} className="hover:bg-secondary/30">
                  <td className="px-4 py-3 font-medium">
                    <Link
                      to="/player/$fid"
                      params={{ fid: String(p.fid) }}
                      className="hover:underline"
                    >
                      {p.nickname ?? "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{p.fid}</td>
                  <td className="px-4 py-3">
                    {p.state == null ? (
                      "—"
                    ) : (
                      <Badge variant={offState ? "destructive" : "secondary"}>
                        {offState && <AlertTriangle className="mr-1 size-3" />}
                        {p.state}
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono">{p.furnace_level ?? "—"}</td>
                  <td className="px-4 py-3">
                    {p.alliance ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant={offAlliance ? "destructive" : "default"}>
                          {p.alliance}
                        </Badge>
                        {p.alliance_source && <Badge variant="outline">{p.alliance_source}</Badge>}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    <div className="flex min-w-44 flex-wrap items-center gap-1.5">
                      <Input
                        aria-label={`Power for ${p.nickname ?? `FID ${p.fid}`}`}
                        className={`h-8 w-28 font-mono text-xs ${invalidPower ? "border-destructive" : ""}`}
                        inputMode="decimal"
                        value={draftPower}
                        onChange={(e) =>
                          setPowerDrafts((current) => ({
                            ...current,
                            [String(p.fid)]: e.target.value,
                          }))
                        }
                        placeholder="—"
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={
                          updatePowerMut.isPending ||
                          invalidPower ||
                          !powerChanged(draftPower, p.power ?? null)
                        }
                        onClick={() =>
                          updatePowerMut.mutate({
                            fid: p.fid,
                            nickname: p.nickname,
                            alliance: p.alliance,
                            notes: p.notes,
                            power: draftPower,
                          })
                        }
                      >
                        <Save className="size-3.5" />
                      </Button>
                      {p.power_source && <Badge variant="outline">{p.power_source}</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {p.last_checked_at ? new Date(p.last_checked_at).toLocaleString() : "never"}
                    {p.api_source && <div>{p.api_source}</div>}
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
                        <Button size="icon" variant="ghost">
                          <ExternalLink className="size-3.5" />
                        </Button>
                      </Link>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          if (confirm(`Remove ${p.nickname}?`)) delMut.mutate(p.fid);
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
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

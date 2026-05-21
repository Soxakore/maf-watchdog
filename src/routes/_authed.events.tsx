import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import {
  listEvents,
  createEvent,
  deleteEvent,
  getEventDetail,
  toggleAttendance,
} from "@/lib/events.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Plus, Trash2, Flame, ChevronRight, X } from "lucide-react";

export const Route = createFileRoute("/_authed/events")({ component: EventsPage });

const EVENT_TYPES = [
  { value: "bear", label: "Bear Trap" },
  { value: "cj", label: "Canyon Clash (CJ)" },
  { value: "foundry", label: "Foundry Battle" },
  { value: "svs", label: "State vs State" },
  { value: "kvk", label: "KvK" },
  { value: "alliance_mobi", label: "Alliance Mobilization" },
  { value: "other", label: "Other" },
];

const typeColor: Record<string, string> = {
  bear: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  cj: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  foundry: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  svs: "bg-red-500/15 text-red-400 border-red-500/30",
  kvk: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  alliance_mobi: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  other: "bg-secondary text-muted-foreground border-border",
};

function EventsPage() {
  const qc = useQueryClient();
  const list = useServerFn(listEvents);
  const create = useServerFn(createEvent);
  const del = useServerFn(deleteEvent);

  const { data, isLoading } = useQuery({ queryKey: ["events"], queryFn: () => list() });

  const [name, setName] = useState("");
  const [type, setType] = useState("bear");
  const [when, setWhen] = useState(() => new Date().toISOString().slice(0, 16));
  const [notes, setNotes] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const addMut = useMutation({
    mutationFn: () =>
      create({
        data: {
          name,
          event_type: type,
          occurred_at: new Date(when).toISOString(),
          notes: notes || undefined,
        } as never,
      }),
    onSuccess: () => {
      toast.success("Event created");
      setName(""); setNotes("");
      qc.invalidateQueries({ queryKey: ["events"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } as never }),
    onSuccess: () => {
      toast.success("Removed");
      setSelectedId(null);
      qc.invalidateQueries({ queryKey: ["events"] });
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name) return;
    addMut.mutate();
  }

  const events = data?.events ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Events</h1>
        <p className="text-sm text-muted-foreground">
          Track participation in Bear, CJ, Foundry and other alliance events.
        </p>
      </div>

      <Card className="p-5">
        <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-[1fr_180px_200px_auto] md:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="ev-name">Event name</Label>
            <Input id="ev-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Bear Trap #42" />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {EVENT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ev-when">When</Label>
            <Input id="ev-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </div>
          <Button type="submit" disabled={addMut.isPending}>
            <Plus className="mr-1 size-4" /> {addMut.isPending ? "Creating…" : "Create"}
          </Button>
          <div className="md:col-span-4 space-y-1.5">
            <Label htmlFor="ev-notes">Notes (optional)</Label>
            <Input id="ev-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Result, score, comments…" />
          </div>
        </form>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <Card className="overflow-hidden p-0">
          <h2 className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            All events
          </h2>
          <ul className="divide-y divide-border max-h-[600px] overflow-auto">
            {isLoading && <li className="px-4 py-6 text-center text-muted-foreground">Loading…</li>}
            {!isLoading && events.length === 0 && (
              <li className="px-4 py-6 text-center text-muted-foreground">No events yet.</li>
            )}
            {events.map((e) => {
              const typeLabel = EVENT_TYPES.find((t) => t.value === e.event_type)?.label ?? e.event_type;
              const active = selectedId === e.id;
              return (
                <li
                  key={e.id}
                  className={`flex cursor-pointer items-center justify-between gap-3 px-4 py-3 hover:bg-secondary/40 ${active ? "bg-secondary/60" : ""}`}
                  onClick={() => setSelectedId(e.id)}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Flame className="size-3.5 text-primary" />
                      <span className="truncate font-medium">{e.name}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline" className={typeColor[e.event_type] ?? typeColor.other}>
                        {typeLabel}
                      </Badge>
                      <span>{new Date(e.occurred_at).toLocaleString()}</span>
                      <span className="font-mono">· {(e as { attendees: number }).attendees} attended</span>
                    </div>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </li>
              );
            })}
          </ul>
        </Card>

        {selectedId ? (
          <EventDetail
            id={selectedId}
            onClose={() => setSelectedId(null)}
            onDelete={() => {
              if (confirm("Delete this event?")) delMut.mutate(selectedId);
            }}
          />
        ) : (
          <Card className="grid place-items-center p-10 text-sm text-muted-foreground">
            Select an event to mark attendance.
          </Card>
        )}
      </div>
    </div>
  );
}

function EventDetail({
  id,
  onClose,
  onDelete,
}: {
  id: string;
  onClose: () => void;
  onDelete: () => void;
}) {
  const qc = useQueryClient();
  const fetchDetail = useServerFn(getEventDetail);
  const toggle = useServerFn(toggleAttendance);

  const { data, isLoading } = useQuery({
    queryKey: ["event", id],
    queryFn: () => fetchDetail({ data: { id } as never }),
  });

  const mut = useMutation({
    mutationFn: (vars: { fid: number; participated: boolean; score?: number | null }) =>
      toggle({
        data: { event_id: id, fid: vars.fid, participated: vars.participated, score: vars.score ?? null } as never,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["event", id] });
      qc.invalidateQueries({ queryKey: ["events"] });
    },
  });

  if (isLoading || !data?.event) {
    return <Card className="p-6 text-sm text-muted-foreground">Loading…</Card>;
  }

  const attMap = new Map(data.attendance.map((a) => [a.fid, a]));
  const attendedCount = data.attendance.filter((a) => a.participated).length;

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <div className="text-base font-semibold">{data.event.name}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {new Date(data.event.occurred_at).toLocaleString()} · {attendedCount}/{data.players.length} attended
          </div>
          {data.event.notes && (
            <div className="mt-1 text-xs text-muted-foreground">{data.event.notes}</div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" onClick={onDelete}>
            <Trash2 className="size-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>
      </div>

      <div className="max-h-[560px] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-card text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Player</th>
              <th className="px-4 py-2">Alliance</th>
              <th className="px-4 py-2 text-center">Attended</th>
              <th className="px-4 py-2">Score</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.players.map((p) => {
              const att = attMap.get(p.fid);
              const checked = att?.participated ?? false;
              return (
                <tr key={p.fid} className="hover:bg-secondary/30">
                  <td className="px-4 py-2 font-medium">{p.nickname ?? p.fid}</td>
                  <td className="px-4 py-2">
                    {p.alliance ? <Badge variant="secondary">{p.alliance}</Badge> : "—"}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) =>
                        mut.mutate({ fid: p.fid, participated: !!v, score: att?.score ?? null })
                      }
                    />
                  </td>
                  <td className="px-4 py-2">
                    <Input
                      type="number"
                      defaultValue={att?.score ?? ""}
                      placeholder="—"
                      className="h-7 w-28 text-xs"
                      onBlur={(e) => {
                        const val = e.target.value ? Number(e.target.value) : null;
                        if (val !== (att?.score ?? null)) {
                          mut.mutate({ fid: p.fid, participated: checked, score: val });
                        }
                      }}
                    />
                  </td>
                </tr>
              );
            })}
            {data.players.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No players in roster.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

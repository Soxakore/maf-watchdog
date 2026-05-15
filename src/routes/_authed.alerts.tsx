import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listAlerts, markAlertRead } from "@/lib/players.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, CheckCheck } from "lucide-react";

export const Route = createFileRoute("/_authed/alerts")({ component: AlertsPage });

const TYPE_VARIANT: Record<string, "default" | "destructive" | "secondary"> = {
  alliance_left: "destructive",
  state_change: "destructive",
  power_drop: "destructive",
  alliance_joined: "default",
  power_rise: "default",
  name_change: "secondary",
  furnace_change: "secondary",
  alliance_change: "secondary",
};

function AlertsPage() {
  const qc = useQueryClient();
  const list = useServerFn(listAlerts);
  const mark = useServerFn(markAlertRead);
  const { data, isLoading } = useQuery({ queryKey: ["alerts"], queryFn: () => list() });

  const markMut = useMutation({
    mutationFn: (vars: { id?: string; allRead?: boolean }) => mark({ data: vars as never }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alerts"] });
      qc.invalidateQueries({ queryKey: ["alerts-unread"] });
    },
  });

  const alerts = data?.alerts ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Alerts</h1>
          <p className="text-sm text-muted-foreground">{alerts.filter(a => !a.is_read).length} unread</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => markMut.mutate({ allRead: true })}>
          <CheckCheck className="mr-1.5 size-4" /> Mark all read
        </Button>
      </div>

      <Card className="overflow-hidden p-0">
        {isLoading && <div className="px-4 py-8 text-center text-muted-foreground">Loading…</div>}
        {!isLoading && alerts.length === 0 && (
          <div className="px-4 py-12 text-center text-sm text-muted-foreground">
            No alerts yet. Daily snapshot will create them as players change.
          </div>
        )}
        <ul className="divide-y divide-border">
          {alerts.map((a) => {
            const variant = TYPE_VARIANT[a.alert_type] ?? "secondary";
            return (
              <li key={a.id} className={`flex items-start gap-3 px-4 py-3 ${a.is_read ? "opacity-60" : ""}`}>
                <Badge variant={variant} className="mt-0.5 shrink-0 capitalize">
                  {a.alert_type.replace(/_/g, " ")}
                </Badge>
                <div className="flex-1">
                  <div className="font-medium">
                    {(a as unknown as { players?: { nickname?: string } }).players?.nickname ?? `FID ${a.fid}`}
                  </div>
                  <div className="text-sm text-muted-foreground">{a.message}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground/70">
                    {new Date(a.created_at).toLocaleString()}
                  </div>
                </div>
                {!a.is_read && (
                  <Button size="icon" variant="ghost" onClick={() => markMut.mutate({ id: a.id })}>
                    <Check className="size-4" />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listMembers, setRole, getMyAccess } from "@/lib/members.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Shield, UserCheck, UserX } from "lucide-react";

export const Route = createFileRoute("/_authed/members")({ component: MembersPage });

function MembersPage() {
  const qc = useQueryClient();
  const list = useServerFn(listMembers);
  const access = useServerFn(getMyAccess);
  const change = useServerFn(setRole);

  const me = useQuery({ queryKey: ["my-access"], queryFn: () => access() });
  const { data, isLoading, error } = useQuery({
    queryKey: ["members"],
    queryFn: () => list(),
    enabled: me.data?.isAdmin === true,
  });

  const mut = useMutation({
    mutationFn: (v: { userId: string; role: "admin" | "member"; grant: boolean }) =>
      change({ data: v as never }),
    onSuccess: () => {
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["members"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (me.isLoading) return <div className="text-muted-foreground">Loading…</div>;
  if (!me.data?.isAdmin) {
    return (
      <Card className="p-6">
        <h1 className="text-lg font-semibold">Admins only</h1>
        <p className="mt-1 text-sm text-muted-foreground">You need the admin role to manage members.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Members</h1>
        <p className="text-sm text-muted-foreground">
          Grant or revoke access to MAF Tracker. New sign-ups have no access until you approve them.
        </p>
      </div>

      <Card className="overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5">Email</th>
              <th className="px-4 py-2.5">Roles</th>
              <th className="px-4 py-2.5">Last sign-in</th>
              <th className="px-4 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
            )}
            {error && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-destructive">{(error as Error).message}</td></tr>
            )}
            {data?.members.map((m) => {
              const isAdmin = m.roles.includes("admin");
              const isMember = m.roles.includes("member") || isAdmin;
              const isSelf = m.id === me.data.userId;
              return (
                <tr key={m.id} className="hover:bg-secondary/30">
                  <td className="px-4 py-3">
                    {m.email} {isSelf && <span className="text-xs text-muted-foreground">(you)</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      {isAdmin && <Badge><Shield className="mr-1 size-3" /> admin</Badge>}
                      {m.roles.includes("member") && <Badge variant="secondary">member</Badge>}
                      {m.roles.length === 0 && <span className="text-muted-foreground">pending</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {m.last_sign_in_at ? new Date(m.last_sign_in_at).toLocaleString() : "never"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      {!isMember ? (
                        <Button size="sm" variant="outline" disabled={mut.isPending}
                          onClick={() => mut.mutate({ userId: m.id, role: "member", grant: true })}>
                          <UserCheck className="mr-1 size-3.5" /> Grant access
                        </Button>
                      ) : !isAdmin ? (
                        <Button size="sm" variant="outline" disabled={mut.isPending}
                          onClick={() => mut.mutate({ userId: m.id, role: "admin", grant: true })}>
                          <Shield className="mr-1 size-3.5" /> Make admin
                        </Button>
                      ) : null}
                      {isAdmin && !isSelf && (
                        <Button size="sm" variant="ghost" disabled={mut.isPending}
                          onClick={() => mut.mutate({ userId: m.id, role: "admin", grant: false })}>
                          Demote
                        </Button>
                      )}
                      {m.roles.includes("member") && (
                        <Button size="sm" variant="ghost" disabled={mut.isPending}
                          onClick={() => mut.mutate({ userId: m.id, role: "member", grant: false })}>
                          <UserX className="mr-1 size-3.5" /> Remove
                        </Button>
                      )}
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

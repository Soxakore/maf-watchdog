import { Link, useRouter } from "@tanstack/react-router";
import { Snowflake, Users, Bell, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listAlerts } from "@/lib/players.functions";

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  const fetchAlerts = useServerFn(listAlerts);
  const { data } = useQuery({
    queryKey: ["alerts-unread"],
    queryFn: () => fetchAlerts(),
    refetchInterval: 60_000,
  });
  const unread = (data?.alerts ?? []).filter((a) => !a.is_read).length;

  async function logout() {
    await supabase.auth.signOut();
    router.navigate({ to: "/login" });
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/60 bg-background/40 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <Snowflake className="size-5 text-primary" />
            <span className="font-semibold tracking-tight">MAF Tracker</span>
            <span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
              S4285
            </span>
          </Link>
          <nav className="flex items-center gap-1">
            <Link
              to="/"
              activeOptions={{ exact: true }}
              activeProps={{ className: "bg-secondary text-foreground" }}
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
            >
              <Users className="size-4" /> Roster
            </Link>
            <Link
              to="/alerts"
              activeProps={{ className: "bg-secondary text-foreground" }}
              className="relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
            >
              <Bell className="size-4" /> Alerts
              {unread > 0 && (
                <span className="ml-1 rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-mono text-destructive-foreground">
                  {unread}
                </span>
              )}
            </Link>
            <button
              onClick={logout}
              title={email ?? ""}
              className="ml-2 flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
            >
              <LogOut className="size-4" />
            </button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}

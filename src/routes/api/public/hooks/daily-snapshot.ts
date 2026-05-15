import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fetchWosPlayer } from "@/lib/wos.server";
import { snapshotAndDiff } from "@/lib/snapshot.server";

export const Route = createFileRoute("/api/public/hooks/daily-snapshot")({
  server: {
    handlers: {
      POST: async () => {
        const { data: players, error } = await supabaseAdmin
          .from("players")
          .select("fid, alliance, power")
          .eq("is_active", true);
        if (error) {
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        let ok = 0;
        let failed = 0;
        for (const row of players ?? []) {
          const res = await fetchWosPlayer(row.fid);
          if (!res.ok || !res.data) {
            failed++;
            await supabaseAdmin
              .from("players")
              .update({
                last_checked_at: new Date().toISOString(),
                last_api_status: res.status,
              })
              .eq("fid", row.fid);
            continue;
          }
          const p = res.data;
          await supabaseAdmin
            .from("players")
            .update({
              nickname: p.nickname,
              state: p.kid,
              furnace_level: p.stove_lv,
              avatar_image: p.avatar_image ?? null,
              last_checked_at: new Date().toISOString(),
              last_api_status: "ok",
            })
            .eq("fid", row.fid);

          await snapshotAndDiff(supabaseAdmin, p.fid, {
            nickname: p.nickname,
            state: p.kid,
            furnace_level: p.stove_lv,
            alliance: row.alliance,
            power: row.power,
          });
          ok++;
          // small delay to be polite to the WOS API
          await new Promise((r) => setTimeout(r, 250));
        }

        return new Response(JSON.stringify({ ok: true, processed: ok, failed }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});

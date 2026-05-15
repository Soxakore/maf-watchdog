import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchWosPlayer } from "./wos.server";
import { snapshotAndDiff } from "./snapshot.server";

export const TARGET_STATE = 4285;

export const addPlayer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        fid: z.coerce.number().int().positive(),
        alliance: z.string().max(32).optional(),
        power: z.coerce.number().int().nonnegative().optional(),
        notes: z.string().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const result = await fetchWosPlayer(data.fid);
    if (!result.ok || !result.data) {
      return { ok: false, status: result.status };
    }
    const p = result.data;

    const { error: upsertErr } = await supabase.from("players").upsert(
      {
        fid: p.fid,
        nickname: p.nickname,
        state: p.kid,
        furnace_level: p.stove_lv,
        avatar_image: p.avatar_image ?? null,
        alliance: data.alliance ?? null,
        power: data.power ?? null,
        notes: data.notes ?? null,
        added_by: userId,
        last_checked_at: new Date().toISOString(),
        last_api_status: "ok",
        is_active: true,
      },
      { onConflict: "fid" },
    );
    if (upsertErr) throw new Error(upsertErr.message);

    await snapshotAndDiff(supabase, p.fid, {
      nickname: p.nickname,
      state: p.kid,
      furnace_level: p.stove_lv,
      alliance: data.alliance ?? null,
      power: data.power ?? null,
    });

    return { ok: true, status: "ok", fid: p.fid, nickname: p.nickname, state: p.kid };
  });

export const refreshPlayer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ fid: z.coerce.number().int().positive() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: existing } = await supabase
      .from("players")
      .select("alliance, power")
      .eq("fid", data.fid)
      .single();

    const result = await fetchWosPlayer(data.fid);
    if (!result.ok || !result.data) {
      await supabase
        .from("players")
        .update({ last_checked_at: new Date().toISOString(), last_api_status: result.status })
        .eq("fid", data.fid);
      return { ok: false, status: result.status };
    }
    const p = result.data;

    await supabase
      .from("players")
      .update({
        nickname: p.nickname,
        state: p.kid,
        furnace_level: p.stove_lv,
        avatar_image: p.avatar_image ?? null,
        last_checked_at: new Date().toISOString(),
        last_api_status: "ok",
      })
      .eq("fid", data.fid);

    await snapshotAndDiff(supabase, p.fid, {
      nickname: p.nickname,
      state: p.kid,
      furnace_level: p.stove_lv,
      alliance: existing?.alliance ?? null,
      power: existing?.power ?? null,
    });

    return { ok: true, status: "ok" };
  });

export const updateManualStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        fid: z.coerce.number().int().positive(),
        alliance: z.string().max(32).nullable(),
        power: z.coerce.number().int().nonnegative().nullable(),
        notes: z.string().max(500).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: existing } = await supabase
      .from("players")
      .select("nickname, state, furnace_level")
      .eq("fid", data.fid)
      .single();
    if (!existing) throw new Error("Player not found");

    await supabase
      .from("players")
      .update({
        alliance: data.alliance,
        power: data.power,
        notes: data.notes ?? null,
      })
      .eq("fid", data.fid);

    await snapshotAndDiff(supabase, data.fid, {
      nickname: existing.nickname,
      state: existing.state,
      furnace_level: existing.furnace_level,
      alliance: data.alliance,
      power: data.power,
    });
    return { ok: true };
  });

export const deletePlayer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ fid: z.coerce.number().int().positive() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("players").delete().eq("fid", data.fid);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listPlayers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("players")
      .select("*")
      .order("nickname", { ascending: true });
    if (error) throw new Error(error.message);
    return { players: data ?? [] };
  });

export const getPlayerHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ fid: z.coerce.number().int().positive() }).parse(input))
  .handler(async ({ data, context }) => {
    const [{ data: player }, { data: snapshots }, { data: alerts }] = await Promise.all([
      context.supabase.from("players").select("*").eq("fid", data.fid).single(),
      context.supabase
        .from("snapshots")
        .select("*")
        .eq("fid", data.fid)
        .order("captured_at", { ascending: false })
        .limit(200),
      context.supabase
        .from("alerts")
        .select("*")
        .eq("fid", data.fid)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    return { player, snapshots: snapshots ?? [], alerts: alerts ?? [] };
  });

export const listAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("alerts")
      .select("*, players(nickname)")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return { alerts: data ?? [] };
  });

export const markAlertRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ id: z.string().uuid().optional(), allRead: z.boolean().optional() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (data.allRead) {
      await context.supabase.from("alerts").update({ is_read: true }).eq("is_read", false);
    } else if (data.id) {
      await context.supabase.from("alerts").update({ is_read: true }).eq("id", data.id);
    }
    return { ok: true };
  });

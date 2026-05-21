import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: events, error } = await context.supabase
      .from("events")
      .select("*")
      .order("occurred_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    const ids = (events ?? []).map((e) => e.id);
    let counts: Record<string, number> = {};
    if (ids.length) {
      const { data: att } = await context.supabase
        .from("event_attendance")
        .select("event_id, participated")
        .in("event_id", ids);
      counts = (att ?? []).reduce((acc: Record<string, number>, a) => {
        if (a.participated) acc[a.event_id] = (acc[a.event_id] ?? 0) + 1;
        return acc;
      }, {});
    }
    return { events: (events ?? []).map((e) => ({ ...e, attendees: counts[e.id] ?? 0 })) };
  });

export const createEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        name: z.string().min(1).max(120),
        event_type: z.string().min(1).max(40),
        occurred_at: z.string().min(1),
        notes: z.string().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("events")
      .insert({
        name: data.name,
        event_type: data.event_type,
        occurred_at: data.occurred_at,
        notes: data.notes ?? null,
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { event: row };
  });

export const deleteEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("events").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getEventDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const [{ data: event }, { data: attendance }, { data: players }] = await Promise.all([
      context.supabase.from("events").select("*").eq("id", data.id).single(),
      context.supabase.from("event_attendance").select("*").eq("event_id", data.id),
      context.supabase.from("players").select("fid, nickname, alliance").order("nickname"),
    ]);
    return { event, attendance: attendance ?? [], players: players ?? [] };
  });

export const toggleAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        event_id: z.string().uuid(),
        fid: z.coerce.number().int().positive(),
        participated: z.boolean(),
        score: z.coerce.number().int().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("event_attendance")
      .upsert(
        {
          event_id: data.event_id,
          fid: data.fid,
          participated: data.participated,
          score: data.score ?? null,
        },
        { onConflict: "event_id,fid" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getPlayerEventStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ fid: z.coerce.number().int().positive() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("event_attendance")
      .select("*, events(name, event_type, occurred_at)")
      .eq("fid", data.fid)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return { attendance: rows ?? [] };
  });

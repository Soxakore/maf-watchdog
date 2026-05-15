// Snapshot + diffing logic. Server-only — uses any Supabase client (admin or user-scoped).
import type { SupabaseClient } from "@supabase/supabase-js";

export const TARGET_STATE = 4285;
export const TARGET_ALLIANCE = "MAF";

interface SnapshotInput {
  nickname: string | null;
  state: number | null;
  furnace_level: number | null;
  alliance: string | null;
  power: number | null;
}

export async function snapshotAndDiff(
  supabase: SupabaseClient,
  fid: number,
  next: SnapshotInput,
): Promise<void> {
  // Latest snapshot for diffing
  const { data: prevRows } = await supabase
    .from("snapshots")
    .select("*")
    .eq("fid", fid)
    .order("captured_at", { ascending: false })
    .limit(1);
  const prev = prevRows?.[0];

  // Insert new snapshot
  await supabase.from("snapshots").insert({
    fid,
    nickname: next.nickname,
    state: next.state,
    furnace_level: next.furnace_level,
    alliance: next.alliance,
    power: next.power,
  });

  if (!prev) return;

  const alerts: Array<{
    fid: number;
    alert_type: string;
    message: string;
    old_value: string | null;
    new_value: string | null;
  }> = [];

  if (prev.nickname !== next.nickname && next.nickname) {
    alerts.push({
      fid,
      alert_type: "name_change",
      message: `Name changed: "${prev.nickname}" → "${next.nickname}"`,
      old_value: prev.nickname,
      new_value: next.nickname,
    });
  }

  if (prev.state !== next.state && next.state != null) {
    alerts.push({
      fid,
      alert_type: "state_change",
      message: `State changed: ${prev.state} → ${next.state}${
        next.state !== TARGET_STATE ? " ⚠️ left state " + TARGET_STATE : ""
      }`,
      old_value: String(prev.state ?? ""),
      new_value: String(next.state ?? ""),
    });
  }

  if (prev.furnace_level !== next.furnace_level && next.furnace_level != null) {
    const dir = (next.furnace_level ?? 0) > (prev.furnace_level ?? 0) ? "↑" : "↓";
    alerts.push({
      fid,
      alert_type: "furnace_change",
      message: `Furnace ${dir}: ${prev.furnace_level} → ${next.furnace_level}`,
      old_value: String(prev.furnace_level ?? ""),
      new_value: String(next.furnace_level ?? ""),
    });
  }

  if (prev.alliance !== next.alliance) {
    const left = prev.alliance === TARGET_ALLIANCE && next.alliance !== TARGET_ALLIANCE;
    const joined = prev.alliance !== TARGET_ALLIANCE && next.alliance === TARGET_ALLIANCE;
    alerts.push({
      fid,
      alert_type: left ? "alliance_left" : joined ? "alliance_joined" : "alliance_change",
      message: left
        ? `🚨 LEFT ${TARGET_ALLIANCE}: "${prev.alliance ?? "none"}" → "${next.alliance ?? "none"}"`
        : joined
          ? `✅ JOINED ${TARGET_ALLIANCE}: "${prev.alliance ?? "none"}" → "${next.alliance}"`
          : `Alliance changed: "${prev.alliance ?? "none"}" → "${next.alliance ?? "none"}"`,
      old_value: prev.alliance,
      new_value: next.alliance,
    });
  }

  if ((prev.power ?? 0) !== (next.power ?? 0) && next.power != null) {
    const diff = (next.power ?? 0) - (prev.power ?? 0);
    const pct = prev.power ? Math.abs(diff / prev.power) * 100 : 100;
    if (Math.abs(diff) >= 100_000 || pct >= 1) {
      const dir = diff > 0 ? "↑" : "↓";
      alerts.push({
        fid,
        alert_type: diff > 0 ? "power_rise" : "power_drop",
        message: `Power ${dir} ${Math.abs(diff).toLocaleString()} (${pct.toFixed(1)}%): ${prev.power?.toLocaleString() ?? "—"} → ${next.power.toLocaleString()}`,
        old_value: String(prev.power ?? ""),
        new_value: String(next.power ?? ""),
      });
    }
  }

  if (alerts.length) {
    await supabase.from("alerts").insert(alerts);
  }
}

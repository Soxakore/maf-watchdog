// Server-only clients for Whiteout Survival player lookup sources.
import { createHash } from "crypto";

const WOS_SECRET = "tB87#kPtkxqOS2";
const WOS_PLAYER_URL =
  process.env.WOS_CENTURY_PLAYER_URL ?? "https://wos-giftcode-api.centurygame.com/api/player";
const WOS_GIFT_CENTER_ORIGIN =
  process.env.WOS_CENTURY_ORIGIN ?? "https://wos-giftcode.centurygame.com";
const WOS_CONTROL_BASE_URL = (
  process.env.WOS_CONTROL_BASE_URL ?? "https://woscontrol.com/api/v1"
).replace(/\/+$/, "");

export type WosPlayerSource = "century" | "woscontrol" | "merged";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type JsonObject = { [key: string]: JsonValue };

export interface WosPlayerData {
  fid: number;
  nickname: string;
  kid: number | null; // state / server id
  stove_lv: number | null; // furnace level (numeric raw)
  stove_lv_content?: string | null; // sometimes "FC 1" style
  avatar_image?: string | null;
  alliance?: string | null;
  power?: number | null;
  source: WosPlayerSource;
  api_profile: JsonObject;
}

export interface WosPlayerResult {
  ok: boolean;
  data?: WosPlayerData;
  status: string; // "ok" | "not_found" | "rate_limited" | "error:<msg>"
  warnings?: string[];
}

function sign(params: Record<string, string | number>): string {
  const sorted = Object.keys(params).sort();
  const str = sorted.map((k) => `${k}=${params[k]}`).join("&");
  return createHash("md5")
    .update(str + WOS_SECRET)
    .digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function jsonObject(value: unknown): JsonObject {
  if (isRecord(value)) return value as JsonObject;
  return { value: (value ?? null) as JsonValue };
}

function normalizeKey(key: string): string {
  return key.replace(/[\s_-]/g, "").toLowerCase();
}

function findValue(value: unknown, keys: readonly string[]): unknown {
  const wanted = new Set(keys.map(normalizeKey));
  const queue: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  const seen = new Set<unknown>();

  while (queue.length) {
    const current = queue.shift();
    if (!current || !isRecord(current.value) || seen.has(current.value)) continue;
    seen.add(current.value);

    for (const [key, child] of Object.entries(current.value)) {
      if (child != null && child !== "" && wanted.has(normalizeKey(key))) {
        return child;
      }
    }

    if (current.depth >= 4) continue;
    for (const child of Object.values(current.value)) {
      if (isRecord(child) || Array.isArray(child)) {
        queue.push({ value: child, depth: current.depth + 1 });
      }
    }
  }

  return undefined;
}

function toInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string") {
    const match = value.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
    if (!match) return null;
    const num = Number(match[0]);
    return Number.isFinite(num) ? Math.trunc(num) : null;
  }
  return null;
}

function toText(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function toAllianceText(value: unknown): string | null {
  const direct = toText(value);
  if (direct) return direct;
  if (!isRecord(value)) return null;

  return (
    toText(findValue(value, ["tag", "abbr", "abbreviation", "shortName", "short_name"])) ??
    toText(findValue(value, ["name", "nickname", "allianceName", "alliance_name"]))
  );
}

function unwrapPlayerPayload(json: unknown): Record<string, unknown> | null {
  if (!isRecord(json)) return null;
  if (isRecord(json.data)) {
    if (isRecord(json.data.player)) return json.data.player;
    if (isRecord(json.data.profile)) return json.data.profile;
    return json.data;
  }
  if (isRecord(json.player)) return json.player;
  if (isRecord(json.profile)) return json.profile;
  return json;
}

function normalizePlayerData(
  source: Exclude<WosPlayerSource, "merged">,
  json: unknown,
  fallbackFid: number,
): WosPlayerData | null {
  const payload = unwrapPlayerPayload(json);
  if (!payload) return null;

  const nickname = toText(
    findValue(payload, ["nickname", "nick", "name", "playerName", "player_name"]),
  );
  if (!nickname) return null;

  const profile = { [source]: jsonObject(json) };
  const allianceValue = findValue(payload, [
    "allianceTag",
    "alliance_tag",
    "allianceAbbr",
    "alliance_abbr",
    "allianceName",
    "alliance_name",
    "alliance",
    "guildTag",
    "guild_tag",
    "guildName",
    "guild_name",
    "guild",
  ]);

  return {
    fid: toInteger(findValue(payload, ["fid", "id", "playerId", "player_id"])) ?? fallbackFid,
    nickname,
    kid: toInteger(
      findValue(payload, [
        "kid",
        "state",
        "stateId",
        "state_id",
        "server",
        "serverId",
        "server_id",
        "kingdom",
        "kingdomId",
        "kingdom_id",
      ]),
    ),
    stove_lv: toInteger(
      findValue(payload, [
        "stoveLv",
        "stove_lv",
        "stoveLevel",
        "stove_level",
        "furnace",
        "furnaceLevel",
        "furnace_level",
        "fc",
        "fcLevel",
        "fc_level",
      ]),
    ),
    stove_lv_content: toText(
      findValue(payload, [
        "stoveLvContent",
        "stove_lv_content",
        "furnaceContent",
        "furnace_content",
        "furnaceLabel",
        "furnace_label",
      ]),
    ),
    avatar_image: toText(
      findValue(payload, [
        "avatarImage",
        "avatar_image",
        "avatarUrl",
        "avatar_url",
        "avatar",
        "portrait",
        "portraitUrl",
        "portrait_url",
      ]),
    ),
    alliance: toAllianceText(allianceValue),
    power: toInteger(
      findValue(payload, [
        "power",
        "totalPower",
        "total_power",
        "combatPower",
        "combat_power",
        "chiefPower",
        "chief_power",
        "bp",
      ]),
    ),
    source,
    api_profile: profile,
  };
}

function mergePlayers(
  fid: number,
  century?: WosPlayerData,
  woscontrol?: WosPlayerData,
): WosPlayerData | undefined {
  const primary = woscontrol ?? century;
  if (!primary) return undefined;

  return {
    fid,
    nickname: woscontrol?.nickname ?? century?.nickname ?? primary.nickname,
    kid: woscontrol?.kid ?? century?.kid ?? null,
    stove_lv: woscontrol?.stove_lv ?? century?.stove_lv ?? null,
    stove_lv_content: woscontrol?.stove_lv_content ?? century?.stove_lv_content ?? null,
    avatar_image: woscontrol?.avatar_image ?? century?.avatar_image ?? null,
    alliance: woscontrol?.alliance ?? century?.alliance ?? null,
    power: woscontrol?.power ?? century?.power ?? null,
    source: woscontrol && century ? "merged" : primary.source,
    api_profile: {
      ...(century?.api_profile ?? {}),
      ...(woscontrol?.api_profile ?? {}),
    },
  };
}

async function readJsonSafely(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

async function fetchCenturyPlayer(fid: number): Promise<WosPlayerResult> {
  const time = Date.now();
  const params: Record<string, string | number> = { fid, time };
  const body = new URLSearchParams({
    fid: String(fid),
    time: String(time),
    sign: sign(params),
  });

  try {
    const res = await fetch(WOS_PLAYER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        Origin: WOS_GIFT_CENTER_ORIGIN,
        Referer: `${WOS_GIFT_CENTER_ORIGIN}/`,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
        "sec-ch-ua": '"Not:A-Brand";v="99", "Google Chrome";v="134", "Chromium";v="134"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-site",
      },
      body: body.toString(),
    });

    if (res.status === 429) return { ok: false, status: "rate_limited" };
    if (!res.ok) return { ok: false, status: `error:http_${res.status}` };

    const json = await readJsonSafely(res);
    if (!isRecord(json)) return { ok: false, status: "error:empty_century_response" };

    const code = toInteger(json.code);
    const msg = toText(json.msg);

    if (code === 0 && json.data) {
      const data = normalizePlayerData("century", json, fid);
      if (!data) return { ok: false, status: "error:malformed_century_response" };
      return { ok: true, data, status: "ok" };
    }
    if (msg && /not exist|not found|player/i.test(msg) && code !== 0) {
      return { ok: false, status: "not_found" };
    }
    return { ok: false, status: `error:${msg ?? "unknown"}` };
  } catch (e) {
    return { ok: false, status: `error:${(e as Error).message}` };
  }
}

async function fetchWosControlPlayer(fid: number): Promise<WosPlayerResult> {
  const apiKey = process.env.WOS_CONTROL_API_KEY;
  if (!apiKey) return { ok: false, status: "error:missing_wos_control_api_key" };

  try {
    const res = await fetch(`${WOS_CONTROL_BASE_URL}/player/${fid}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (res.status === 401 || res.status === 403) {
      return { ok: false, status: "error:woscontrol_unauthorized" };
    }
    if (res.status === 404) return { ok: false, status: "not_found" };
    if (res.status === 429) return { ok: false, status: "rate_limited" };

    const json = await readJsonSafely(res);
    if (!res.ok) {
      const msg = isRecord(json) ? (toText(json.error) ?? toText(json.message)) : null;
      return { ok: false, status: `error:${msg ?? `woscontrol_http_${res.status}`}` };
    }

    const data = normalizePlayerData("woscontrol", json, fid);
    if (!data) return { ok: false, status: "error:malformed_woscontrol_response" };
    return { ok: true, data, status: "ok" };
  } catch (e) {
    return { ok: false, status: `error:${(e as Error).message}` };
  }
}

export async function fetchWosPlayer(fid: number): Promise<WosPlayerResult> {
  const mode = (process.env.WOS_PLAYER_API_MODE ?? "merged").toLowerCase();
  if (mode === "century") return fetchCenturyPlayer(fid);
  if (mode === "woscontrol") return fetchWosControlPlayer(fid);

  if (!process.env.WOS_CONTROL_API_KEY) {
    return fetchCenturyPlayer(fid);
  }

  const [century, woscontrol] = await Promise.all([
    fetchCenturyPlayer(fid),
    fetchWosControlPlayer(fid),
  ]);
  const data = mergePlayers(fid, century.data, woscontrol.data);
  if (data) {
    const warnings = [century, woscontrol]
      .filter((result) => !result.ok)
      .map((result) => result.status);
    return { ok: true, data, status: "ok", warnings };
  }

  if (century.status === "not_found" && woscontrol.status === "not_found") {
    return { ok: false, status: "not_found" };
  }
  if (century.status === "rate_limited" || woscontrol.status === "rate_limited") {
    return { ok: false, status: "rate_limited" };
  }

  return { ok: false, status: `error:${century.status};${woscontrol.status}` };
}

// Server-only client for the public Whiteout Survival player info API.
// Endpoint and signing scheme are the same one used by community gift-code tools.
import { createHash } from "crypto";

const WOS_SECRET = "tB87#kPtkxqOS2";
const WOS_PLAYER_URL = "https://wos-giftcode-api.centurygame.com/api/player";

export interface WosPlayerData {
  fid: number;
  nickname: string;
  kid: number; // state / server id
  stove_lv: number; // furnace level (numeric raw)
  stove_lv_content?: string; // sometimes "FC 1" style
  avatar_image?: string;
}

export interface WosPlayerResult {
  ok: boolean;
  data?: WosPlayerData;
  status: string; // "ok" | "not_found" | "rate_limited" | "error:<msg>"
}

function sign(params: Record<string, string | number>): string {
  const sorted = Object.keys(params).sort();
  const str = sorted.map((k) => `${k}=${params[k]}`).join("&");
  return createHash("md5")
    .update(str + WOS_SECRET)
    .digest("hex");
}

export async function fetchWosPlayer(fid: number): Promise<WosPlayerResult> {
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
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (res.status === 429) return { ok: false, status: "rate_limited" };
    if (!res.ok) return { ok: false, status: `error:http_${res.status}` };

    const json = (await res.json()) as {
      code: number;
      msg: string;
      data?: WosPlayerData;
    };

    if (json.code === 0 && json.data) {
      return { ok: true, data: json.data, status: "ok" };
    }
    if (json.msg && /not exist|not found|player/i.test(json.msg) && json.code !== 0) {
      return { ok: false, status: "not_found" };
    }
    return { ok: false, status: `error:${json.msg ?? "unknown"}` };
  } catch (e) {
    return { ok: false, status: `error:${(e as Error).message}` };
  }
}

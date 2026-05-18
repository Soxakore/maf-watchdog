import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type ChangeEvent } from "react";
import { bulkUpdatePowerStats, listPlayers } from "@/lib/players.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { FileImage, RefreshCw, Save, ScanText } from "lucide-react";

export const Route = createFileRoute("/_authed/power-import")({ component: PowerImportPage });

type TrackedPlayer = {
  fid: number;
  nickname: string | null;
  alliance: string | null;
  power: number | null;
};

type ParsedPowerRow = {
  id: string;
  rawLine: string;
  detectedName: string;
  detectedPower: number;
  matchedFid: number | null;
  confidence: number;
  include: boolean;
};

const POWER_TOKEN =
  /\d+(?:[.,]\d+)?\s*(?:b|bn|billion|m|mil|million|mio|k)\b|\d{1,3}(?:[,\s.]\d{3})+\b|\d{7,}\b/gi;

function parsePowerValue(raw: string): number | null {
  const cleaned = raw.trim().toLowerCase();
  const unit = cleaned.match(/\b(bn|billion|b|mil|million|mio|m|k)\b/)?.[1] ?? "";
  const numberPart = cleaned.replace(/\b(bn|billion|b|mil|million|mio|m|k)\b/g, "").trim();

  if (unit) {
    const decimal = numberPart.replace(/\s/g, "").replace(",", ".");
    const amount = Number(decimal);
    if (!Number.isFinite(amount)) return null;
    const multiplier =
      unit === "b" || unit === "bn" || unit === "billion"
        ? 1_000_000_000
        : unit === "k"
          ? 1_000
          : 1_000_000;
    return Math.round(amount * multiplier);
  }

  const digits = numberPart.replace(/\D/g, "");
  if (!digits) return null;
  const value = Number(digits);
  return Number.isFinite(value) ? value : null;
}

function formatPower(power: number | null): string {
  return power == null ? "—" : power.toLocaleString();
}

function normalizeName(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const curr = Array.from({ length: b.length + 1 }, () => 0);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      curr[j] =
        a[i - 1] === b[j - 1]
          ? prev[j - 1]
          : Math.min(prev[j - 1] + 1, prev[j] + 1, curr[j - 1] + 1);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }

  return prev[b.length];
}

function scoreNameMatch(detectedName: string, playerName: string | null): number {
  const detected = normalizeName(detectedName);
  const player = normalizeName(playerName);
  if (!detected || !player) return 0;
  if (detected === player) return 1;

  if (detected.includes(player) || player.includes(detected)) {
    const ratio =
      Math.min(detected.length, player.length) / Math.max(detected.length, player.length);
    return 0.74 + ratio * 0.2;
  }

  const distance = levenshtein(detected, player);
  return 1 - distance / Math.max(detected.length, player.length);
}

function bestPlayerMatch(
  detectedName: string,
  players: TrackedPlayer[],
): { fid: number | null; confidence: number } {
  let best = { fid: null as number | null, confidence: 0 };
  for (const player of players) {
    const confidence = scoreNameMatch(detectedName, player.nickname);
    if (confidence > best.confidence) {
      best = { fid: player.fid, confidence };
    }
  }
  return best.confidence >= 0.72 ? best : { fid: null, confidence: best.confidence };
}

function cleanupDetectedName(line: string, powerToken: { index: number; text: string }): string {
  const withoutPower =
    line.slice(0, powerToken.index) + " " + line.slice(powerToken.index + powerToken.text.length);

  return withoutPower
    .replace(/^\s*(?:#|rank)?\s*\d{1,4}\s+/i, "")
    .replace(/\b(?:power|rank|chief|member|fc\s*\d+|r[0-5])\b/gi, " ")
    .replace(/[|•:;]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseOcrText(text: string, players: TrackedPlayer[]): ParsedPowerRow[] {
  const rows: ParsedPowerRow[] = [];
  const seen = new Set<string>();

  for (const [lineIndex, rawLine] of text.split(/\r?\n/).entries()) {
    const line = rawLine.replace(/\t/g, " ").trim();
    if (line.length < 3) continue;

    const matches = [...line.matchAll(POWER_TOKEN)]
      .map((match) => ({
        text: match[0],
        index: match.index ?? 0,
        value: parsePowerValue(match[0]),
      }))
      .filter((match): match is { text: string; index: number; value: number } => {
        return match.value != null && match.value >= 10_000;
      });

    const powerMatch = matches.at(-1);
    if (!powerMatch) continue;

    const detectedName = cleanupDetectedName(line, powerMatch);
    if (normalizeName(detectedName).length < 2) continue;

    const key = `${normalizeName(detectedName)}:${powerMatch.value}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const match = bestPlayerMatch(detectedName, players);
    rows.push({
      id: `${lineIndex}-${key}`,
      rawLine: line,
      detectedName,
      detectedPower: powerMatch.value,
      matchedFid: match.fid,
      confidence: match.confidence,
      include: match.fid != null,
    });
  }

  return rows;
}

function PowerImportPage() {
  const qc = useQueryClient();
  const list = useServerFn(listPlayers);
  const bulkSave = useServerFn(bulkUpdatePowerStats);

  const { data } = useQuery({ queryKey: ["players"], queryFn: () => list() });
  const players = useMemo(() => (data?.players ?? []) as TrackedPlayer[], [data?.players]);
  const playerByFid = useMemo(
    () => new Map(players.map((player) => [player.fid, player])),
    [players],
  );

  const [files, setFiles] = useState<File[]>([]);
  const [ocrText, setOcrText] = useState("");
  const [rows, setRows] = useState<ParsedPowerRow[]>([]);
  const [ocrStatus, setOcrStatus] = useState("");
  const [ocrProgress, setOcrProgress] = useState(0);
  const [isOcrRunning, setIsOcrRunning] = useState(false);

  const saveMut = useMutation({
    mutationFn: () => {
      const updatesByFid = new Map<number, { fid: number; power: number }>();
      for (const row of rows.filter((item) => item.include && item.matchedFid != null)) {
        updatesByFid.set(row.matchedFid!, {
          fid: row.matchedFid!,
          power: row.detectedPower,
        });
      }
      const updates = [...updatesByFid.values()];

      if (!updates.length) throw new Error("No matched rows selected.");
      return bulkSave({ data: { updates } as never });
    },
    onSuccess: (result) => {
      toast.success(`Saved ${result.updated} power update${result.updated === 1 ? "" : "s"}`);
      qc.invalidateQueries({ queryKey: ["players"] });
      qc.invalidateQueries({ queryKey: ["alerts-unread"] });
    },
    onError: (error) => toast.error((error as Error).message),
  });

  function onFilesSelected(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    setFiles(selected);
    setRows([]);
    setOcrText("");
    setOcrStatus("");
    setOcrProgress(0);
  }

  function reparse(text = ocrText) {
    const parsed = parseOcrText(text, players);
    setRows(parsed);
    if (!parsed.length) toast.warning("No name + power rows found.");
  }

  async function runOcr() {
    if (!files.length) {
      toast.error("Choose at least one screenshot.");
      return;
    }

    setRows([]);
    setOcrStatus("Loading OCR");
    setOcrProgress(3);
    setIsOcrRunning(true);

    try {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng", 1, {
        logger: (message) => {
          if (message.status) setOcrStatus(message.status);
          if (typeof message.progress === "number") {
            setOcrProgress(Math.max(3, Math.round(message.progress * 100)));
          }
        },
      });

      try {
        const chunks: string[] = [];
        for (const [index, file] of files.entries()) {
          setOcrStatus(`Reading ${file.name}`);
          const result = await worker.recognize(file);
          chunks.push(`--- ${file.name} ---\n${result.data.text}`);
          setOcrProgress(Math.round(((index + 1) / files.length) * 100));
        }

        const text = chunks.join("\n\n").trim();
        setOcrText(text);
        setOcrStatus("Done");
        reparse(text);
      } finally {
        await worker.terminate();
      }
    } catch (error) {
      setOcrStatus("OCR failed");
      toast.error((error as Error).message);
    } finally {
      setIsOcrRunning(false);
    }
  }

  const selectedCount = rows.filter((row) => row.include && row.matchedFid != null).length;
  const matchedCount = rows.filter((row) => row.matchedFid != null).length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Power import</h1>
          <p className="text-sm text-muted-foreground">
            {matchedCount} matched · {rows.length} detected · {players.length} tracked
          </p>
        </div>
        <Button
          onClick={() => saveMut.mutate()}
          disabled={!selectedCount || saveMut.isPending || isOcrRunning}
        >
          <Save className="mr-1.5 size-4" /> Save selected
        </Button>
      </div>

      <Card className="p-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="space-y-2">
            <Label htmlFor="power-screenshots">Screenshots</Label>
            <Input
              id="power-screenshots"
              type="file"
              accept="image/*"
              multiple
              onChange={onFilesSelected}
            />
            <div className="flex flex-wrap gap-1.5">
              {files.map((file) => (
                <Badge key={`${file.name}-${file.size}`} variant="secondary">
                  <FileImage className="mr-1 size-3" />
                  {file.name}
                </Badge>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => reparse()} disabled={isOcrRunning}>
              <RefreshCw className="mr-1.5 size-4" /> Parse text
            </Button>
            <Button onClick={runOcr} disabled={!files.length || isOcrRunning}>
              <ScanText className="mr-1.5 size-4" /> {isOcrRunning ? "Running" : "Run OCR"}
            </Button>
          </div>
        </div>
        {!!ocrStatus && (
          <div className="mt-4 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{ocrStatus}</span>
              <span>{ocrProgress}%</span>
            </div>
            <Progress value={ocrProgress} />
          </div>
        )}
      </Card>

      <Card className="p-5">
        <div className="mb-2 flex items-center justify-between gap-3">
          <Label htmlFor="ocr-text">OCR text</Label>
          <Badge variant="outline">
            {ocrText ? `${ocrText.length.toLocaleString()} chars` : "empty"}
          </Badge>
        </div>
        <Textarea
          id="ocr-text"
          className="min-h-44 font-mono text-xs"
          value={ocrText}
          onChange={(event) => setOcrText(event.target.value)}
          placeholder="OCR output appears here."
        />
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Review matches
          </h2>
          <Badge variant="secondary">{selectedCount} selected</Badge>
        </div>
        <div className="overflow-auto">
          <table className="w-full min-w-[920px] text-sm">
            <thead className="bg-secondary/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Use</th>
                <th className="px-3 py-2">Detected</th>
                <th className="px-3 py-2">Player</th>
                <th className="px-3 py-2">Power</th>
                <th className="px-3 py-2">Current</th>
                <th className="px-3 py-2">Match</th>
                <th className="px-3 py-2">Raw line</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => {
                const matchedPlayer =
                  row.matchedFid == null ? null : (playerByFid.get(row.matchedFid) ?? null);
                return (
                  <tr key={row.id} className="hover:bg-secondary/30">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        className="size-4 accent-primary"
                        checked={row.include}
                        disabled={row.matchedFid == null}
                        onChange={(event) =>
                          setRows((current) =>
                            current.map((item) =>
                              item.id === row.id
                                ? { ...item, include: event.target.checked }
                                : item,
                            ),
                          )
                        }
                      />
                    </td>
                    <td className="px-3 py-2 font-medium">{row.detectedName}</td>
                    <td className="px-3 py-2">
                      <select
                        className="h-9 w-60 rounded-md border border-input bg-background px-2 text-sm"
                        value={row.matchedFid ?? ""}
                        onChange={(event) =>
                          setRows((current) =>
                            current.map((item) =>
                              item.id === row.id
                                ? {
                                    ...item,
                                    matchedFid: event.target.value
                                      ? Number(event.target.value)
                                      : null,
                                    include: !!event.target.value,
                                    confidence: event.target.value ? item.confidence : 0,
                                  }
                                : item,
                            ),
                          )
                        }
                      >
                        <option value="">Needs review</option>
                        {players.map((player) => (
                          <option key={player.fid} value={player.fid}>
                            {player.nickname ?? `FID ${player.fid}`} · {player.fid}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        className="h-9 w-32 font-mono text-xs"
                        inputMode="numeric"
                        value={row.detectedPower}
                        onChange={(event) =>
                          setRows((current) =>
                            current.map((item) =>
                              item.id === row.id
                                ? {
                                    ...item,
                                    detectedPower:
                                      Number(event.target.value.replace(/\D/g, "")) || 0,
                                  }
                                : item,
                            ),
                          )
                        }
                      />
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {formatPower(matchedPlayer?.power ?? null)}
                    </td>
                    <td className="px-3 py-2">
                      <Badge
                        variant={
                          row.matchedFid == null
                            ? "destructive"
                            : row.confidence >= 0.9
                              ? "default"
                              : "secondary"
                        }
                      >
                        {row.matchedFid == null ? "review" : `${Math.round(row.confidence * 100)}%`}
                      </Badge>
                    </td>
                    <td className="max-w-sm px-3 py-2 font-mono text-xs text-muted-foreground">
                      <span className="line-clamp-2">{row.rawLine}</span>
                    </td>
                  </tr>
                );
              })}
              {!rows.length && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    No power rows detected yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

import { useMemo, useId, useRef, useState } from "react";
import { Waves } from "lucide-react";

export type FlowSeries = {
  label: string;
  /** oklch or hex color */
  color: string;
  /** values in chronological order, oldest -> newest */
  values: (number | null)[];
  /** formatter for the latest value label */
  format?: (v: number) => string;
};

export type FlowGraphProps = {
  title?: string;
  subtitle?: string;
  /** x-axis labels, same length as each series.values */
  labels: string[];
  /** optional richer labels (e.g. full timestamps) shown in hover tooltip */
  tooltipLabels?: string[];
  series: FlowSeries[];
  height?: number;
};

const W = 900;
const PAD_L = 56;
const PAD_R = 110;
const PAD_T = 36;
const PAD_B = 36;

// Catmull-Rom -> Bezier smoothing
function smoothPath(points: [number, number][]) {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0][0]},${points[0][1]}`;
  let d = `M ${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2[0]},${p2[1]}`;
  }
  return d;
}

export function FlowGraph({
  title = "Flow Graph",
  subtitle = "Multi-metric over time",
  labels,
  tooltipLabels,
  series,
  height = 360,
}: FlowGraphProps) {
  const uid = useId();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const H = height;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const n = labels.length;
  const hasData = n > 1 && series.some((s) => s.values.some((v) => v != null));

  // per-series normalization so each ribbon uses its full vertical range
  const computed = useMemo(() => {
    return series.map((s) => {
      const nums = s.values.map((v) => (v == null ? NaN : v));
      const valid = nums.filter((v) => Number.isFinite(v)) as number[];
      const min = valid.length ? Math.min(...valid) : 0;
      const max = valid.length ? Math.max(...valid) : 1;
      const span = max - min || 1;
      const points: [number, number][] = nums
        .map((v, i): [number, number] | null => {
          if (!Number.isFinite(v)) return null;
          const x = n === 1 ? PAD_L + innerW / 2 : PAD_L + (i * innerW) / (n - 1);
          const y = PAD_T + innerH - ((v - min) / span) * innerH * 0.85 - innerH * 0.075;
          return [x, y];
        })
        .filter((p): p is [number, number] => p !== null);
      const last = valid.length ? valid[valid.length - 1] : null;
      const first = valid.length ? valid[0] : null;
      const delta = last != null && first != null && first !== 0 ? ((last - first) / first) * 100 : null;
      return { ...s, points, last, delta };
    });
  }, [series, n, innerW, innerH]);

  return (
    <div className="relative overflow-hidden rounded-xl border border-border/60 bg-gradient-to-b from-background to-background/40 p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="grid size-8 place-items-center rounded-md bg-primary/10 text-primary">
            <Waves className="size-4" />
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {title}
            </div>
            <div className="text-xs text-muted-foreground/70">{subtitle}</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {computed.map((s) => (
            <div key={s.label} className="flex items-center gap-1.5 text-xs">
              <span className="size-2 rounded-full" style={{ background: s.color, boxShadow: `0 0 8px ${s.color}` }} />
              <span className="text-muted-foreground">{s.label}</span>
              {s.last != null && (
                <span className="font-mono text-foreground/90">
                  {s.format ? s.format(s.last) : s.last.toLocaleString()}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {!hasData ? (
        <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
          Not enough data yet — graph appears after 2+ snapshots.
        </div>
      ) : (
        <div className="relative">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            className="w-full"
            style={{ maxHeight: H, overflow: "visible" }}
            preserveAspectRatio="none"
            onMouseMove={(e) => {
              const svg = svgRef.current;
              if (!svg) return;
              const rect = svg.getBoundingClientRect();
              const relX = e.clientX - rect.left;
              const xInView = (relX / rect.width) * W;
              if (xInView < PAD_L || xInView > W - PAD_R) {
                setHoverIdx(null);
                return;
              }
              const step = innerW / (n - 1);
              const i = Math.round((xInView - PAD_L) / step);
              setHoverIdx(Math.max(0, Math.min(n - 1, i)));
            }}
            onMouseLeave={() => setHoverIdx(null)}
          >
            <defs>
              {computed.map((s, idx) => (
                <linearGradient key={s.label} id={`${uid}-fill-${idx}`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity="0.45" />
                  <stop offset="100%" stopColor={s.color} stopOpacity="0" />
                </linearGradient>
              ))}
              {computed.map((s, idx) => (
                <filter key={`f-${idx}`} id={`${uid}-glow-${idx}`} x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="3" result="b" />
                  <feMerge>
                    <feMergeNode in="b" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              ))}
            </defs>

            {/* grid */}
            {[0, 0.25, 0.5, 0.75, 1].map((t) => (
              <line
                key={t}
                x1={PAD_L}
                x2={W - PAD_R}
                y1={PAD_T + innerH * t}
                y2={PAD_T + innerH * t}
                stroke="hsl(var(--border) / 0.4)"
                strokeDasharray="2 4"
                strokeWidth={0.5}
              />
            ))}

            {/* x-axis ticks */}
            {labels.map((lab, i) => {
              if (n > 8 && i % Math.ceil(n / 8) !== 0 && i !== n - 1) return null;
              const x = n === 1 ? PAD_L + innerW / 2 : PAD_L + (i * innerW) / (n - 1);
              return (
                <text
                  key={i}
                  x={x}
                  y={H - 10}
                  textAnchor="middle"
                  className="fill-muted-foreground"
                  fontSize="10"
                  fontFamily="ui-monospace, monospace"
                >
                  {lab}
                </text>
              );
            })}

            {/* ribbons */}
            {computed.map((s, idx) => {
              if (s.points.length < 2) return null;
              const linePath = smoothPath(s.points);
              const areaPath = `${linePath} L ${s.points[s.points.length - 1][0]},${PAD_T + innerH} L ${s.points[0][0]},${PAD_T + innerH} Z`;
              const last = s.points[s.points.length - 1];
              return (
                <g key={s.label}>
                  <path d={areaPath} fill={`url(#${uid}-fill-${idx})`} opacity={0.9}>
                    <animate attributeName="opacity" values="0;0.9" dur="1.2s" fill="freeze" />
                  </path>
                  <path
                    d={linePath}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    filter={`url(#${uid}-glow-${idx})`}
                    pathLength={1}
                    strokeDasharray="1 1"
                    strokeDashoffset="1"
                  >
                    <animate
                      attributeName="stroke-dashoffset"
                      from="1"
                      to="0"
                      dur="1.6s"
                      begin={`${idx * 0.15}s`}
                      fill="freeze"
                    />
                  </path>
                  {/* end-point pulse */}
                  <circle cx={last[0]} cy={last[1]} r={4} fill={s.color}>
                    <animate attributeName="r" values="4;7;4" dur="2.4s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="1;0.4;1" dur="2.4s" repeatCount="indefinite" />
                  </circle>
                  <circle cx={last[0]} cy={last[1]} r={2.5} fill={s.color} />
                  {/* end label */}
                  {s.last != null && (
                    <g transform={`translate(${W - PAD_R + 12}, ${last[1]})`}>
                      <rect
                        x={0}
                        y={-14}
                        width={PAD_R - 20}
                        height={28}
                        rx={6}
                        fill={s.color}
                        fillOpacity={0.12}
                        stroke={s.color}
                        strokeOpacity={0.5}
                      />
                      <text
                        x={8}
                        y={4}
                        fill={s.color}
                        fontSize="11"
                        fontFamily="ui-monospace, monospace"
                        style={{ fontWeight: 600 }}
                      >
                        {s.format ? s.format(s.last) : s.last.toLocaleString()}
                      </text>
                      {s.delta != null && (
                        <text
                          x={PAD_R - 28}
                          y={4}
                          textAnchor="end"
                          fill={s.color}
                          fillOpacity={0.85}
                          fontSize="9"
                          fontFamily="ui-monospace, monospace"
                        >
                          {s.delta >= 0 ? "+" : ""}
                          {s.delta.toFixed(1)}%
                        </text>
                      )}
                    </g>
                  )}
                </g>
              );
            })}

            {/* hover guideline + dots */}
            {hoverIdx != null && (() => {
              const hx = n === 1 ? PAD_L + innerW / 2 : PAD_L + (hoverIdx * innerW) / (n - 1);
              return (
                <g pointerEvents="none">
                  <line
                    x1={hx}
                    x2={hx}
                    y1={PAD_T}
                    y2={PAD_T + innerH}
                    stroke="hsl(var(--foreground) / 0.4)"
                    strokeDasharray="3 3"
                    strokeWidth={0.8}
                  />
                  {computed.map((s) => {
                    const v = s.values[hoverIdx];
                    if (v == null || !Number.isFinite(v)) return null;
                    const valid = s.values
                      .map((vv) => (vv == null ? NaN : vv))
                      .filter((vv) => Number.isFinite(vv)) as number[];
                    const min = Math.min(...valid);
                    const max = Math.max(...valid);
                    const span = max - min || 1;
                    const y =
                      PAD_T + innerH - ((v - min) / span) * innerH * 0.85 - innerH * 0.075;
                    return (
                      <circle
                        key={s.label}
                        cx={hx}
                        cy={y}
                        r={5}
                        fill="hsl(var(--background))"
                        stroke={s.color}
                        strokeWidth={2}
                      />
                    );
                  })}
                </g>
              );
            })()}

            {/* invisible capture overlay so onMouseMove fires everywhere inside plot */}
            <rect
              x={PAD_L}
              y={PAD_T}
              width={innerW}
              height={innerH}
              fill="transparent"
            />
          </svg>

          {/* HTML tooltip */}
          {hoverIdx != null && (() => {
            const leftPct = ((n === 1 ? PAD_L + innerW / 2 : PAD_L + (hoverIdx * innerW) / (n - 1)) / W) * 100;
            const flip = leftPct > 70;
            return (
              <div
                className="pointer-events-none absolute z-10 min-w-[160px] -translate-y-1 rounded-md border border-border/60 bg-popover/95 px-3 py-2 text-xs shadow-lg backdrop-blur"
                style={{
                  left: `${leftPct}%`,
                  top: 8,
                  transform: `translate(${flip ? "-100%" : "0"}, 0) translateX(${flip ? "-8px" : "8px"})`,
                }}
              >
                <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                  {tooltipLabels?.[hoverIdx] ?? labels[hoverIdx]}
                </div>
                <div className="space-y-1">
                  {computed.map((s) => {
                    const v = s.values[hoverIdx];
                    return (
                      <div key={s.label} className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-1.5">
                          <span
                            className="size-2 rounded-full"
                            style={{ background: s.color, boxShadow: `0 0 6px ${s.color}` }}
                          />
                          <span className="text-muted-foreground">{s.label}</span>
                        </span>
                        <span className="font-mono text-foreground">
                          {v == null || !Number.isFinite(v)
                            ? "—"
                            : s.format
                              ? s.format(v as number)
                              : (v as number).toLocaleString()}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      )}


      <p className="mt-3 text-[11px] text-muted-foreground/70">
        Ribbon brightness encodes recency · animation traces chronological order.
      </p>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import type { Period, Series } from "../lib/analyticsSeries";

interface Props {
  periods: Period[];
  series: Series[];
  hidden: ReadonlySet<string>;
  onToggleSeries: (id: string) => void;
  formatValue: (n: number) => string;
  formatTick: (n: number) => string;
  ariaLabel: string;
}

const HEIGHT = 260;
const M = { top: 12, right: 8, bottom: 28, left: 56 };
const GAP = 2;
const RADIUS = 4;

function niceTicks(min: number, max: number): number[] {
  if (min === max) max = min + 1;
  const raw = (max - min) / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  const ticks: number[] = [];
  for (let i = Math.floor(min / step); i <= Math.ceil(max / step); i++) {
    ticks.push(Math.round(i * step * 1e6) / 1e6);
  }
  return ticks;
}

/** Column segment with the outer data-end rounded and the baseline end square. */
function segmentPath(x: number, w: number, top: number, bottom: number, roundTop: boolean, roundBottom: boolean) {
  const r = Math.min(RADIUS, w / 2, bottom - top);
  const rt = roundTop ? r : 0;
  const rb = roundBottom ? r : 0;
  return (
    `M${x},${bottom - rb} V${top + rt} Q${x},${top} ${x + rt},${top} ` +
    `H${x + w - rt} Q${x + w},${top} ${x + w},${top + rt} ` +
    `V${bottom - rb} Q${x + w},${bottom} ${x + w - rb},${bottom} ` +
    `H${x + rb} Q${x},${bottom} ${x},${bottom - rb} Z`
  );
}

export default function StackedColumnChart({
  periods, series, hidden, onToggleSeries, formatValue, formatTick, ariaLabel,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const visible = series.filter((s) => !hidden.has(s.id));
  const totals = periods.map((_, i) => visible.reduce((sum, s) => sum + s.values[i], 0));
  const pos = periods.map((_, i) => visible.reduce((sum, s) => sum + Math.max(0, s.values[i]), 0));
  const neg = periods.map((_, i) => visible.reduce((sum, s) => sum + Math.min(0, s.values[i]), 0));
  const ticks = niceTicks(Math.min(0, ...neg), Math.max(0, ...pos));
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];

  const plotW = Math.max(0, width - M.left - M.right);
  const plotH = HEIGHT - M.top - M.bottom;
  const y = (v: number) => M.top + ((hi - v) / (hi - lo)) * plotH;
  const slot = periods.length ? plotW / periods.length : plotW;
  const colW = Math.max(2, Math.min(24, slot * 0.6));
  const labelEvery = Math.ceil(periods.length / Math.max(1, Math.floor(plotW / 64)));

  const columns = periods.map((p, i) => {
    let up = 0;
    let down = 0;
    const segs = visible.flatMap((s) => {
      const v = s.values[i];
      if (v === 0) return [];
      const base = v > 0 ? up : down;
      if (v > 0) up += v;
      else down += v;
      return [{ id: s.id, color: s.color, base, end: base + v }];
    });
    const lastUp = segs.findLast((s) => s.end > 0);
    const lastDown = segs.findLast((s) => s.end < 0);
    const x = M.left + slot * (i + 0.5) - colW / 2;
    return segs.map((s) => {
      const positive = s.end > 0;
      const top = positive ? y(s.end) : y(s.base) + (s.base < 0 ? GAP : 0);
      const bottom = positive ? y(s.base) - (s.base > 0 ? GAP : 0) : y(s.end);
      if (bottom - top <= 0) return null;
      return (
        <path
          key={`${p.key}-${s.id}`}
          className="chart-seg"
          d={segmentPath(x, colW, top, bottom, s === lastUp, s === lastDown)}
          style={{ fill: s.color }}
        />
      );
    });
  });

  const tipX = hover === null ? 0 : M.left + slot * (hover + 0.5);

  return (
    <div className="chart">
      <div className="chart__plot" ref={wrapRef}>
        <svg width="100%" height={HEIGHT} role="img" aria-label={ariaLabel}>
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={M.left}
                x2={width - M.right}
                y1={y(t)}
                y2={y(t)}
                className={t === 0 ? "chart-zero" : "chart-grid"}
              />
              <text x={M.left - 8} y={y(t)} className="chart-axis num" textAnchor="end" dominantBaseline="middle">
                {formatTick(t)}
              </text>
            </g>
          ))}
          {hover !== null && (
            <rect className="chart-hover" x={M.left + slot * hover} y={M.top} width={slot} height={plotH} />
          )}
          {columns}
          {periods.map((p, i) =>
            i % labelEvery === 0 ? (
              <text key={p.key} x={M.left + slot * (i + 0.5)} y={HEIGHT - 8} className="chart-axis" textAnchor="middle">
                {p.label}
              </text>
            ) : null,
          )}
          {periods.map((p, i) => (
            <rect
              key={p.key}
              className="chart-col"
              x={M.left + slot * i}
              y={M.top}
              width={slot}
              height={plotH}
              tabIndex={0}
              aria-label={`${p.label}: ${formatValue(totals[i])}`}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
            />
          ))}
        </svg>
        {hover !== null && (
          <div
            className="chart-tip"
            role="tooltip"
            style={{
              left: tipX,
              top: M.top,
              transform: tipX > width / 2 ? "translateX(calc(-100% - 12px))" : "translateX(12px)",
            }}
          >
            <div className="chart-tip__title">{periods[hover].label}</div>
            {visible.map((s) => (
              <div className="chart-tip__row" key={s.id}>
                <span className="chart-tip__key" style={{ background: s.color }} aria-hidden="true" />
                <strong className="num">{formatValue(s.values[hover])}</strong>
                <span>{s.label}</span>
              </div>
            ))}
            {visible.length > 1 && (
              <div className="chart-tip__row chart-tip__total">
                <span className="chart-tip__key" aria-hidden="true" />
                <strong className="num">{formatValue(totals[hover])}</strong>
                <span>Total</span>
              </div>
            )}
          </div>
        )}
      </div>
      {series.length > 1 && (
        <div className="chart-legend" role="group" aria-label="Series">
          {series.map((s) => (
            <button
              key={s.id}
              type="button"
              className="chart-legend__item"
              aria-pressed={!hidden.has(s.id)}
              onClick={() => onToggleSeries(s.id)}
            >
              <span className="chart-legend__swatch" style={{ background: s.color }} aria-hidden="true" />
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

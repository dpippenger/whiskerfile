/**
 * A small line of values in time order, drawn as inline SVG. Points are spaced
 * evenly, not by date; it shows a trend, not a timeline.
 */
export function Sparkline({
  values,
  color,
  className,
  dots = false,
}: {
  values: number[];
  color: string;
  className?: string;
  dots?: boolean;
}) {
  if (values.length < 2) return null;
  const width = 100;
  const height = 32;
  const pad = 3;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((v, i) => [
    pad + (i / (values.length - 1)) * (width - 2 * pad),
    // A flat series sits in the middle rather than on an edge.
    max === min ? height / 2 : pad + (1 - (v - min) / span) * (height - 2 * pad),
  ]);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className={className} aria-hidden>
      <polyline
        points={points.map(([x, y]) => `${x},${y}`).join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {/* Dots are zero-length round-capped strokes: unlike circles, they stay round when the SVG is stretched. */}
      {dots &&
        points.map(([x, y], i) => (
          <line
            key={i}
            x1={x}
            y1={y}
            x2={x}
            y2={y}
            stroke={color}
            strokeWidth={7}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
    </svg>
  );
}

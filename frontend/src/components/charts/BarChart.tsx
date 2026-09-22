// Hand-drawn SVG bar chart.
//
// No charting dependency: this draws rectangles. A library would add tens of
// kilobytes and its own accessibility model for something that is arithmetic
// plus `<rect>`.
//
// Accessibility is the reason for the shape of this component. An SVG is
// opaque to assistive tech, so every chart here renders a real `<table>` of
// the same numbers, visually hidden but fully navigable — not an `aria-label`
// summary, which cannot be read cell by cell. Sighted users get the drawing;
// everyone gets the data.

export interface BarDatum {
  label: string;
  value: number;
  /** CSS colour token name, e.g. 'var(--chart-1)'. */
  color?: string;
  /** Longer description used in the table row. */
  description?: string;
}

interface Props {
  data: BarDatum[];
  /** Accessible name for the figure. */
  title: string;
  /** Header for the label column of the data table. */
  labelHeader: string;
  valueHeader: string;
  /** Rendered height of the plot area in px. */
  height?: number;
  /** Suffix appended to the printed value, e.g. ' avaliações'. */
  unit?: string;
}

const WIDTH = 100;

export function BarChart({
  data,
  title,
  labelHeader,
  valueHeader,
  height = 132,
  unit = '',
}: Props) {
  const max = Math.max(1, ...data.map((datum) => datum.value));
  const slot = WIDTH / Math.max(1, data.length);
  const barWidth = slot * 0.56;

  return (
    <figure className="chart">
      <svg
        className="chart__svg"
        viewBox={`0 0 ${WIDTH} ${height}`}
        preserveAspectRatio="none"
        style={{ height }}
        role="presentation"
        aria-hidden="true"
      >
        {[0.25, 0.5, 0.75, 1].map((fraction) => (
          <line
            key={fraction}
            className="chart__grid"
            x1={0}
            x2={WIDTH}
            y1={height - height * fraction}
            y2={height - height * fraction}
          />
        ))}
        {data.map((datum, index) => {
          const barHeight = (datum.value / max) * (height - 4);
          return (
            <rect
              key={datum.label}
              x={index * slot + (slot - barWidth) / 2}
              y={height - barHeight}
              width={barWidth}
              height={Math.max(datum.value > 0 ? 2 : 0, barHeight)}
              rx={1.5}
              fill={datum.color ?? 'var(--chart-1)'}
            />
          );
        })}
      </svg>

      <ul className="chart__axis" aria-hidden="true">
        {data.map((datum) => (
          <li key={datum.label} className="chart__tick">
            <span className="chart__tick-value">{datum.value}</span>
            <span className="chart__tick-label">{datum.label}</span>
          </li>
        ))}
      </ul>

      <figcaption className="sr-only">
        <table>
          <caption>{title}</caption>
          <thead>
            <tr>
              <th scope="col">{labelHeader}</th>
              <th scope="col">{valueHeader}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((datum) => (
              <tr key={datum.label}>
                <th scope="row">{datum.description ?? datum.label}</th>
                <td>
                  {datum.value}
                  {unit}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </figcaption>
    </figure>
  );
}

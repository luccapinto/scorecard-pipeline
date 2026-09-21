// Evidence-verification rate, drawn as a donut.
//
// Same accessibility contract as BarChart: the SVG is hidden from assistive
// tech and the real numbers are exposed as a table. The centre label is also
// plain text in the DOM, so the headline figure is readable even if the
// drawing never paints.

interface Segment {
  label: string;
  value: number;
  color: string;
}

interface Props {
  /** 0..1, or null when nothing was measured. */
  rate: number | null;
  segments: Segment[];
  title: string;
  /** Short text under the percentage, e.g. "citações conferidas". */
  caption: string;
}

const SIZE = 120;
const STROKE = 14;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function RateGauge({ rate, segments, title, caption }: Props) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);

  let offset = 0;
  const arcs = segments.map((segment) => {
    const fraction = total > 0 ? segment.value / total : 0;
    const arc = {
      ...segment,
      dash: fraction * CIRCUMFERENCE,
      gap: CIRCUMFERENCE - fraction * CIRCUMFERENCE,
      rotation: (offset / Math.max(total, 1)) * 360,
    };
    offset += segment.value;
    return arc;
  });

  return (
    <figure className="gauge">
      <div className="gauge__plot">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} aria-hidden="true">
          <circle
            className="gauge__track"
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            strokeWidth={STROKE}
            fill="none"
          />
          {arcs.map((arc) => (
            <circle
              key={arc.label}
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke={arc.color}
              strokeWidth={STROKE}
              strokeDasharray={`${arc.dash} ${arc.gap}`}
              // -90deg puts the first segment at 12 o'clock.
              transform={`rotate(${arc.rotation - 90} ${SIZE / 2} ${SIZE / 2})`}
            />
          ))}
        </svg>
        <p className="gauge__centre">
          <span className="gauge__value">
            {rate === null ? '—' : `${Math.round(rate * 100)}%`}
          </span>
          <span className="gauge__caption">{caption}</span>
        </p>
      </div>

      <ul className="gauge__legend">
        {segments.map((segment) => (
          <li key={segment.label} className="gauge__legend-item">
            <span
              className="gauge__swatch"
              style={{ background: segment.color }}
              aria-hidden="true"
            />
            <span className="gauge__legend-label">{segment.label}</span>
            <span className="gauge__legend-value">{segment.value}</span>
          </li>
        ))}
      </ul>

      <figcaption className="sr-only">
        <table>
          <caption>{title}</caption>
          <thead>
            <tr>
              <th scope="col">Categoria</th>
              <th scope="col">Citações</th>
            </tr>
          </thead>
          <tbody>
            {segments.map((segment) => (
              <tr key={segment.label}>
                <th scope="row">{segment.label}</th>
                <td>{segment.value}</td>
              </tr>
            ))}
            <tr>
              <th scope="row">Taxa de evidência verificada</th>
              <td>{rate === null ? 'não medida' : `${Math.round(rate * 100)}%`}</td>
            </tr>
          </tbody>
        </table>
      </figcaption>
    </figure>
  );
}

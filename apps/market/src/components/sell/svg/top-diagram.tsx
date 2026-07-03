import { MEASUREMENT_TEMPLATES } from "@bushpop/config";

import { ArrowDefs, FIGCAPTION_CLASS, GARMENT, Label, MEASURE, useDiagramId } from "./shared";

export function TopMeasurementDiagram() {
  const id = useDiagramId("measure-top");

  return (
    <figure className="m-0">
      <svg
        viewBox="0 0 380 360"
        className="w-full"
        role="img"
        aria-labelledby={`${id}-title ${id}-desc`}
      >
        <title id={`${id}-title`}>How to measure a top laid flat</title>
        <desc id={`${id}-desc`}>
          A flat-lay outline of a top showing where to measure the shoulder,
          chest, length and sleeve.
        </desc>
        <ArrowDefs id={id} />

        <path
          d="M120,80 L165,80 Q190,102 215,80 L260,80 L292,104 L300,150 L276,156 L260,134 L244,210 L250,330 L130,330 L136,210 L120,134 L104,156 L80,150 L88,104 Z"
          fill={GARMENT.fill}
          stroke={GARMENT.stroke}
          strokeWidth={GARMENT.strokeWidth}
          strokeLinejoin="round"
        />

        <line
          x1="120"
          y1="66"
          x2="260"
          y2="66"
          stroke={MEASURE.stroke}
          strokeWidth={MEASURE.strokeWidth}
          markerStart={`url(#${id}-arrow)`}
          markerEnd={`url(#${id}-arrow)`}
        />
        <Label x={190} y={59}>
          Shoulder
        </Label>

        <line
          x1="120"
          y1="134"
          x2="260"
          y2="134"
          stroke={MEASURE.stroke}
          strokeWidth={MEASURE.strokeWidth}
          strokeDasharray="5 4"
          markerStart={`url(#${id}-arrow)`}
          markerEnd={`url(#${id}-arrow)`}
        />
        <Label x={190} y={129}>
          Chest
        </Label>

        <line
          x1="64"
          y1="80"
          x2="64"
          y2="330"
          stroke={MEASURE.stroke}
          strokeWidth={MEASURE.strokeWidth}
          markerStart={`url(#${id}-arrow)`}
          markerEnd={`url(#${id}-arrow)`}
        />
        <Label x={56} y={205} rotate={-90}>
          Length
        </Label>

        <line
          x1="260"
          y1="80"
          x2="288"
          y2="152"
          stroke={MEASURE.stroke}
          strokeWidth={MEASURE.strokeWidth}
          markerStart={`url(#${id}-arrow)`}
          markerEnd={`url(#${id}-arrow)`}
        />
        <Label x={300} y={118}>
          Sleeve
        </Label>
      </svg>
      <figcaption className={FIGCAPTION_CLASS}>{MEASUREMENT_TEMPLATES.top.caption}</figcaption>
    </figure>
  );
}

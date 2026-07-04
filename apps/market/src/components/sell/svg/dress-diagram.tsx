import { MEASUREMENT_TEMPLATES } from "@bushpop/config";

import { ArrowDefs, FIGCAPTION_CLASS, GARMENT, Label, MEASURE, useDiagramId } from "./shared";

export function DressMeasurementDiagram() {
  const id = useDiagramId("measure-dress");

  return (
    <figure className="m-0">
      <svg
        viewBox="0 0 380 420"
        className="w-full"
        role="img"
        aria-labelledby={`${id}-title ${id}-desc`}
      >
        <title id={`${id}-title`}>How to measure a dress laid flat</title>
        <desc id={`${id}-desc`}>
          A flat-lay outline of a dress showing where to measure the chest,
          waist, hip and full length from shoulder to hem.
        </desc>
        <ArrowDefs id={id} />

        <path
          d="M120,72 L164,72 Q190,92 216,72 L260,72 L290,98 L298,144 L278,150 L260,128 L246,188 Q242,246 270,376 L110,376 Q138,246 134,188 L120,128 L102,150 L82,144 L90,98 Z"
          fill={GARMENT.fill}
          stroke={GARMENT.stroke}
          strokeWidth={GARMENT.strokeWidth}
          strokeLinejoin="round"
        />

        <line
          x1="120"
          y1="128"
          x2="260"
          y2="128"
          stroke={MEASURE.stroke}
          strokeWidth={MEASURE.strokeWidth}
          strokeDasharray="5 4"
          markerStart={`url(#${id}-arrow)`}
          markerEnd={`url(#${id}-arrow)`}
        />
        <Label x={190} y={123}>
          Chest
        </Label>

        <line
          x1="138"
          y1="188"
          x2="242"
          y2="188"
          stroke={MEASURE.stroke}
          strokeWidth={MEASURE.strokeWidth}
          strokeDasharray="5 4"
          markerStart={`url(#${id}-arrow)`}
          markerEnd={`url(#${id}-arrow)`}
        />
        <Label x={190} y={183}>
          Waist
        </Label>

        <line
          x1="126"
          y1="240"
          x2="254"
          y2="240"
          stroke={MEASURE.stroke}
          strokeWidth={MEASURE.strokeWidth}
          strokeDasharray="5 4"
          markerStart={`url(#${id}-arrow)`}
          markerEnd={`url(#${id}-arrow)`}
        />
        <Label x={190} y={235}>
          Hip
        </Label>

        <line
          x1="64"
          y1="72"
          x2="64"
          y2="376"
          stroke={MEASURE.stroke}
          strokeWidth={MEASURE.strokeWidth}
          markerStart={`url(#${id}-arrow)`}
          markerEnd={`url(#${id}-arrow)`}
        />
        <Label x={56} y={224} rotate={-90}>
          Length
        </Label>
      </svg>
      <figcaption className={FIGCAPTION_CLASS}>{MEASUREMENT_TEMPLATES.dress.caption}</figcaption>
    </figure>
  );
}

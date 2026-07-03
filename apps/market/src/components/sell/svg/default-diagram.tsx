import { MEASUREMENT_TEMPLATES } from "@bushpop/config";

import { ArrowDefs, FIGCAPTION_CLASS, GARMENT, Label, MEASURE, useDiagramId } from "./shared";

export function DefaultMeasurementDiagram() {
  const id = useDiagramId("measure-default");

  return (
    <figure className="m-0">
      <svg
        viewBox="0 0 320 280"
        className="w-full"
        role="img"
        aria-labelledby={`${id}-title ${id}-desc`}
      >
        <title id={`${id}-title`}>How to measure a flat item</title>
        <desc id={`${id}-desc`}>
          A generic flat-lay item outline showing width across the body and
          full length from top to bottom.
        </desc>
        <ArrowDefs id={id} />

        <path
          d="M96,72 H224 Q244,72 244,92 V196 Q244,216 224,216 H96 Q76,216 76,196 V92 Q76,72 96,72 Z"
          fill={GARMENT.fill}
          stroke={GARMENT.stroke}
          strokeWidth={GARMENT.strokeWidth}
          strokeLinejoin="round"
        />

        <line
          x1="88"
          y1="144"
          x2="232"
          y2="144"
          stroke={MEASURE.stroke}
          strokeWidth={MEASURE.strokeWidth}
          strokeDasharray="5 4"
          markerStart={`url(#${id}-arrow)`}
          markerEnd={`url(#${id}-arrow)`}
        />
        <Label x={160} y={137}>
          Width
        </Label>

        <line
          x1="58"
          y1="72"
          x2="58"
          y2="216"
          stroke={MEASURE.stroke}
          strokeWidth={MEASURE.strokeWidth}
          markerStart={`url(#${id}-arrow)`}
          markerEnd={`url(#${id}-arrow)`}
        />
        <Label x={50} y={148} rotate={-90}>
          Length
        </Label>
      </svg>
      <figcaption className={FIGCAPTION_CLASS}>{MEASUREMENT_TEMPLATES.default.caption}</figcaption>
    </figure>
  );
}

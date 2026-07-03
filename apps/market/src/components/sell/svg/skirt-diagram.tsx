import { MEASUREMENT_TEMPLATES } from "@bushpop/config";

import { ArrowDefs, FIGCAPTION_CLASS, GARMENT, Label, MEASURE, useDiagramId } from "./shared";

export function SkirtMeasurementDiagram() {
  const id = useDiagramId("measure-skirt");

  return (
    <figure className="m-0">
      <svg
        viewBox="0 0 320 380"
        className="w-full"
        role="img"
        aria-labelledby={`${id}-title ${id}-desc`}
      >
        <title id={`${id}-title`}>How to measure a skirt laid flat</title>
        <desc id={`${id}-desc`}>
          A flat-lay outline of a skirt showing where to measure the waist, hip
          and length from waistband to hem.
        </desc>
        <ArrowDefs id={id} />

        <path
          d="M110,80 L210,80 L248,320 L72,320 Z"
          fill={GARMENT.fill}
          stroke={GARMENT.stroke}
          strokeWidth={GARMENT.strokeWidth}
          strokeLinejoin="round"
        />

        <line
          x1="110"
          y1="66"
          x2="210"
          y2="66"
          stroke={MEASURE.stroke}
          strokeWidth={MEASURE.strokeWidth}
          markerStart={`url(#${id}-arrow)`}
          markerEnd={`url(#${id}-arrow)`}
        />
        <Label x={160} y={59}>
          Waist
        </Label>

        <line
          x1="94"
          y1="142"
          x2="226"
          y2="142"
          stroke={MEASURE.stroke}
          strokeWidth={MEASURE.strokeWidth}
          strokeDasharray="5 4"
          markerStart={`url(#${id}-arrow)`}
          markerEnd={`url(#${id}-arrow)`}
        />
        <Label x={160} y={137}>
          Hip
        </Label>

        <line
          x1="56"
          y1="80"
          x2="56"
          y2="320"
          stroke={MEASURE.stroke}
          strokeWidth={MEASURE.strokeWidth}
          markerStart={`url(#${id}-arrow)`}
          markerEnd={`url(#${id}-arrow)`}
        />
        <Label x={48} y={204} rotate={-90}>
          Length
        </Label>
      </svg>
      <figcaption className={FIGCAPTION_CLASS}>{MEASUREMENT_TEMPLATES.skirt.caption}</figcaption>
    </figure>
  );
}

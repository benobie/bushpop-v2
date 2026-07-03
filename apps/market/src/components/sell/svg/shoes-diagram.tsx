import { MEASUREMENT_TEMPLATES } from "@bushpop/config";

import { ArrowDefs, FIGCAPTION_CLASS, GARMENT, Label, MEASURE, useDiagramId } from "./shared";

export function ShoesMeasurementDiagram() {
  const id = useDiagramId("measure-shoes");

  return (
    <figure className="m-0">
      <svg
        viewBox="0 0 360 190"
        className="w-full"
        role="img"
        aria-labelledby={`${id}-title ${id}-desc`}
      >
        <title id={`${id}-title`}>How to measure an insole</title>
        <desc id={`${id}-desc`}>
          A shoe-sole outline showing the insole length measured from heel to
          toe.
        </desc>
        <ArrowDefs id={id} />

        <path
          d="M72,102 Q82,58 132,46 L250,46 Q288,46 308,70 Q324,90 318,114 Q310,146 266,150 L130,150 Q92,148 76,124 Q68,112 72,102 Z"
          fill={GARMENT.fill}
          stroke={GARMENT.stroke}
          strokeWidth={GARMENT.strokeWidth}
          strokeLinejoin="round"
        />

        <line
          x1="88"
          y1="100"
          x2="298"
          y2="100"
          stroke={MEASURE.stroke}
          strokeWidth={MEASURE.strokeWidth}
          strokeDasharray="5 4"
          markerStart={`url(#${id}-arrow)`}
          markerEnd={`url(#${id}-arrow)`}
        />
        <Label x={194} y={92}>
          Insole length
        </Label>
      </svg>
      <figcaption className={FIGCAPTION_CLASS}>{MEASUREMENT_TEMPLATES.shoes.caption}</figcaption>
    </figure>
  );
}

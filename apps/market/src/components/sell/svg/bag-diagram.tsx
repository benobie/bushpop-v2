import { MEASUREMENT_TEMPLATES } from "@bushpop/config";

import { ArrowDefs, FIGCAPTION_CLASS, GARMENT, Label, MEASURE, useDiagramId } from "./shared";

export function BagMeasurementDiagram() {
  const id = useDiagramId("measure-bag");

  return (
    <figure className="m-0">
      <svg
        viewBox="0 0 380 360"
        className="w-full"
        role="img"
        aria-labelledby={`${id}-title ${id}-desc`}
      >
        <title id={`${id}-title`}>How to measure a bag</title>
        <desc id={`${id}-desc`}>
          A bag outline with a front panel, side gusset and strap showing where
          to measure width, height, depth and strap drop.
        </desc>
        <ArrowDefs id={id} />

        <rect
          x="112"
          y="120"
          width="156"
          height="160"
          fill={GARMENT.fill}
          stroke={GARMENT.stroke}
          strokeWidth={GARMENT.strokeWidth}
          rx="10"
        />
        <path
          d="M268,120 L300,140 L300,280 L268,280 Z"
          fill={GARMENT.fill}
          stroke={GARMENT.stroke}
          strokeWidth={GARMENT.strokeWidth}
          strokeLinejoin="round"
        />
        <path
          d="M144,120 Q144,58 190,58 Q236,58 236,120"
          fill="none"
          stroke={GARMENT.stroke}
          strokeWidth={GARMENT.strokeWidth}
          strokeLinecap="round"
        />

        <line
          x1="112"
          y1="152"
          x2="268"
          y2="152"
          stroke={MEASURE.stroke}
          strokeWidth={MEASURE.strokeWidth}
          strokeDasharray="5 4"
          markerStart={`url(#${id}-arrow)`}
          markerEnd={`url(#${id}-arrow)`}
        />
        <Label x={190} y={145}>
          Width
        </Label>

        <line
          x1="92"
          y1="120"
          x2="92"
          y2="280"
          stroke={MEASURE.stroke}
          strokeWidth={MEASURE.strokeWidth}
          markerStart={`url(#${id}-arrow)`}
          markerEnd={`url(#${id}-arrow)`}
        />
        <Label x={84} y={204} rotate={-90}>
          Height
        </Label>

        <line
          x1="320"
          y1="58"
          x2="320"
          y2="120"
          stroke={MEASURE.stroke}
          strokeWidth={MEASURE.strokeWidth}
          markerStart={`url(#${id}-arrow)`}
          markerEnd={`url(#${id}-arrow)`}
        />
        <Label x={332} y={92} rotate={-90}>
          Strap drop
        </Label>

        <line
          x1="268"
          y1="296"
          x2="300"
          y2="296"
          stroke={MEASURE.stroke}
          strokeWidth={MEASURE.strokeWidth}
          markerStart={`url(#${id}-arrow)`}
          markerEnd={`url(#${id}-arrow)`}
        />
        <Label x={284} y={311}>
          Depth
        </Label>
      </svg>
      <figcaption className={FIGCAPTION_CLASS}>{MEASUREMENT_TEMPLATES.bag.caption}</figcaption>
    </figure>
  );
}

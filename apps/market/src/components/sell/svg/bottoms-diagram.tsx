import { MEASUREMENT_TEMPLATES } from "@bushpop/config";

import { ArrowDefs, FIGCAPTION_CLASS, GARMENT, Label, MEASURE, useDiagramId } from "./shared";

export function BottomsMeasurementDiagram() {
  const id = useDiagramId("measure-bottoms");

  return (
    <figure className="m-0">
      <svg
        viewBox="0 0 360 470"
        className="w-full"
        role="img"
        aria-labelledby={`${id}-title ${id}-desc`}
      >
        <title id={`${id}-title`}>How to measure bottoms laid flat</title>
        <desc id={`${id}-desc`}>
          A flat-lay outline of a pair of bottoms showing where to measure the
          waist, hip, front rise, inseam and leg opening.
        </desc>
        <ArrowDefs id={id} />

        <path
          d="M150,70 L250,70 L264,128 L252,430 L216,430 L200,180 L184,430 L148,430 L116,128 Z"
          fill={GARMENT.fill}
          stroke={GARMENT.stroke}
          strokeWidth={GARMENT.strokeWidth}
          strokeLinejoin="round"
        />

        <line
          x1="150"
          y1="58"
          x2="250"
          y2="58"
          stroke={MEASURE.stroke}
          strokeWidth={MEASURE.strokeWidth}
          markerStart={`url(#${id}-arrow)`}
          markerEnd={`url(#${id}-arrow)`}
        />
        <Label x={200} y={51}>
          Waist
        </Label>

        <line
          x1="116"
          y1="128"
          x2="264"
          y2="128"
          stroke={MEASURE.stroke}
          strokeWidth={MEASURE.strokeWidth}
          strokeDasharray="5 4"
          markerStart={`url(#${id}-arrow)`}
          markerEnd={`url(#${id}-arrow)`}
        />
        <Label x={190} y={123}>
          Hip
        </Label>

        <line
          x1="216"
          y1="70"
          x2="216"
          y2="180"
          stroke={MEASURE.stroke}
          strokeWidth={MEASURE.strokeWidth}
          strokeDasharray="5 4"
          markerStart={`url(#${id}-arrow)`}
          markerEnd={`url(#${id}-arrow)`}
        />
        <Label x={228} y={130} rotate={-90}>
          Rise
        </Label>

        <line
          x1="200"
          y1="180"
          x2="200"
          y2="430"
          stroke={MEASURE.stroke}
          strokeWidth={MEASURE.strokeWidth}
          strokeDasharray="5 4"
          markerStart={`url(#${id}-arrow)`}
          markerEnd={`url(#${id}-arrow)`}
        />
        <Label x={214} y={306} rotate={-90}>
          Inseam
        </Label>

        <line
          x1="216"
          y1="444"
          x2="252"
          y2="444"
          stroke={MEASURE.stroke}
          strokeWidth={MEASURE.strokeWidth}
          markerStart={`url(#${id}-arrow)`}
          markerEnd={`url(#${id}-arrow)`}
        />
        <Label x={234} y={459}>
          Leg opening
        </Label>
      </svg>
      <figcaption className={FIGCAPTION_CLASS}>{MEASUREMENT_TEMPLATES.bottoms.caption}</figcaption>
    </figure>
  );
}

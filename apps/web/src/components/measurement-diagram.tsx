// Flat-lay garment measurement diagrams for the how-to-measure guide.
// Pure RSC, zero client JS — inline SVG keeps the content pages image-free and
// fast (no raster requests, crisp at any zoom). The guide teaches measuring a
// garment laid flat, so these are flat-lay garment outlines (a top and a pair
// of bottoms) with labelled double-arrow measurement lines, NOT a body figure.
//
// Accessibility + crawlability: each <svg> is role="img" with aria-labelledby
// pointing at a <title> (short name) and <desc> (the measurements shown), so
// screen readers and crawlers get the content as text.
//
// Styling is intentionally neutral (gray garment outline, dark-gray measurement
// lines) so the Launch-2 brand system can re-skin it. Inline labels use a white
// paint-order halo so they stay legible where they cross the garment.

// Shared marker arrowheads. Marker IDs must be unique per document, so each
// diagram defines its own with a prefix.
function ArrowDefs({ id }: { id: string }) {
  return (
    <defs>
      <marker
        id={`${id}-arrow`}
        markerWidth="9"
        markerHeight="9"
        refX="4.5"
        refY="4.5"
        orient="auto"
      >
        <path d="M1.5,1.5 L7,4.5 L1.5,7.5" fill="none" stroke="#374151" strokeWidth="1.3" />
      </marker>
    </defs>
  );
}

const GARMENT = {
  fill: "#f3f4f6",
  stroke: "#9ca3af",
  strokeWidth: 2,
} as const;

const MEASURE = {
  stroke: "#374151",
  strokeWidth: 1.5,
} as const;

// Inline label sitting on/near a measurement line, with a white halo so it
// stays readable over the garment fill.
function Label({
  x,
  y,
  children,
  rotate,
}: {
  x: number;
  y: number;
  children: string;
  rotate?: number;
}) {
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      fontSize="13"
      fontWeight={600}
      fill="#111827"
      stroke="#ffffff"
      strokeWidth="3.5"
      paintOrder="stroke"
      transform={rotate ? `rotate(${rotate} ${x} ${y})` : undefined}
    >
      {children}
    </text>
  );
}

function TopDiagram() {
  const id = "measure-top";
  return (
    <figure className="m-0">
      <svg
        viewBox="0 0 380 360"
        className="w-full"
        role="img"
        aria-labelledby={`${id}-title ${id}-desc`}
      >
        <title id={`${id}-title`}>How to measure a top or dress, laid flat</title>
        <desc id={`${id}-desc`}>
          A flat-lay outline of a top showing where to measure the shoulder
          (seam to seam across the back), bust or chest (underarm seam to
          underarm seam), waist (across the narrowest point), sleeve (shoulder
          seam to cuff) and length (high shoulder point to hem).
        </desc>
        <ArrowDefs id={id} />

        {/* Garment outline */}
        <path
          d="M120,80 L165,80 Q190,102 215,80 L260,80 L292,104 L300,150 L276,156 L260,134 L244,210 L250,330 L130,330 L136,210 L120,134 L104,156 L80,150 L88,104 Z"
          fill={GARMENT.fill}
          stroke={GARMENT.stroke}
          strokeWidth={GARMENT.strokeWidth}
          strokeLinejoin="round"
        />

        {/* Shoulder — across the top between shoulder seams */}
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

        {/* Bust / chest — across at the underarm seams */}
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
          Bust / chest
        </Label>

        {/* Waist — across the narrowest point */}
        <line
          x1="136"
          y1="210"
          x2="244"
          y2="210"
          stroke={MEASURE.stroke}
          strokeWidth={MEASURE.strokeWidth}
          strokeDasharray="5 4"
          markerStart={`url(#${id}-arrow)`}
          markerEnd={`url(#${id}-arrow)`}
        />
        <Label x={190} y={205}>
          Waist
        </Label>

        {/* Length — high shoulder point straight down to hem */}
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

        {/* Sleeve — shoulder seam to cuff */}
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
      <figcaption className="mt-2 text-center text-sm text-gray-600">
        Tops &amp; dresses — measure flat, then double the bust, waist and hip
        figures for the full circumference.
      </figcaption>
    </figure>
  );
}

function BottomsDiagram() {
  const id = "measure-bottoms";
  return (
    <figure className="m-0">
      <svg
        viewBox="0 0 360 460"
        className="w-full"
        role="img"
        aria-labelledby={`${id}-title ${id}-desc`}
      >
        <title id={`${id}-title`}>How to measure bottoms, laid flat</title>
        <desc id={`${id}-desc`}>
          A flat-lay outline of a pair of trousers showing where to measure the
          waist (across the waistband), hips (across the widest point), length
          (top of the waistband down the outside leg to the hem) and inseam
          (crotch seam straight down to the bottom of the leg).
        </desc>
        <ArrowDefs id={id} />

        {/* Garment outline */}
        <path
          d="M150,70 L250,70 L264,128 L252,430 L216,430 L200,180 L184,430 L148,430 L116,128 Z"
          fill={GARMENT.fill}
          stroke={GARMENT.stroke}
          strokeWidth={GARMENT.strokeWidth}
          strokeLinejoin="round"
        />

        {/* Waist — across the waistband */}
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

        {/* Hips — across the widest point */}
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
          Hips
        </Label>

        {/* Length — waistband top down the outside leg to the hem */}
        <line
          x1="96"
          y1="70"
          x2="96"
          y2="430"
          stroke={MEASURE.stroke}
          strokeWidth={MEASURE.strokeWidth}
          markerStart={`url(#${id}-arrow)`}
          markerEnd={`url(#${id}-arrow)`}
        />
        <Label x={88} y={250} rotate={-90}>
          Length
        </Label>

        {/* Inseam — crotch seam straight down to the leg bottom */}
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
        <Label x={200} y={306}>
          Inseam
        </Label>
      </svg>
      <figcaption className="mt-2 text-center text-sm text-gray-600">
        Bottoms — measure flat, then double the waist and hip figures for the
        full circumference.
      </figcaption>
    </figure>
  );
}

// Both flat-lay diagrams, side by side on wider screens and stacked on mobile.
export function MeasurementDiagrams() {
  return (
    <div
      className="my-8 grid grid-cols-1 gap-8 sm:grid-cols-2"
      aria-label="Garment measurement diagrams"
    >
      <TopDiagram />
      <BottomsDiagram />
    </div>
  );
}

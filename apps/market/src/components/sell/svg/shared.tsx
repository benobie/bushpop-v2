import { useId } from "react";

export function useDiagramId(prefix: string) {
  const id = useId();
  return `${prefix}-${id.replace(/:/g, "")}`;
}

export function ArrowDefs({ id }: { id: string }) {
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

export const GARMENT = {
  fill: "#f3f4f6",
  stroke: "#9ca3af",
  strokeWidth: 2,
} as const;

export const MEASURE = {
  stroke: "#374151",
  strokeWidth: 1.5,
} as const;

export function Label({
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

export const FIGCAPTION_CLASS = "mt-2 text-center text-sm text-gray-600";

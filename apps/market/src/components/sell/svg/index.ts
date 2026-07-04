import { createElement } from "react";

import type { MeasurementTemplateKey } from "@bushpop/config";

import { BagMeasurementDiagram } from "./bag-diagram";
import { BottomsMeasurementDiagram } from "./bottoms-diagram";
import { DefaultMeasurementDiagram } from "./default-diagram";
import { DressMeasurementDiagram } from "./dress-diagram";
import { ShoesMeasurementDiagram } from "./shoes-diagram";
import { SkirtMeasurementDiagram } from "./skirt-diagram";
import { TopMeasurementDiagram } from "./top-diagram";

export * from "./bag-diagram";
export * from "./bottoms-diagram";
export * from "./default-diagram";
export * from "./dress-diagram";
export * from "./shoes-diagram";
export * from "./skirt-diagram";
export * from "./top-diagram";

function assertNever(value: never): never {
  throw new Error(`Unhandled measurement template: ${value}`);
}

export function MeasurementDiagram({
  templateKey,
}: {
  templateKey: MeasurementTemplateKey;
}) {
  switch (templateKey) {
    case "top":
      return createElement(TopMeasurementDiagram);
    case "dress":
      return createElement(DressMeasurementDiagram);
    case "bottoms":
      return createElement(BottomsMeasurementDiagram);
    case "skirt":
      return createElement(SkirtMeasurementDiagram);
    case "shoes":
      return createElement(ShoesMeasurementDiagram);
    case "bag":
      return createElement(BagMeasurementDiagram);
    case "default":
      return createElement(DefaultMeasurementDiagram);
    default:
      return assertNever(templateKey);
  }
}

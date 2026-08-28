import type { ModelFailureContext } from "./model.js";

let currentFailureContext: ModelFailureContext | undefined;

export function setModelFailureContext(context: ModelFailureContext | undefined): void {
  currentFailureContext = context;
}

export function getModelFailureContext(): ModelFailureContext | undefined {
  return currentFailureContext;
}

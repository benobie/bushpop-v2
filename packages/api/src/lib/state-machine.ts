export type StateMachine<S extends string> = Partial<Record<S, readonly S[]>>;

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: string,
    public readonly to: string,
    public readonly entity: string,
  ) {
    super(`Invalid ${entity} transition: ${from} → ${to}`);
    this.name = "InvalidTransitionError";
  }
}

export function transition<S extends string>(
  machine: StateMachine<S>,
  entity: string,
  from: S,
  to: S,
): S {
  const allowed = machine[from];
  if (!allowed || !allowed.includes(to)) {
    throw new InvalidTransitionError(from, to, entity);
  }
  return to;
}

// Pre-defined state machines (populated in later phases)
// Example usage:
// const ORDER_STATES = {
//   pending: ["paid", "cancelled"] as const,
//   paid: ["shipped", "refunded"] as const,
//   shipped: ["delivered", "disputed"] as const,
// } satisfies StateMachine<string>;

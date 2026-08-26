export const PLAN_NAMES = ["Starter", "Growth", "Pro"] as const;
export type PlanName = (typeof PLAN_NAMES)[number];

const PLAN_RANK: Record<PlanName, number> = {
  Starter: 0,
  Growth: 1,
  Pro: 2,
};

export function planAtLeast(activePlan: PlanName | undefined, required: PlanName) {
  if (!activePlan) return false;
  return PLAN_RANK[activePlan] >= PLAN_RANK[required];
}
export const PLAN_NAMES = ["Starter", "Growth", "Pro"] as const;
export type PlanName = (typeof PLAN_NAMES)[number];

const PLAN_HIERARCHY: Record<PlanName, number> = {
  Starter: 1,
  Growth: 2,
  Pro: 3,
};

export function planAtLeast(
  currentPlan: PlanName | undefined | null,
  requiredPlan: PlanName,
): boolean {
  if (!currentPlan) return false;
  return PLAN_HIERARCHY[currentPlan] >= PLAN_HIERARCHY[requiredPlan];
}
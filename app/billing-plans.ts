export const PLAN_NAMES = ["Starter", "Growth", "Pro"] as const;
export type PlanName = (typeof PLAN_NAMES)[number];
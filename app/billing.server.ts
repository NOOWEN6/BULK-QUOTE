import { redirect } from "react-router";
import { authenticate } from "./shopify.server";
import { PLAN_NAMES, type PlanName } from "./billing-plans";

export async function requireActiveSubscription(request: Request) {
  const { billing, session, admin } = await authenticate.admin(request);

  const billingCheck = await billing.require({
    plans: [...PLAN_NAMES],
    onFailure: async () => redirect("/app/pricing"),
  });

  const activePlan = billingCheck.appSubscriptions[0]?.name as
    | PlanName
    | undefined;

  return { session, admin, activePlan };
}
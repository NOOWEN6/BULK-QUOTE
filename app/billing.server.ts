import { redirect } from "react-router";
import { authenticate } from "./shopify.server";
import { PLAN_NAMES, type PlanName } from "./billing-plans";

function isRedirect(error: unknown): error is Response {
  return error instanceof Response;
}

function isFetchDead(error: unknown) {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg.includes("fetch failed") ||
    msg.includes("no response available") ||
    msg.includes("ECONNRESET")
  );
}

async function withRetries<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      last = error;
      if (isRedirect(error) || !isFetchDead(error) || i === attempts - 1) {
        throw error;
      }
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw last;
}

export async function requireActiveSubscription(request: Request) {
  const { billing, session, admin } = await authenticate.admin(request);

  try {
    const billingCheck = await withRetries(() =>
      billing.require({
        plans: [...PLAN_NAMES],
        isTest: true,
        onFailure: async () => redirect("/app/pricing"),
      }),
    );

    const activePlan = billingCheck.appSubscriptions[0]?.name as
      | PlanName
      | undefined;

    return { session, admin, activePlan };
  } catch (error) {
    if (isRedirect(error)) throw error;

    const cause =
      error instanceof Error && "cause" in error ? error.cause : undefined;
    console.error("[billing] Admin GraphQL failed", {
      message: error instanceof Error ? error.message : String(error),
      cause,
      causeCode:
        cause && typeof cause === "object" && "code" in cause
          ? (cause as { code?: string }).code
          : undefined,
    });

    // Don't white-screen the app if Shopify's API is unreachable.
    return { session, admin, activePlan: undefined };
  }
}
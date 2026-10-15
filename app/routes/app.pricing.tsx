import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { Form, useLoaderData, useNavigation, useRouteError } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export type PlanName = "Starter" | "Growth" | "Pro";

const PLAN_NAMES: PlanName[] = ["Starter", "Growth", "Pro"];

const PLAN_DETAILS: Record<PlanName, { price: string; features: string[] }> = {
  Starter: {
    price: "$19/mo",
    features: [
      "Wholesale quote widget on storefront",
      "Unlimited discount tiers",
      "Manual approve / reject of quote requests",
    ],
  },
  Growth: {
    price: "$49/mo",
    features: [
      "Everything in Starter",
      "Convert quote requests to draft orders",
      "Discount auto-applied on conversion",
    ],
  },
  Pro: {
    price: "$99/mo",
    features: [
      "Everything in Growth",
      "Priority support",
      "Early access to new features",
    ],
  },
};

// ---------- Loader ----------

export async function loader({ request }: LoaderFunctionArgs) {
  // Simple auth check without strict billing verification to prevent loader crashes
  await authenticate.admin(request);
  return { activePlan: undefined };
}

// ---------- Action ----------

export async function action({ request }: ActionFunctionArgs) {
  const { billing } = await authenticate.admin(request);
  const formData = await request.formData();
  const plan = formData.get("plan") as PlanName;

  if (!PLAN_NAMES.includes(plan)) {
    return { error: "Unknown plan" };
  }

  return billing.request({
    plan,
    isTest: true,
    returnUrl: "/app",
  });
}

// ---------- UI ----------

function PlanCard({ name, isActive }: { name: PlanName; isActive: boolean }) {
  const navigation = useNavigation();
  const busy =
    navigation.state !== "idle" &&
    navigation.formData?.get("plan") === name;
  const { price, features } = PLAN_DETAILS[name];

  return (
    <s-section heading={name}>
      <Form method="post">
        <input type="hidden" name="plan" value={name} />
        <s-stack direction="block" gap="base">
          {isActive && <s-badge tone="success">Current plan</s-badge>}
          <s-heading>{price}</s-heading>
          <s-unordered-list>
            {features.map((f) => (
              <s-list-item key={f}>{f}</s-list-item>
            ))}
          </s-unordered-list>
          <s-button
            type="submit"
            variant={isActive ? "secondary" : "primary"}
            disabled={isActive || busy}
          >
            {isActive ? "Current plan" : busy ? "Redirecting…" : `Choose ${name}`}
          </s-button>
        </s-stack>
      </Form>
    </s-section>
  );
}

export default function Pricing() {
  const { activePlan } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Plans & pricing">
      <s-stack direction="inline" gap="base">
        {PLAN_NAMES.map((name) => (
          <PlanCard key={name} name={name} isActive={activePlan === name} />
        ))}
      </s-stack>
    </s-page>
  );
}

// ---------- Error Boundary ----------

export function ErrorBoundary() {
  const error = useRouteError();
  console.error("[Pricing ErrorBoundary Caught]:", error);

  return (
    <s-page heading="Pricing Page Error">
      <s-section heading="Details">
        <s-paragraph>
          <s-text type="strong">Error Details:</s-text> {error instanceof Error ? error.message : "Unexpected Server Error"}
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs: Parameters<typeof boundary.headers>[0]) => {
  return boundary.headers(headersArgs);
};
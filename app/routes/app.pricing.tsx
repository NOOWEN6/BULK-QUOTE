import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { Form, useLoaderData, useNavigation, useRouteError } from "react-router";
import { authenticate } from "../shopify.server";
import { PLAN_NAMES, type PlanName } from "../billing-plans";
import { boundary } from "@shopify/shopify-app-react-router/server";

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
    <div style={{ border: "1px solid #ccc", padding: "16px", borderRadius: "8px", flex: "1", minWidth: "220px" }}>
      <h3>{name}</h3>
      <Form method="post">
        <input type="hidden" name="plan" value={name} />
        <h4>{price}</h4>
        <ul>
          {features.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
        <button
          type="submit"
          disabled={isActive || busy}
          style={{ padding: "8px 16px", cursor: "pointer" }}
        >
          {isActive ? "Current plan" : busy ? "Redirecting…" : `Choose ${name}`}
        </button>
      </Form>
    </div>
  );
}

export default function Pricing() {
  const { activePlan } = useLoaderData<typeof loader>();

  return (
    <div style={{ padding: "20px" }}>
      <h1>Plans & pricing</h1>
      <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginTop: "20px" }}>
        {PLAN_NAMES.map((name) => (
          <PlanCard key={name} name={name} isActive={activePlan === name} />
        ))}
      </div>
    </div>
  );
}

// ---------- Error Boundary ----------

export function ErrorBoundary() {
  const error = useRouteError();
  console.error("[Pricing ErrorBoundary Caught]:", error);

  return (
    <div style={{ padding: "20px", color: "red" }}>
      <h1>Pricing Page Error</h1>
      <p>{error instanceof Error ? error.message : "Unexpected Server Error"}</p>
    </div>
  );
}

export const headers = (headersArgs: Parameters<typeof boundary.headers>[0]) => {
  return boundary.headers(headersArgs);
};
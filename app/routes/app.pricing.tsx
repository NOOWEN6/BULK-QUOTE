import type { HeadersFunction, LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { Form, useLoaderData, useNavigation, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { PLAN_NAMES, type PlanName } from "../billing-plans";

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
  const { billing } = await authenticate.admin(request);

  let activePlan: PlanName | undefined;
  try {
    const check = await billing.check({
      plans: [...PLAN_NAMES],
      isTest: true,
    });
    if (check.hasActivePayment) {
      activePlan = check.appSubscriptions[0]?.name as PlanName;
    }
  } catch (error) {
    console.error("[pricing loader billing check error]", error);
  }

  return { activePlan };
}

// ---------- Action ----------

export async function action({ request }: ActionFunctionArgs) {
  const { billing, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const plan = formData.get("plan") as PlanName;

  if (!PLAN_NAMES.includes(plan)) {
    return { error: "Unknown plan" };
  }

  const shopClean = session.shop.replace(".myshopify.com", "");
  const apiKey = process.env.SHOPIFY_API_KEY || "258db1e1b2e23745ddcce9d05ecf2a63";

  // Deep-link embedded return URL so App Bridge handles the landing smoothly
  const returnUrl = `https://admin.shopify.com/store/${shopClean}/apps/${apiKey}/app`;

  return billing.request({
    plan,
    isTest: true,
    returnUrl,
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
    <div
      style={{
        border: isActive ? "2px solid #008060" : "1px solid #ccc",
        padding: "16px",
        borderRadius: "8px",
        flex: "1",
        minWidth: "220px",
        background: isActive ? "#f6fdf9" : "#fff",
      }}
    >
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
          style={{
            padding: "8px 16px",
            cursor: isActive || busy ? "not-allowed" : "pointer",
            background: isActive ? "#ccc" : "#008060",
            color: "#fff",
            border: "none",
            borderRadius: "4px",
          }}
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
      <div
        style={{
          display: "flex",
          gap: "16px",
          flexWrap: "wrap",
          marginTop: "20px",
        }}
      >
        {PLAN_NAMES.map((name) => (
          <PlanCard key={name} name={name} isActive={activePlan === name} />
        ))}
      </div>
    </div>
  );
}

// ---------- Boundary & Headers ----------

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
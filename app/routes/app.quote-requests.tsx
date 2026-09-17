import { useState } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { requireActiveSubscription } from "../billing.server";
import { planAtLeast, type PlanName } from "../billing-plans";
import db from "../db.server";

type ActionData = {
  ok?: boolean;
  error?: string;
  checkoutUrl?: string;
};

// ---------- Loader ----------

export async function loader({ request }: LoaderFunctionArgs) {
  const { session, activePlan } = await requireActiveSubscription(request);

  const quoteRequests = await db.quoteRequest.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: "desc" },
  });

  return { quoteRequests, activePlan };
}

// ---------- Action ----------

export async function action({ request }: ActionFunctionArgs) {
  const { admin, session, activePlan } = await requireActiveSubscription(request);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const id = formData.get("id") as string;

  const quoteRequest = await db.quoteRequest.findFirst({
    where: { id, shop: session.shop },
  });

  if (!quoteRequest) {
    return { error: "Quote request not found" } satisfies ActionData;
  }

  if (intent === "reject") {
    await db.quoteRequest.update({
      where: { id },
      data: { status: "rejected" },
    });
    return { ok: true } satisfies ActionData;
  }

  if (intent === "approve") {
    await db.quoteRequest.update({
      where: { id },
      data: { status: "approved" },
    });
    return { ok: true } satisfies ActionData;
  }

  if (intent === "convert") {
    if (!activePlan || !planAtLeast(activePlan, "Growth")) {
      return {
        error: "Converting to orders requires the Growth plan or higher.",
      } satisfies ActionData;
    }

    const discountRule = await db.discountRule.findFirst({
      where: {
        shop: session.shop,
        minQty: { lte: quoteRequest.quantity },
        OR: [{ maxQty: null }, { maxQty: { gte: quoteRequest.quantity } }],
      },
      orderBy: { minQty: "desc" },
    });

    if (!quoteRequest.variantId || !quoteRequest.productId) {
      return {
        error:
          "This quote request has no product/variant on file — can't create a checkout link for it.",
      } satisfies ActionData;
    }

    const numericVariantId = quoteRequest.variantId.startsWith("gid://")
      ? quoteRequest.variantId.split("/").pop()
      : quoteRequest.variantId;

    const productGid = quoteRequest.productId.startsWith("gid://")
      ? quoteRequest.productId
      : `gid://shopify/Product/${quoteRequest.productId}`;

    let discountCode: string | null = null;

    if (discountRule) {
      const code = `WHOLESALE-${quoteRequest.id.slice(-8).toUpperCase()}`;

      const discountResponse = await admin.graphql(
        `#graphql
        mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
          discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
            codeDiscountNode {
              id
            }
            userErrors {
              field
              message
            }
          }
        }`,
        {
          variables: {
            basicCodeDiscount: {
              title: `Wholesale quote — ${quoteRequest.companyName}`,
              code,
              startsAt: new Date().toISOString(),
              usageLimit: 1,
              appliesOncePerCustomer: true,
              customerSelection: { all: true },
              customerGets: {
                value: { percentage: Number(discountRule.discountPct) / 100 },
                items: {
                  products: {
                    productsToAdd: [productGid],
                  },
                },
              },
            },
          },
        },
      );

      const discountResult = await discountResponse.json();
      const discountErrors = discountResult.data?.discountCodeBasicCreate?.userErrors;

      if (discountErrors?.length) {
        return {
          error: discountErrors.map((e: { message: string }) => e.message).join(", "),
        } satisfies ActionData;
      }

      discountCode = code;
    }

    const checkoutUrl = discountCode
      ? `https://${session.shop}/cart/${numericVariantId}:${quoteRequest.quantity}?discount=${discountCode}`
      : `https://${session.shop}/cart/${numericVariantId}:${quoteRequest.quantity}`;

    await db.quoteRequest.update({
      where: { id },
      data: { status: "converted", checkoutUrl },
    });

    return { ok: true, checkoutUrl } satisfies ActionData;
  }

  return { error: "Unknown action" } satisfies ActionData;
}

// ---------- UI ----------

function statusTone(status: string) {
  switch (status) {
    case "new":
      return "info" as const;
    case "approved":
      return "caution" as const;
    case "rejected":
      return "critical" as const;
    case "converted":
      return "success" as const;
    default:
      return "neutral" as const;
  }
}

function RowActions({
  request,
  activePlan,
}: {
  request: { id: string; status: string; checkoutUrl: string | null };
  activePlan: PlanName | undefined;
}) {
  const fetcher = useFetcher<ActionData>();
  const busy = fetcher.state !== "idle";
  const canConvert = !!activePlan && planAtLeast(activePlan, "Growth");

  if (request.status === "converted") {
    return request.checkoutUrl ? (
      <s-link href={request.checkoutUrl} target="_blank">
        Open checkout link
      </s-link>
    ) : (
      <s-text tone="neutral">—</s-text>
    );
  }

  if (request.status === "rejected") {
    return <s-text tone="neutral">—</s-text>;
  }

  return (
    <s-stack direction="inline" gap="small">
      {request.status === "new" && (
        <s-button
          variant="secondary"
          disabled={busy}
          onClick={() =>
            fetcher.submit({ intent: "approve", id: request.id }, { method: "post" })
          }
        >
          Approve
        </s-button>
      )}
      <s-button
        variant="tertiary"
        tone="critical"
        disabled={busy}
        onClick={() =>
          fetcher.submit({ intent: "reject", id: request.id }, { method: "post" })
        }
      >
        Reject
      </s-button>
      <s-button
        variant="primary"
        disabled={busy || !canConvert}
        onClick={() =>
          fetcher.submit({ intent: "convert", id: request.id }, { method: "post" })
        }
      >
        {canConvert ? "Get checkout link" : "Checkout link (Growth+)"}
      </s-button>
      {fetcher.data?.error ? (
        <s-text tone="critical">{fetcher.data.error}</s-text>
      ) : null}
      {fetcher.data?.checkoutUrl ? (
        <s-link href={fetcher.data.checkoutUrl} target="_blank">
          Open checkout link
        </s-link>
      ) : null}
    </s-stack>
  );
}

export default function QuoteRequests() {
  const { quoteRequests, activePlan } = useLoaderData<typeof loader>();
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const filtered = statusFilter
    ? quoteRequests.filter((r: typeof quoteRequests[0]) => r.status === statusFilter)
    : quoteRequests;

  if (quoteRequests.length === 0) {
    return (
      <s-page heading="Quote requests">
        <s-section>
          <s-paragraph>
            When a customer submits a wholesale quote request from your storefront,
            it will show up here.
          </s-paragraph>
        </s-section>
      </s-page>
    );
  }

  const statuses: (string | null)[] = ["new", "approved", "rejected", "converted", null];

  return (
    <s-page heading="Quote requests">
      <s-section padding="none">
        <s-box padding="base">
          <s-stack direction="inline" gap="small">
            {statuses.map((s) => (
              <s-button
                key={s ?? "all"}
                variant={statusFilter === s ? "primary" : "secondary"}
                onClick={() => setStatusFilter(s)}
              >
                {s ? s[0].toUpperCase() + s.slice(1) : "All"}
              </s-button>
            ))}
          </s-stack>
        </s-box>
        <s-table>
          <s-table-header-row>
            <s-table-header>Company</s-table-header>
            <s-table-header>Email</s-table-header>
            <s-table-header>Product</s-table-header>
            <s-table-header>Qty</s-table-header>
            <s-table-header>Notes</s-table-header>
            <s-table-header>Received</s-table-header>
            <s-table-header>Status</s-table-header>
            <s-table-header>Actions</s-table-header>
          </s-table-header-row>
          <s-table-body>
            {filtered.map((request: typeof quoteRequests[0]) => (
              <s-table-row key={request.id}>
                <s-table-cell>{request.companyName}</s-table-cell>
                <s-table-cell>{request.email || "—"}</s-table-cell>
                <s-table-cell>{request.productId}</s-table-cell>
                <s-table-cell>{request.quantity}</s-table-cell>
                <s-table-cell>{request.notes || "—"}</s-table-cell>
                <s-table-cell>
                  {new Date(request.createdAt).toLocaleDateString()}
                </s-table-cell>
                <s-table-cell>
                  <s-badge tone={statusTone(request.status)}>{request.status}</s-badge>
                </s-table-cell>
                <s-table-cell>
                  <RowActions request={request} activePlan={activePlan} />
                </s-table-cell>
              </s-table-row>
               ))}
          </s-table-body>
        </s-table>
      </s-section>
    </s-page>
  );
}
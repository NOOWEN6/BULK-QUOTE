import { useState } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { requireActiveSubscription } from "../billing.server";
import { planAtLeast, type PlanName } from "../billing-plans";
import db from "../db.server";

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
    return { error: "Quote request not found" };
  }

  if (intent === "reject") {
    await db.quoteRequest.update({
      where: { id },
      data: { status: "rejected" },
    });
    return { ok: true };
  }

  if (intent === "approve") {
    await db.quoteRequest.update({
      where: { id },
      data: { status: "approved" },
    });
    return { ok: true };
  }

  if (intent === "convert") {
    if (!planAtLeast(activePlan, "Growth")) {
      return { error: "Converting to orders requires the Growth plan or higher." };
    }

    const discountRule = await db.discountRule.findFirst({
  where: {
    shop: session.shop,
    minQty: { lte: quoteRequest.quantity },
    OR: [{ maxQty: null }, { maxQty: { gte: quoteRequest.quantity } }],
  },
  orderBy: { minQty: "desc" },
});
    const variantGid = quoteRequest.variantId
      ? quoteRequest.variantId.startsWith("gid://")
        ? quoteRequest.variantId
        : `gid://shopify/ProductVariant/${quoteRequest.variantId}`
      : null;

    if (!variantGid) {
      return { error: "This quote request has no variant on file — can't create an order line for it." };
    }

    const lineItem: Record<string, unknown> = {
      variantId: variantGid,
      quantity: quoteRequest.quantity,
    };

    if (discountRule) {
      lineItem.appliedDiscount = {
        title: `Wholesale discount (${discountRule.discountPct}%)`,
        value: discountRule.discountPct,
        valueType: "PERCENTAGE",
      };
    }

    const response = await admin.graphql(
      `#graphql
      mutation draftOrderCreate($input: DraftOrderInput!) {
        draftOrderCreate(input: $input) {
          draftOrder {
            id
            name
            invoiceUrl
          }
          userErrors {
            field
            message
          }
        }
      }`,
      {
        variables: {
          input: {
            lineItems: [lineItem],
            email: quoteRequest.email || undefined,
            note: quoteRequest.notes
              ? `Wholesale quote request — ${quoteRequest.companyName}\n${quoteRequest.notes}`
              : `Wholesale quote request — ${quoteRequest.companyName}`,
          },
        },
      },
    );

    const result = await response.json();
    const userErrors = result.data?.draftOrderCreate?.userErrors;

    if (userErrors?.length) {
      return { error: userErrors.map((e: { message: string }) => e.message).join(", ") };
    }

    await db.quoteRequest.update({
      where: { id },
      data: { status: "converted" },
    });

    return {
      ok: true,
      draftOrder: result.data?.draftOrderCreate?.draftOrder,
    };
  }

  return { error: "Unknown action" };
}

// ---------- UI ----------

type QuoteRequest = Awaited<ReturnType<typeof loader>>["quoteRequests"][number];

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
      return undefined;
  }
}

function RowActions({
  request,
  activePlan,
}: {
  request: QuoteRequest;
  activePlan: PlanName | undefined;
}) {
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== "idle";
  const canConvert = planAtLeast(activePlan, "Growth");

  if (request.status === "rejected" || request.status === "converted") {
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
        {canConvert ? "Convert to order" : "Convert (Growth+)"}
      </s-button>
      {fetcher.data?.error && <s-text tone="critical">{fetcher.data.error}</s-text>}
      {fetcher.data?.draftOrder && (
        <s-text tone="success">Draft order {fetcher.data.draftOrder.name} created</s-text>
      )}
    </s-stack>
  );
}

export default function QuoteRequests() {
  const { quoteRequests, activePlan } = useLoaderData<typeof loader>();
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const filtered = statusFilter
    ? quoteRequests.filter((r) => r.status === statusFilter)
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
            {filtered.map((request) => (
              <s-table-row key={request.id}>
                <s-table-cell>{request.companyName}</s-table-cell>
                <s-table-cell>{request.email || "—"}</s-table-cell>
                <s-table-cell>{request.productId}</s-table-cell>
                <s-table-cell>{request.quantity}</s-table-cell>
                <s-table-cell>{request.notes || "—"}</s-table-cell>
                <s-table-cell>{new Date(request.createdAt).toLocaleDateString()}</s-table-cell>
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
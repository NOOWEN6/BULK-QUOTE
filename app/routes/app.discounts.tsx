import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { requireActiveSubscription } from "../billing.server";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await requireActiveSubscription(request);
  const rules = await db.discountRule.findMany({
    where: { shop: session.shop },
    orderBy: { minQty: "asc" },
  });
  return { rules };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await requireActiveSubscription(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "create") {
    const minQty = Number(formData.get("minQty"));
    const maxQty = formData.get("maxQty")
      ? Number(formData.get("maxQty"))
      : null;
    const discountPct = Number(formData.get("discountPct"));

    await db.discountRule.create({
      data: { shop: session.shop, minQty, maxQty, discountPct },
    });
  }

  if (intent === "delete") {
    const id = formData.get("id") as string;
    await db.discountRule.delete({ where: { id } });
  }

  return { ok: true };
};

export default function DiscountsPage() {
  const { rules } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();

  const [minQty, setMinQty] = useState("");
  const [maxQty, setMaxQty] = useState("");
  const [discountPct, setDiscountPct] = useState("");

  const handleAdd = () => {
    fetcher.submit(
      { intent: "create", minQty, maxQty, discountPct },
      { method: "post" }
    );
    setMinQty("");
    setMaxQty("");
    setDiscountPct("");
  };

  const handleDelete = (id: string) => {
    fetcher.submit({ intent: "delete", id }, { method: "post" });
  };

  return (
    <s-page heading="Wholesale Discount Tiers">
      <s-section heading="Add a new tier">
        <s-stack direction="inline" gap="base">
          <s-text-field
            label="Min quantity"
            value={minQty}
            onInput={(e: any) => setMinQty(e.target.value)}
          ></s-text-field>
          <s-text-field
            label="Max quantity (blank = no limit)"
            value={maxQty}
            onInput={(e: any) => setMaxQty(e.target.value)}
          ></s-text-field>
          <s-text-field
            label="Discount %"
            value={discountPct}
            onInput={(e: any) => setDiscountPct(e.target.value)}
          ></s-text-field>
        </s-stack>
        <s-button onClick={handleAdd} variant="primary">
          Add tier
        </s-button>
      </s-section>

      <s-section heading="Current tiers">
        <s-table>
          <s-table-header-row>
            <s-table-header>Min Qty</s-table-header>
            <s-table-header>Max Qty</s-table-header>
            <s-table-header>Discount</s-table-header>
            <s-table-header></s-table-header>
          </s-table-header-row>
          <s-table-body>
            {rules.map((r: any) => (
              <s-table-row key={r.id}>
                <s-table-cell>{r.minQty}</s-table-cell>
                <s-table-cell>{r.maxQty ?? "∞"}</s-table-cell>
                <s-table-cell>{r.discountPct}%</s-table-cell>
                <s-table-cell>
                  <s-button
                    onClick={() => handleDelete(r.id)}
                    variant="tertiary"
                    tone="critical"
                  >
                    Delete
                  </s-button>
                </s-table-cell>
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>
      </s-section>
    </s-page>
  );
}
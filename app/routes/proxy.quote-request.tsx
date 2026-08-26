import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export async function action({ request }: ActionFunctionArgs) {
  // Verifies the request signature came from Shopify's proxy, and gives us `session`/`liquid` helpers
  const { session, liquid } = await authenticate.public.appProxy(request);

  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const shop = session.shop;

  // Parse incoming form data from the widget
  const formData = await request.formData();
  const productId = formData.get("productId")?.toString();
  const variantId = formData.get("variantId")?.toString() || null;
  const quantity = Number(formData.get("quantity"));
  const companyName = formData.get("companyName")?.toString();
  const email = formData.get("email")?.toString() || null;
  const notes = formData.get("notes")?.toString() || null;

  // Basic validation
  if (!productId || !quantity || quantity < 1 || !companyName) {
    return new Response(
      JSON.stringify({ error: "Missing required fields" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Check quantity against this shop's discount tiers (MOQ validation)
  const matchingTier = await db.discountRule.findFirst({
    where: {
      shop,
      minQty: { lte: quantity },
      OR: [{ maxQty: null }, { maxQty: { gte: quantity } }],
    },
    orderBy: { minQty: "desc" },
  });

  // Save the quote request either way — even if no tier matches,
  // the merchant may still want to see and respond to the request
  const quoteRequest = await db.quoteRequest.create({
    data: {
      shop,
      productId,
      variantId,
      quantity,
      companyName,
      email,
      notes,
      status: "new",
    },
  });

  return new Response(
    JSON.stringify({
      success: true,
      quoteRequestId: quoteRequest.id,
      matchedDiscount: matchingTier
        ? { discountPct: matchingTier.discountPct }
        : null,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
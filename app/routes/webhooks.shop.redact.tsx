import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Shop uninstalled 48h ago and requested full data erasure — wipe everything
  await db.quoteRequest.deleteMany({ where: { shop } });
  await db.discountRule.deleteMany({ where: { shop } });

  return new Response();
};
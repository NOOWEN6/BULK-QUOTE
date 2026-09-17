import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);
  // payload contains the customer's id/email and the shop's domain.
  // Shopify doesn't require you to email data back automatically —
  // just acknowledge receipt. If you store customer data (you do,
  // via QuoteRequest), keep a record that this request came in so
  // you can respond to the merchant/customer manually if asked.

  return new Response();
};
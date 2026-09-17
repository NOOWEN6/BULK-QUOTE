import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  const customerEmail = payload?.customer?.email as string | undefined;

  if (customerEmail) {
    // Redact this customer's data from any quote requests on this shop
    await db.quoteRequest.updateMany({
      where: { shop, email: customerEmail },
      data: { email: null, notes: null, companyName: "[redacted]" },
    });
  }

  return new Response();
};
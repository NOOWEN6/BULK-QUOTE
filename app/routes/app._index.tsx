import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function Index() {
  return (
    <s-page heading="BulkQuote">
      <s-section heading="Wholesale quotes, without the inbox chase">
        <s-paragraph>
          Customers request a bulk price from your storefront. You approve,
          reject, or turn the request into a checkout link — with your volume
          discounts applied.
        </s-paragraph>
        <s-paragraph>
          <s-text type="strong">Free trial on every plan.</s-text> Start in
          test mode on this store, then pick a plan when you&apos;re ready.
        </s-paragraph>
        <s-stack direction="inline" gap="base">
          <s-button variant="primary" href="/app/quote-requests">
            Quote requests
          </s-button>
          <s-button variant="secondary" href="/app/discounts">
            Discount rules
          </s-button>
          <s-button variant="tertiary" href="/app/pricing">
            Plans &amp; trial
          </s-button>
        </s-stack>
      </s-section>

      <s-section heading="How it works">
        <s-unordered-list>
          <s-list-item>
            A customer submits a quote from the product page widget.
          </s-list-item>
          <s-list-item>
            It shows up under Quote requests for this shop.
          </s-list-item>
          <s-list-item>
            Approve it, or generate a one-time checkout link (Growth plan and
            up).
          </s-list-item>
        </s-unordered-list>
      </s-section>

      <s-section slot="aside" heading="This store">
        <s-paragraph>
          You&apos;re running BulkQuote in development. Use Quote requests to
          process incoming wholesale asks, Discounts to set quantity breaks,
          and Pricing to start or change the trial.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
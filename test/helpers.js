import { readFileSync } from "node:fs";

export const rules = JSON.parse(readFileSync(new URL("../extension/rules/signals.json", import.meta.url), "utf8"));

// A clean Swedish store; tests override only the fields they are about.
export function store(overrides = {}) {
  return {
    host: "example.se",
    isStore: true,
    platform: "shopify",
    apps: [],
    theme: { name: "Dawn", dsTheme: null },
    tld: { tld: "se", cheap: false },
    market: { id: "se", name: "Swedish", reason: ".se domain" },
    urgency: { countdown: false, stock: false, viewers: false },
    discount: { source: "catalog", sampled: 20, offs: Array(20).fill(0) },
    shipping: { quotes: [{ min: 1, max: 3 }], fastestMax: 3 },
    identity: { hasCompanyId: true, orgNumbers: ["559999-9991"], hasAddress: true,
                emails: ["hej@example.se"], boilerplate: [] },
    paymentMethods: ["visa", "klarna", "swish"],
    supplierImageIds: 0,
    domain: { name: "example.se", createdAt: "2015-01-01T00:00:00Z", ageDays: 4000 },
    ...overrides
  };
}

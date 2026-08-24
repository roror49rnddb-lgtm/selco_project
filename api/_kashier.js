const crypto = require("crypto");

const CHECKOUT_BASE_URL = "https://checkout.kashier.io";

function config() {
  const mid = process.env.KASHIER_MID;
  const secret = process.env.KASHIER_API_KEY;
  const mode = process.env.KASHIER_MODE || "test";
  if (!mid || !secret) throw new Error("Missing KASHIER_MID / KASHIER_API_KEY");
  return { mid, secret, mode, baseUrl: CHECKOUT_BASE_URL };
}

function orderHash({ mid, orderId, amount, currency, secret }) {
  const path = `/?payment=${mid}.${orderId}.${amount}.${currency}`;
  return crypto.createHmac("sha256", secret).update(path).digest("hex");
}

function validateSignature(payload, secret) {
  if (!payload || !payload.signature) return false;
  const queryString =
    "paymentStatus=" + payload.paymentStatus +
    "&cardDataToken=" + payload.cardDataToken +
    "&maskedCard=" + payload.maskedCard +
    "&merchantOrderId=" + payload.merchantOrderId +
    "&orderId=" + payload.orderId +
    "&cardBrand=" + payload.cardBrand +
    "&orderReference=" + payload.orderReference +
    "&transactionId=" + payload.transactionId +
    "&amount=" + payload.amount +
    "&currency=" + payload.currency;
  const expected = crypto.createHmac("sha256", secret).update(queryString).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(String(payload.signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function hostedPaymentUrl(order) {
  const params = new URLSearchParams({
    merchantId: order.mid,
    orderId: order.orderId,
    amount: order.amount,
    currency: order.currency,
    hash: order.hash,
    mode: order.mode,
    merchantRedirect: order.merchantRedirect,
    display: order.display || "ar",
    failureRedirect: "true",
    redirectMethod: "get",
    allowedMethods: order.allowedMethods || "card,wallet",
    brandColor: "rgba(0, 0, 0, 1)"
  });
  if (order.metaData) params.set("metaData", order.metaData);
  return `${order.baseUrl}?${params.toString()}`;
}

function supabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json"
  };
  return {
    async select(table, query) {
      const res = await fetch(`${url}/rest/v1/${table}?${query}`, { headers });
      if (!res.ok) throw new Error(`${table} select failed: ${await res.text()}`);
      return res.json();
    },
    async insert(table, row) {
      const res = await fetch(`${url}/rest/v1/${table}`, {
        method: "POST",
        headers: { ...headers, Prefer: "return=representation" },
        body: JSON.stringify([row])
      });
      if (!res.ok) throw new Error(`${table} insert failed: ${await res.text()}`);
      return (await res.json())[0];
    },
    async update(table, query, patch) {
      const res = await fetch(`${url}/rest/v1/${table}?${query}`, {
        method: "PATCH",
        headers: { ...headers, Prefer: "return=representation" },
        body: JSON.stringify(patch)
      });
      if (!res.ok) throw new Error(`${table} update failed: ${await res.text()}`);
      return (await res.json())[0];
    }
  };
}

function paymentStatusToOrderStatus(paymentStatus) {
  const value = String(paymentStatus || "").toUpperCase();
  if (value === "SUCCESS" || value === "PAID" || value === "CAPTURED") return "paid";
  if (value === "PENDING") return "pending";
  return "failed";
}

module.exports = {
  config,
  orderHash,
  validateSignature,
  hostedPaymentUrl,
  supabase,
  paymentStatusToOrderStatus
};

const { config, validateSignature, supabase, paymentStatusToOrderStatus } = require("./_kashier");

function readBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        resolve(Object.fromEntries(new URLSearchParams(raw)));
      }
    });
    req.on("error", reject);
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const body = await readBody(req);
    const payload = body.data && typeof body.data === "object" ? body.data : body;
    const { secret } = config();

    if (!validateSignature(payload, secret)) {
      res.status(401).json({ error: "Invalid signature" });
      return;
    }

    const merchantOrderId = payload.merchantOrderId;
    if (!merchantOrderId) {
      res.status(400).json({ error: "Missing merchantOrderId" });
      return;
    }

    await supabase().update(
      "orders",
      `merchant_order_id=eq.${encodeURIComponent(merchantOrderId)}`,
      {
        status: paymentStatusToOrderStatus(payload.paymentStatus || payload.status),
        kashier_order_id: payload.orderId || null,
        kashier_transaction_id: payload.transactionId || null,
        card_brand: payload.cardBrand || null,
        masked_card: payload.maskedCard || null,
        gateway_response: payload,
        updated_at: new Date().toISOString()
      }
    );

    res.status(200).json({ received: true });
  } catch (err) {
    console.error("kashier-webhook failed:", err);
    res.status(500).json({ error: "Webhook processing failed" });
  }
};

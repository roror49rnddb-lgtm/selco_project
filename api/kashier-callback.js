const { config, validateSignature, supabase, paymentStatusToOrderStatus } = require("./_kashier");

module.exports = async function handler(req, res) {
  // Parse query params via URLSearchParams so the original parameter order
  // is preserved — the Kashier signature is computed over params in URL order.
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const searchParams = url.searchParams;
  const merchantOrderId = searchParams.get("merchantOrderId") || "";

  try {
    const { secret } = config();
    if (!validateSignature(searchParams, secret)) {
      res.writeHead(302, { Location: `/?payment=invalid&order=${encodeURIComponent(merchantOrderId)}` });
      res.end();
      return;
    }

    const status = paymentStatusToOrderStatus(searchParams.get("paymentStatus"));
    await supabase().update(
      "orders",
      `merchant_order_id=eq.${encodeURIComponent(merchantOrderId)}`,
      {
        status,
        kashier_order_id: searchParams.get("orderId") || null,
        kashier_transaction_id: searchParams.get("transactionId") || null,
        card_brand: searchParams.get("cardBrand") || null,
        masked_card: searchParams.get("maskedCard") || null,
        gateway_response: Object.fromEntries(searchParams.entries()),
        updated_at: new Date().toISOString()
      }
    );

    res.writeHead(302, {
      Location: `/?payment=${status}&order=${encodeURIComponent(merchantOrderId)}`
    });
    res.end();
  } catch (err) {
    console.error("kashier-callback failed:", err);
    res.writeHead(302, { Location: `/?payment=error&order=${encodeURIComponent(merchantOrderId)}` });
    res.end();
  }
};

const { config, validateSignature, supabase, paymentStatusToOrderStatus } = require("./_kashier");

module.exports = async function handler(req, res) {
  const query = req.query || Object.fromEntries(new URL(req.url, "http://localhost").searchParams);
  const merchantOrderId = query.merchantOrderId || "";

  try {
    const { secret } = config();
    if (!validateSignature(query, secret)) {
      res.writeHead(302, { Location: `/?payment=invalid&order=${encodeURIComponent(merchantOrderId)}` });
      res.end();
      return;
    }

    const status = paymentStatusToOrderStatus(query.paymentStatus);
    await supabase().update(
      "orders",
      `merchant_order_id=eq.${encodeURIComponent(merchantOrderId)}`,
      {
        status,
        kashier_order_id: query.orderId || null,
        kashier_transaction_id: query.transactionId || null,
        card_brand: query.cardBrand || null,
        masked_card: query.maskedCard || null,
        gateway_response: query,
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

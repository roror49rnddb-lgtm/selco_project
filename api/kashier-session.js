const { config, orderHash, hostedPaymentUrl, supabase } = require("./_kashier");

function readBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch (err) { reject(err); }
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
    const items = Array.isArray(body.items) ? body.items : [];
    const customer = body.customer || {};

    if (!items.length) {
      res.status(400).json({ error: "السلة فارغة" });
      return;
    }
    if (!customer.name || !customer.phone || !customer.address) {
      res.status(400).json({ error: "بيانات الشحن غير مكتملة" });
      return;
    }

    const db = supabase();
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const ids = [...new Set(items.map((item) => String(item.id)))].filter((id) => uuid.test(id));
    if (!ids.length) {
      res.status(400).json({ error: "أحد المنتجات لم يعد متاحًا" });
      return;
    }
    const rows = await db.select(
      "products",
      `select=id,title,price,stock&id=in.(${ids.map(encodeURIComponent).join(",")})`
    );
    const byId = new Map(rows.map((row) => [String(row.id), row]));

    // Prices always come from the database, never from the client.
    const orderItems = [];
    let total = 0;
    for (const item of items) {
      const product = byId.get(String(item.id));
      if (!product) {
        res.status(400).json({ error: "أحد المنتجات لم يعد متاحًا" });
        return;
      }
      const qty = Math.max(1, parseInt(item.qty, 10) || 1);
      const price = Number(product.price) || 0;
      total += price * qty;
      orderItems.push({
        id: String(product.id),
        title: product.title,
        price,
        qty,
        size: item.size || null,
        color: item.color || null
      });
    }
    if (total <= 0) {
      res.status(400).json({ error: "إجمالي الطلب غير صالح" });
      return;
    }

    const kashier = config();
    const merchantOrderId = `SELCO-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const amount = total.toFixed(2);
    const currency = "EGP";

    await db.insert("orders", {
      merchant_order_id: merchantOrderId,
      customer_name: customer.name,
      customer_phone: customer.phone,
      governorate: customer.gov || null,
      city: customer.city || null,
      address: customer.address,
      items: orderItems,
      amount,
      currency,
      payment_method: "kashier",
      status: "pending"
    });

    const proto = (req.headers["x-forwarded-proto"] || "https").split(",")[0];
    const origin = `${proto}://${req.headers.host}`;

    const url = hostedPaymentUrl({
      ...kashier,
      orderId: merchantOrderId,
      amount,
      currency,
      hash: orderHash({
        mid: kashier.mid,
        orderId: merchantOrderId,
        amount,
        currency,
        secret: kashier.secret
      }),
      merchantRedirect: `${origin}/api/kashier-callback`,
      metaData: JSON.stringify({
        "Customer Name": customer.name,
        "Customer Phone": customer.phone
      })
    });

    res.status(200).json({ paymentUrl: url, merchantOrderId, amount, currency });
  } catch (err) {
    console.error("kashier-session failed:", err);
    res.status(500).json({ error: "تعذر بدء عملية الدفع، برجاء المحاولة مرة أخرى" });
  }
};

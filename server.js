async function placeOrder() {
  const name = document.getElementById("name").value.trim();
  const phone = document.getElementById("phone").value.trim();
  const gov = document.getElementById("gov").value.trim();
  const city = document.getElementById("city").value.trim();
  const address = document.getElementById("address").value.trim();

  if (!name || !phone || !gov || !city || !address) {
    alert("برجاء إكمال جميع بيانات الشحن.");
    return;
  }

  const orderData = {
    name,
    phone,
    gov,
    city,
    address,
    items: cart.map(x => {
      let p = products.find(p => p.id === x.id);
      return { name: p.name, qty: x.qty, price: p.price, size: x.size };
    }),
    total: cart.reduce((s, x) => s + products.find(p => p.id === x.id).price * x.qty, 0)
  };

  try {
    const response = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderData)
    });

    const result = await response.json();

    if (result.success) {
      alert("تم إرسال طلبك بنجاح! رقم الطلب #" + result.orderId);
      cart = [];
      saveCart();
      closeCheckout();
      
      // حفظ الأوردر في جهاز العميل أيضاً لرؤيته في "طلباتي"
      const orders = JSON.parse(localStorage.getItem("selco_user_orders") || "[]");
      orders.unshift({
        id: result.orderId,
        date: new Date().toLocaleDateString("ar-EG"),
        items: orderData.items.map(i => `${i.name} (${i.qty})`).join(", "),
        total: orderData.total,
        payment: "الدفع عند الاستلام",
        status: "جاري التحضير"
      });
      localStorage.setItem("selco_user_orders", JSON.stringify(orders));
      renderUserOrders();
    } else {
      alert("حدث خطأ أثناء إرسال الطلب، حاول مرة أخرى.");
    }
  } catch (error) {
    alert("تعذر الاتصال بالسيرفر. التأكد من تشغيل السيرفر أولاً.");
  }
}
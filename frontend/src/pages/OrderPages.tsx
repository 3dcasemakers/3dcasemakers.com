import { useEffect, useState } from "react";
import { useParams, Link } from "react-router";
import { api, API_URL } from "../utils/api";
import { toWhatsAppNumber } from "../utils/whatsapp";
import { CheckCircle2, MessageCircle, Loader2, Clock, AlertCircle } from "lucide-react";
import { trackContact } from "../utils/metaPixel";
import type { Order } from "../types";

const DEFAULT_WHATSAPP_NUMBER = "916369418105"; // +91 63694 18105

type Receipt = Order & { hasCustomizedItem?: boolean };
const accessKey = (id: string) => `3dcasemakers_order_access:${id}`;
function readOrderAccess(id: string) {
  try { return sessionStorage.getItem(accessKey(id)) || ""; } catch { return ""; }
}
async function fetchReceipt(id: string, token: string): Promise<Receipt> {
  const response = await fetch(`${API_URL}/api/orders/${encodeURIComponent(id)}`, {
    headers: token ? { "X-Order-Access": token } : {},
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Order details could not be loaded.");
  return result;
}
function statusLabel(status: string) {
  return String(status || "pending").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function scrollToTopNow() {
  try {
    const root = document.documentElement;
    const prev = root.style.scrollBehavior;
    root.style.scrollBehavior = "auto";
    window.scrollTo(0, 0);
    document.body.scrollTop = 0;
    root.scrollTop = 0;
    root.style.scrollBehavior = prev;
  } catch {
    window.scrollTo(0, 0);
  }
}

export function OrderConfirmedPage() {
  const { id } = useParams();
  const [order, setOrder] = useState<Receipt | null>(null);
  const [whatsappNumber, setWhatsappNumber] = useState(DEFAULT_WHATSAPP_NUMBER);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);
  const [accessToken, setAccessToken] = useState("");
  const [previewRequested, setPreviewRequested] = useState(false);
  const [previewSaving, setPreviewSaving] = useState(false);
  const [previewError, setPreviewError] = useState("");

  // Scroll to top on page mount
  useEffect(() => {
    scrollToTopNow();
    const t = setTimeout(scrollToTopNow, 60);
    return () => clearTimeout(t);
  }, []);

  // When order loads, ensure the page remains scrolled at top
  useEffect(() => {
    if (order) {
      scrollToTopNow();
      const t1 = setTimeout(scrollToTopNow, 50);
      const t2 = setTimeout(scrollToTopNow, 150);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [order]);

  useEffect(() => {
    let alive = true;
    setOrder(null);
    setLoadError("");
    setLoading(true);
    setPreviewRequested(false);
    setPreviewError("");
    setPreviewSaving(false);
    if (!id) { setLoadError("Order ID is missing."); setLoading(false); return; }
    const token = readOrderAccess(id);
    setAccessToken(token);
    fetchReceipt(id, token)
      .then((receipt) => { if (alive) setOrder(receipt); })
      .catch((err) => { if (alive) setLoadError(err.message || "Order details could not be loaded."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [id, retry]);

  useEffect(() => {
    api
      .get("/api/settings")
      .then((s: any) => {
        const raw = toWhatsAppNumber(s?.whatsappNumber);
        if (raw) setWhatsappNumber(raw);
      })
      .catch(() => {});
  }, []);

  // Before the order goes to print, the customer can request a preview image
  // via WhatsApp — the message auto-fills Order ID, name & order total so
  // support can pull up the order and send the preview instantly.
  const requestPrintedPhotoHref = order
    ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(
        `Image Request for this order\n\n` +
          `Order ID: ${order.id}\n` +
          (order.customerName ? `Customer Name: ${order.customerName}\n` : "") +
          `Order Total: ₹${order.total}`
      )}`
    : "";

  const handleRequestPreview = async (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!id || !accessToken || previewSaving) { event.preventDefault(); return; }
    setPreviewSaving(true);
    setPreviewError("");
    trackContact({ source: "preview_request" });
    try {
      const response = await fetch(`${API_URL}/api/orders/${encodeURIComponent(id)}/request-preview`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-Order-Access": accessToken },
        body: "{}",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Preview request could not be saved.");
      setPreviewRequested(true);
    } catch (err: any) {
      setPreviewError(`${err.message || "Preview request could not be saved."} You can still send the WhatsApp message.`);
    } finally {
      setPreviewSaving(false);
    }
  };

  // Only products that actually need a name/photo from the customer
  // (isCustomizable / requiresCustomerName) — or a cart item that already has
  // a customName/customImage filled in — get a preview-image request option.
  // Plain, non-customized products don't need a preview before printing.
  const hasCustomizedItem = order?.hasCustomizedItem ?? !!order?.items?.some(
    (it: any) =>
      it?.product?.isCustomizable ||
      it?.product?.requiresCustomerName ||
      it?.customName ||
      it?.customImage
  );

  return (
    <div className="max-w-xl mx-auto px-6 sm:px-10 lg:px-20 py-24 text-center">
      {loading ? <div role="status" className="space-y-3"><Loader2 className="mx-auto animate-spin" size={32} /><p className="text-zinc-500">Loading your order…</p></div> : loadError ? (
        <div role="alert" className="space-y-4"><h1 className="text-xl font-bold">Order details unavailable</h1><p className="text-red-600">{loadError}</p><button type="button" onClick={() => setRetry((v) => v + 1)} className="glass-btn-grey rounded-full px-5 py-2.5 font-semibold">Try again</button></div>
      ) : order && <>
      <CheckCircle2 className="mx-auto text-zinc-900 mb-4" size={56} />
      <h1 className="text-2xl font-bold text-zinc-900 mb-2">{order.status === "cancelled" ? "Order Cancelled" : order.status === "returned" ? "Order Returned" : "Order Placed!"}</h1>
      <p className="text-zinc-500 mb-4">
        Your order <span className="text-zinc-900 font-mono break-all">{order.id}</span> is {statusLabel(order.status).toLowerCase()}.
      </p>

      {/* Manual UPI Payment Status Banners */}
      {order.paymentStatus === "awaiting_payment" && (
        <div className="mb-6 p-4 sm:p-5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-left space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
            <h2 className="font-bold text-sm sm:text-base">Awaiting Payment</h2>
          </div>
          <p className="text-xs sm:text-sm text-amber-800">
            Your order has been created. Please complete your payment to start order processing.
          </p>
          <div>
            <Link
              to={`/payment/upi/${encodeURIComponent(order.id)}`}
              className="inline-flex items-center gap-2 glass-btn-gold text-white font-bold px-5 py-2.5 rounded-xl text-xs uppercase tracking-wide shadow-sm"
            >
              Complete Payment Now →
            </Link>
          </div>
        </div>
      )}

      {order.paymentStatus === "pending_verification" && (
        <div className="mb-6 p-4 sm:p-5 rounded-2xl bg-amber-50/70 border border-amber-200 text-amber-900 text-left space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-sm sm:text-base flex items-center gap-2">
              <Clock size={16} className="text-amber-700" /> Payment Pending Verification
            </h2>
            <span className="text-[10px] bg-amber-200/80 text-amber-900 font-bold px-2 py-0.5 rounded-full">
              In Review
            </span>
          </div>
          <p className="text-xs sm:text-sm text-amber-800">
            We received your payment details and are verifying your transaction. Your order will be confirmed shortly.
          </p>
          <div className="pt-1">
            <Link
              to={`/payment/upi/${encodeURIComponent(order.id)}`}
              className="text-xs font-semibold underline text-amber-900 hover:text-amber-700"
            >
              View Payment Submission →
            </Link>
          </div>
        </div>
      )}

      {order.paymentStatus === "failed" && (
        <div className="mb-6 p-4 sm:p-5 rounded-2xl bg-red-50 border border-red-200 text-red-900 text-left space-y-3">
          <div className="flex items-center gap-2">
            <AlertCircle size={18} className="text-red-600" />
            <h2 className="font-bold text-sm sm:text-base">Payment Verification Failed</h2>
          </div>
          <p className="text-xs sm:text-sm text-red-800">
            {order.rejectionReason
              ? `Reason: ${order.rejectionReason}`
              : "We could not verify your payment with the provided transaction details."}
          </p>
          <p className="text-xs text-red-700">
            You do not need to create a new order. You can resubmit your correct UPI Transaction ID / UTR number below.
          </p>
          <div>
            <Link
              to={`/payment/upi/${encodeURIComponent(order.id)}`}
              className="inline-flex items-center gap-2 glass-btn-gold text-white font-bold px-5 py-2.5 rounded-xl text-xs uppercase tracking-wide shadow-sm"
            >
              Resubmit Payment Details →
            </Link>
          </div>
        </div>
      )}

      {order.paymentStatus === "paid" && (
        <div className="mb-6 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center justify-center gap-2">
          <CheckCircle2 size={16} className="text-emerald-600" />
          <span>Payment Verified ✓</span>
        </div>
      )}

      {hasCustomizedItem && accessToken && order.customerName && !["cancelled", "returned", "delivered"].includes(order.status) && (
        <div className="mb-6">
          <p className="text-sm text-zinc-500 mb-3 max-w-sm mx-auto">
            If you want a preview image, click the below request button to get an image preview before printing.
          </p>
          <a
            href={requestPrintedPhotoHref}
            target="_blank"
            rel="noreferrer"
            onClick={handleRequestPreview}
            className="inline-flex items-center gap-2 text-sm font-semibold text-[#25D366] border border-[#25D366]/40 bg-[#25D366]/5 hover:bg-[#25D366]/10 transition-colors px-4 py-2 rounded-full"
          >
            <MessageCircle size={16} />
            {previewSaving ? "Saving request…" : "Request Preview Image"}
          </a>
          {(previewRequested || order.previewRequested) && (
            <p className="text-xs text-zinc-500 mt-2">Preview request recorded. Send the WhatsApp message to contact our team.</p>
          )}
          {previewError && <p role="alert" className="text-xs text-red-600 mt-2">{previewError}</p>}
        </div>
      )}
      {!order.customerName && <p className="text-sm text-zinc-500 mb-6">For your full order details, verify your order ID and phone number on the tracking page.</p>}
      </>}

      <div className="flex flex-wrap gap-4 justify-center mt-6">
        <Link to="/" className="text-zinc-900 font-semibold">Continue Shopping</Link>
        <Link to="/track-order" className="text-zinc-900 font-semibold">Track Order →</Link>
      </div>
    </div>
  );
}

export function TrackOrderPage() {
  const [orderId, setOrderId] = useState("");
  const [phone, setPhone] = useState("");
  const [order, setOrder] = useState<Receipt | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const trackOrder = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    setOrder(null);
    try {
      const result = await api.post("/api/orders/track", { orderId: orderId.trim(), customerPhone: phone.trim() });
      const receipt = await fetchReceipt(result.id, result.accessToken);
      try { sessionStorage.setItem(accessKey(result.id), result.accessToken); } catch { /* Receipt remains available in this page. */ }
      setOrder(receipt);
    } catch (err: any) {
      setError(err.message || "Order could not be found. Check your order ID and phone number.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-6 sm:px-10 lg:px-20 py-16 sm:py-24">
      <h1 className="text-2xl font-bold text-zinc-900 mb-6 text-center">Track Your Order</h1>

      <form onSubmit={trackOrder} className="glass-card rounded-2xl p-6 sm:p-8 mb-6 space-y-4">
        <p className="text-sm text-zinc-600">Enter your order ID and the phone number used at checkout to see your order status.</p>
        <div><label htmlFor="track-order-id" className="block text-sm font-semibold mb-1">Order ID</label><input id="track-order-id" value={orderId} onChange={(event) => setOrderId(event.target.value)} required maxLength={50} placeholder="e.g. STC0001" className="w-full rounded-xl border border-zinc-200 px-3 py-3 text-sm" /></div>
        <div><label htmlFor="track-order-phone" className="block text-sm font-semibold mb-1">Phone number</label><input id="track-order-phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} required minLength={10} maxLength={18} placeholder="Phone number used for this order" className="w-full rounded-xl border border-zinc-200 px-3 py-3 text-sm" /></div>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={loading} className="glass-btn-grey w-full rounded-full py-3 font-semibold disabled:opacity-50">{loading ? "Checking order…" : "Track order"}</button>
      </form>

      {order && <div role="status" className="glass-card rounded-2xl p-6 mb-6 space-y-3">
        <p className="font-bold break-all">Order {order.id}</p>
        <p className="text-sm">Status: <span className="font-semibold">{statusLabel(order.status)}</span></p>
        <div className="text-sm flex flex-wrap items-center gap-2">
          <span>Payment:</span>
          {order.paymentStatus === "awaiting_payment" ? (
            <span className="inline-flex items-center gap-1.5 font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full text-xs">
              Awaiting Payment
            </span>
          ) : order.paymentStatus === "pending_verification" ? (
            <span className="inline-flex items-center gap-1.5 font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full text-xs">
              Pending Verification
            </span>
          ) : order.paymentStatus === "paid" ? (
            <span className="inline-flex items-center gap-1.5 font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full text-xs">
              Payment Verified ✓
            </span>
          ) : order.paymentStatus === "failed" ? (
            <span className="inline-flex items-center gap-1.5 font-bold text-red-800 bg-red-100 px-2 py-0.5 rounded-full text-xs">
              Verification Failed
            </span>
          ) : (
            <span className="font-semibold">{statusLabel(order.paymentStatus || "pending")}</span>
          )}
        </div>
        {(order.paymentStatus === "awaiting_payment" || order.paymentStatus === "failed") && (
          <div className="pt-1">
            <Link
              to={`/payment/upi/${encodeURIComponent(order.id)}`}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-white glass-btn-gold px-3.5 py-1.5 rounded-lg shadow-sm"
            >
              {order.paymentStatus === "failed" ? "Resubmit Payment Details →" : "Complete Payment →"}
            </Link>
          </div>
        )}
        {order.trackingId && <p className="text-sm break-all">Tracking ID: <span className="font-mono font-semibold">{order.trackingId}</span></p>}
        <div className="pt-1">
          <Link to={`/order-confirmed/${encodeURIComponent(order.id)}`} className="inline-block text-sm font-semibold underline">View order details</Link>
        </div>
      </div>}

      <div className="glass-card rounded-2xl p-6 sm:p-8 text-center">
        <MessageCircle className="mx-auto text-[#25D366] mb-4" size={40} />
        <p className="text-zinc-900 font-semibold text-lg leading-relaxed mb-3">
          Once you place your order, we process it and create your shipment.
        </p>
        <p className="text-zinc-600 leading-relaxed mb-3">
          After that, you'll receive your tracking ID along with the tracking link directly on our{" "}
          <span className="font-semibold text-zinc-900">official WhatsApp number</span>.
        </p>
        <p className="text-zinc-600 leading-relaxed">
          If you haven't received it yet, please wait a little — our team is preparing your order
          and will send the tracking details as soon as it's shipped.
        </p>
      </div>

      <div className="mt-8">
        <p className="text-center text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-4">
          Our Official Shipping Partners
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          <a
            href="https://stcourier.com/track/shipment"
            target="_blank"
            rel="noreferrer"
            className="glass-card rounded-2xl p-5 hover:scale-[1.02] transition-transform"
          >
            <p className="text-zinc-900 font-bold mb-1">ST Courier</p>
            <p className="text-zinc-500 text-sm mb-3">Delivery in 3–5 business days</p>
            <span className="text-sm font-semibold text-zinc-900 underline underline-offset-2">
              Track on stcourier.com →
            </span>
          </a>
          <a
            href="https://www.indiapost.gov.in/"
            target="_blank"
            rel="noreferrer"
            className="glass-card rounded-2xl p-5 hover:scale-[1.02] transition-transform"
          >
            <p className="text-zinc-900 font-bold mb-1">India Post</p>
            <p className="text-zinc-500 text-sm mb-3">Delivery in 7 business days</p>
            <span className="text-sm font-semibold text-zinc-900 underline underline-offset-2">
              Track on indiapost.gov.in →
            </span>
          </a>
        </div>
      </div>
    </div>
  );
}

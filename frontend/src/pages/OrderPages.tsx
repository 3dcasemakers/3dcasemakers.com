import { useEffect, useState } from "react";
import { useParams, Link } from "react-router";
import { api } from "../utils/api";
import { Order } from "../types";
import { CheckCircle2, MessageCircle } from "lucide-react";
import { trackContact } from "../utils/metaPixel";

const DEFAULT_WHATSAPP_NUMBER = "916369418105"; // +91 63694 18105

export function OrderConfirmedPage() {
  const { id } = useParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [whatsappNumber, setWhatsappNumber] = useState(DEFAULT_WHATSAPP_NUMBER);

  useEffect(() => {
    if (!id) return;
    api
      .get(`/api/orders/${id}`)
      .then((o: Order) => setOrder(o))
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    api
      .get("/api/settings")
      .then((s: any) => {
        const raw = (s?.whatsappNumber || "").replace(/[^\d]/g, "");
        if (raw) setWhatsappNumber(raw);
      })
      .catch(() => {});
  }, []);

  // Before the order goes to print, the customer can request a preview image
  // via WhatsApp — the message auto-fills Order ID, name & paid amount so
  // support can pull up the order and send the preview instantly.
  const requestPrintedPhotoHref = order
    ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(
        `Image Request for this order\n\n` +
          `Order ID: ${order.id}\n` +
          `Customer Name: ${order.customerName}\n` +
          `Paid Amount: ₹${order.total}`
      )}`
    : "";

  const [previewRequested, setPreviewRequested] = useState(false);

  const handleRequestPreview = () => {
    if (!id) return;
    setPreviewRequested(true);
    trackContact({ source: "preview_request" });
    // fire-and-forget — don't block the WhatsApp redirect on this
    api.put(`/api/orders/${id}/request-preview`, {}).catch(() => {});
  };

  // Only products that actually need a name/photo from the customer
  // (isCustomizable / requiresCustomerName) — or a cart item that already has
  // a customName/customImage filled in — get a preview-image request option.
  // Plain, non-customized products don't need a preview before printing.
  const hasCustomizedItem = !!order?.items?.some(
    (it: any) =>
      it?.product?.isCustomizable ||
      it?.product?.requiresCustomerName ||
      it?.customName ||
      it?.customImage
  );

  return (
    <div className="max-w-xl mx-auto px-6 sm:px-10 lg:px-20 py-24 text-center">
      <CheckCircle2 className="mx-auto text-zinc-900 mb-4" size={56} />
      <h1 className="text-2xl font-bold text-zinc-900 mb-2">Order Placed!</h1>
      <p className="text-zinc-500 mb-6">
        Your order <span className="text-zinc-900 font-mono">{id}</span> has been placed and payment has been received.
      </p>

      {order && hasCustomizedItem && (
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
            Click Here to Request Preview Image
          </a>
          {(previewRequested || order.previewRequested) && (
            <p className="text-xs text-zinc-400 mt-2">Request sent — we'll reply on WhatsApp with your preview.</p>
          )}
        </div>
      )}

      <div className="flex gap-3 justify-center">
        <Link to="/" className="text-zinc-900 font-semibold">Continue Shopping</Link>
        <Link to="/track-order" className="text-zinc-900 font-semibold">Track Order →</Link>
      </div>
    </div>
  );
}

export function TrackOrderPage() {
  return (
    <div className="max-w-2xl mx-auto px-6 sm:px-10 lg:px-20 py-16 sm:py-24">
      <h1 className="text-2xl font-bold text-zinc-900 mb-6 text-center">Track Your Order</h1>

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

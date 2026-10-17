import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import { api } from "../utils/api";
import { useCart } from "../context/CartContext";
import { trackPurchase } from "../utils/metaPixel";

type Phase = "checking" | "failed" | "pending" | "problem" | "missing";

const MAX_POLLS = 8;
const POLL_MS = 1500;

// Easebuzz sends the browser here (via our backend callback) after the payment
// attempt. The payment status comes from OUR server, never from the URL.
export default function PaymentResultPage() {
  const [params] = useSearchParams();
  const txnid = params.get("txnid") || "";
  const navigate = useNavigate();
  const { clearCart } = useCart();
  const [phase, setPhase] = useState<Phase>(txnid ? "checking" : "missing");
  const handled = useRef(false);

  useEffect(() => {
    if (!txnid) return;
    let alive = true;
    let polls = 0;

    const check = async () => {
      try {
        const r = await api.get(`/api/payments/easebuzz/status/${encodeURIComponent(txnid)}`);
        if (!alive) return;
        if (r.status === "success" && r.orderId) {
          if (handled.current) return;
          handled.current = true;
          if (r.accessToken) {
            try { sessionStorage.setItem(`3dcasemakers_order_access:${r.orderId}`, r.accessToken); } catch { /* receipt still supports status tracking */ }
          }
          // Purchase pixel: once per order, even if the customer reloads this page.
          const flag = `3dcasemakers_purchase_tracked:${r.orderId}`;
          let already = false;
          try { already = !!sessionStorage.getItem(flag); sessionStorage.setItem(flag, "1"); } catch { /* ignore */ }
          if (!already) {
            try {
              trackPurchase({
                orderId: r.orderId,
                accessToken: r.accessToken,
                total: Number(r.total),
                customerName: r.customerName,
                customerEmail: r.customerEmail,
                customerPhone: r.customerPhone,
                cartItems: (r.items || []).map((i: any) => ({
                  productId: String(i.productId ?? ""),
                  productName: String(i.productName ?? ""),
                  price: Number(i.price) || 0,
                  quantity: Number(i.quantity) || 1,
                })),
              });
            } catch { /* analytics must never block the confirmation */ }
          }
          clearCart();
          navigate(`/order-confirmed/${r.orderId}`, { replace: true });
          return;
        }
        if (r.status === "processing" || r.status === "pending") {
          polls += 1;
          if (polls < MAX_POLLS) { setTimeout(check, POLL_MS); return; }
          setPhase("pending");
          return;
        }
        if (r.status === "mismatch" || r.status === "paid_no_order") { setPhase("problem"); return; }
        setPhase("failed");
      } catch {
        if (!alive) return;
        polls += 1;
        if (polls < MAX_POLLS) setTimeout(check, POLL_MS);
        else setPhase("pending");
      }
    };
    check();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txnid]);

  const wrap = "max-w-xl mx-auto px-6 py-20 text-center";
  const btn = "inline-block glass-btn-gold text-white font-bold uppercase tracking-wide text-sm px-8 py-3.5 rounded-lg";

  if (phase === "checking") {
    return (
      <div className={wrap} role="status">
        <Loader2 className="mx-auto mb-4 animate-spin text-zinc-900" size={48} />
        <h1 className="text-xl font-bold text-zinc-900 mb-2">Confirming your payment…</h1>
        <p className="text-zinc-500">Please don&apos;t close or refresh this page.</p>
      </div>
    );
  }

  if (phase === "failed") {
    return (
      <div className={wrap} role="alert">
        <XCircle className="mx-auto mb-4 text-red-600" size={56} />
        <h1 className="text-2xl font-bold text-zinc-900 mb-2">Payment unsuccessful</h1>
        <p className="text-zinc-500 mb-6">Your payment was not completed and no order was placed. If any amount was debited, your bank will reverse it automatically. Your cart is still saved.</p>
        <Link to="/checkout" className={btn}>Try Again</Link>
      </div>
    );
  }

  if (phase === "pending") {
    return (
      <div className={wrap} role="status">
        <Clock className="mx-auto mb-4 text-amber-600" size={56} />
        <h1 className="text-2xl font-bold text-zinc-900 mb-2">Payment is being processed</h1>
        <p className="text-zinc-500 mb-2">Your bank hasn&apos;t confirmed the payment yet. If it succeeds, your order will be created automatically and you&apos;ll get an email confirmation.</p>
        <p className="text-xs text-zinc-400 mb-6">Reference: <span className="font-mono break-all">{txnid}</span></p>
        <Link to="/contact" className={btn}>Contact Us</Link>
      </div>
    );
  }

  if (phase === "problem") {
    return (
      <div className={wrap} role="alert">
        <CheckCircle2 className="mx-auto mb-4 text-amber-600" size={56} />
        <h1 className="text-2xl font-bold text-zinc-900 mb-2">We received your payment</h1>
        <p className="text-zinc-500 mb-2">But we couldn&apos;t finish creating your order automatically. Please contact us with the reference below — we&apos;ll sort it out right away.</p>
        <p className="text-xs text-zinc-400 mb-6">Reference: <span className="font-mono break-all">{txnid}</span></p>
        <Link to="/contact" className={btn}>Contact Us</Link>
      </div>
    );
  }

  return (
    <div className={wrap}>
      <h1 className="text-xl font-bold text-zinc-900 mb-2">Nothing to show here</h1>
      <p className="text-zinc-500 mb-6">We couldn&apos;t find a payment to check.</p>
      <Link to="/" className={btn}>Back to Home</Link>
    </div>
  );
}

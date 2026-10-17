import { useEffect, useState, useRef } from "react";
import { useParams, Link } from "react-router";
import { api, API_URL } from "../utils/api";
import {
  QrCode,
  Copy,
  Check,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  Clock,
  Upload,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";

interface PaymentOrderDetails {
  orderId: string;
  amount: number;
  subtotal: number;
  shipping: number;
  customerName?: string;
  customerPhone?: string;
  paymentMethod: string;
  paymentStatus: "awaiting_payment" | "pending_verification" | "verified" | "paid" | "failed";
  orderStatus: string;
  upiId: string;
  payeeName: string;
  upiUri: string;
  qrDataUrl: string;
  screenshotEnabled: boolean;
  submission?: {
    upiApp?: string;
    transactionId?: string;
    screenshotPath?: string;
    submittedAt?: string;
    rejectionReason?: string;
  } | null;
  rejectionReason?: string | null;
}

const UPI_APPS = [
  "Google Pay",
  "PhonePe",
  "Paytm",
  "BHIM",
  "Other UPI App",
];

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

export default function DirectUpiPaymentPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const [details, setDetails] = useState<PaymentOrderDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [phonePrompt, setPhonePrompt] = useState(false);
  const [verifyPhone, setVerifyPhone] = useState("");

  // Copy feedback state
  const [copied, setCopied] = useState(false);

  // Form state
  const [selectedApp, setSelectedApp] = useState("Google Pay");
  const [transactionId, setTransactionId] = useState("");
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string>("");
  const [uploadingScreenshot, setUploadingScreenshot] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [isResubmitting, setIsResubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const accessKey = (id: string) => `3dcasemakers_order_access:${id}`;
  const getAccessToken = (id: string) => {
    try {
      return sessionStorage.getItem(accessKey(id)) || "";
    } catch {
      return "";
    }
  };

  const loadDetails = async (phoneOverride?: string) => {
    if (!orderId) return;
    setLoading(true);
    setError("");
    const token = getAccessToken(orderId);
    try {
      let url = `/api/payments/manual-upi/order/${encodeURIComponent(orderId)}`;
      if (phoneOverride) {
        url += `?phone=${encodeURIComponent(phoneOverride)}`;
      }
      const headers: Record<string, string> = {};
      if (token) headers["X-Order-Access"] = token;

      const res = await fetch(`${API_URL}${url}`, { headers });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 403) {
          setPhonePrompt(true);
          setLoading(false);
          return;
        }
        throw new Error(data.error || "Unable to load order payment details.");
      }
      setDetails(data);
      setPhonePrompt(false);
    } catch (err: any) {
      setError(err.message || "Unable to load order payment details. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Scroll to top on page mount
  useEffect(() => {
    scrollToTopNow();
    const t = setTimeout(scrollToTopNow, 60);
    return () => clearTimeout(t);
  }, []);

  // Whenever paymentStatus updates (e.g. customer submits UTR and status becomes pending_verification),
  // automatically scroll to top immediately so the confirmation/next screen is visible from the top!
  useEffect(() => {
    if (details?.paymentStatus) {
      scrollToTopNow();
      const t1 = setTimeout(scrollToTopNow, 50);
      const t2 = setTimeout(scrollToTopNow, 150);
      const t3 = setTimeout(scrollToTopNow, 350);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    }
  }, [details?.paymentStatus]);

  useEffect(() => {
    loadDetails();
  }, [orderId]);

  const handleCopyUpi = () => {
    if (!details?.upiId) return;
    try {
      navigator.clipboard.writeText(details.upiId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handlePhoneVerifySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyPhone.trim()) return;
    loadDetails(verifyPhone.trim());
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp", "image/jpg"].includes(file.type.toLowerCase())) {
      setSubmitError("Please upload a valid image file (JPEG, PNG, or WebP).");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setSubmitError("Screenshot image size must be less than 5MB.");
      return;
    }

    setSubmitError("");
    setScreenshotFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      setScreenshotPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderId || !details) return;

    const trimmedTxn = transactionId.trim();
    if (!trimmedTxn) {
      setSubmitError("Please enter your UPI Transaction ID / UTR number.");
      return;
    }
    if (trimmedTxn.length < 6) {
      setSubmitError("Transaction ID must be at least 6 characters.");
      return;
    }

    setSubmitting(true);
    setSubmitError("");

    try {
      let screenshotUrl = details.submission?.screenshotPath || "";

      // Upload screenshot if customer selected a new file
      if (screenshotFile) {
        setUploadingScreenshot(true);
        const formData = new FormData();
        formData.append("image", screenshotFile);
        const uploadRes = await fetch(`${API_URL}/api/upload/customer`, {
          method: "POST",
          body: formData,
        });
        const uploadData = await uploadRes.json();
        if (!uploadRes.ok || !uploadData.url) {
          throw new Error(uploadData.error || "Failed to upload screenshot. Please try again.");
        }
        screenshotUrl = uploadData.url;
        setUploadingScreenshot(false);
      }

      const token = getAccessToken(orderId);
      const submitRes = await fetch(`${API_URL}/api/payments/manual-upi/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "X-Order-Access": token } : {}),
        },
        body: JSON.stringify({
          orderId,
          upiApp: selectedApp,
          transactionId: trimmedTxn,
          screenshotUrl,
          customerPhone: details.customerPhone || verifyPhone,
        }),
      });

      const submitData = await submitRes.json();
      if (!submitRes.ok) {
        throw new Error(submitData.error || "Failed to submit payment details.");
      }

      // Refresh details to show submitted screen and scroll to top
      setIsResubmitting(false);
      scrollToTopNow();
      await loadDetails(verifyPhone || details.customerPhone);
      scrollToTopNow();
      requestAnimationFrame(scrollToTopNow);
      setTimeout(scrollToTopNow, 50);
      setTimeout(scrollToTopNow, 150);
      setTimeout(scrollToTopNow, 350);
    } catch (err: any) {
      setSubmitError(err.message || "Payment details could not be submitted. Please try again.");
    } finally {
      setSubmitting(false);
      setUploadingScreenshot(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-xl mx-auto px-6 py-24 text-center">
        <RefreshCw className="w-8 h-8 mx-auto animate-spin text-[var(--brand-primary)] mb-3" />
        <p className="text-zinc-600 font-medium">Generating payment details &amp; QR...</p>
      </div>
    );
  }

  if (phonePrompt) {
    return (
      <div className="max-w-md mx-auto px-6 py-20">
        <div className="glass-card rounded-2xl p-6 sm:p-8 space-y-4">
          <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 mx-auto">
            <ShieldCheck size={24} />
          </div>
          <h1 className="text-xl font-bold text-center text-zinc-900">Verify Order Access</h1>
          <p className="text-xs text-zinc-600 text-center">
            To view payment details for Order #{orderId}, please enter the 10-digit phone number you provided during checkout.
          </p>
          <form onSubmit={handlePhoneVerifySubmit} className="space-y-3 pt-2">
            <div>
              <label className="text-xs font-semibold text-zinc-700 block mb-1">Phone Number</label>
              <input
                type="tel"
                value={verifyPhone}
                onChange={(e) => setVerifyPhone(e.target.value)}
                placeholder="10-digit mobile number"
                className="w-full border border-zinc-300 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-zinc-900"
                maxLength={10}
                required
              />
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <button
              type="submit"
              className="w-full glass-btn-gold text-white font-bold py-3 rounded-xl text-sm transition-colors"
            >
              Verify &amp; Continue
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (error || !details) {
    return (
      <div className="max-w-lg mx-auto px-6 py-20 text-center">
        <AlertCircle className="w-12 h-12 mx-auto text-red-500 mb-3" />
        <h1 className="text-xl font-bold text-zinc-900 mb-2">Unable to Load Payment</h1>
        <p className="text-sm text-zinc-600 mb-6">{error || "Order payment details could not be found."}</p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => loadDetails()}
            className="glass-btn-grey px-5 py-2.5 rounded-full text-sm font-semibold"
          >
            Try Again
          </button>
          <Link to="/track-order" className="glass-btn-gold text-white px-5 py-2.5 rounded-full text-sm font-semibold">
            Track Order
          </Link>
        </div>
      </div>
    );
  }

  const isVerified = details.paymentStatus === "verified" || details.paymentStatus === "paid";
  const isPendingVerification = details.paymentStatus === "pending_verification";
  const isFailed = details.paymentStatus === "failed";
  const showForm = !isVerified && (!isPendingVerification || isResubmitting);

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      {/* 1. Header Information */}
      <div className="text-center mb-6">
        <h1 className="text-2xl sm:text-3xl font-black text-zinc-900 tracking-tight">
          Complete Your Payment
        </h1>
        <p className="text-xs sm:text-sm text-zinc-500 font-mono mt-1">
          Order ID: #{details.orderId}
        </p>
      </div>

      {/* 2. Amount to Pay Box - High visual priority */}
      <div className="glass-card rounded-2xl p-5 sm:p-6 mb-6 text-center border-2 border-[var(--brand-primary)]/40 shadow-sm">
        <p className="text-xs uppercase font-bold tracking-wider text-zinc-500 mb-1">
          Amount to Pay
        </p>
        <div className="text-3xl sm:text-4xl font-black text-zinc-900">
          ₹{details.amount}
        </div>
        <p className="text-[11px] text-zinc-500 mt-1">
          Exact order total after products, discounts and shipping charges
        </p>
      </div>

      {/* Verified Notice if already confirmed */}
      {isVerified && (
        <div className="glass-card rounded-2xl p-6 sm:p-8 text-center space-y-3 mb-6 bg-emerald-50 border border-emerald-200">
          <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
          <h2 className="text-xl font-black text-emerald-900">Payment Verified!</h2>
          <p className="text-xs sm:text-sm text-emerald-800">
            Your payment for <strong>Order #{details.orderId}</strong> has been confirmed. Your order is now being processed.
          </p>
          <div className="pt-2">
            <Link
              to={`/order-confirmed/${encodeURIComponent(details.orderId)}`}
              className="inline-flex items-center gap-2 glass-btn-gold text-white font-bold px-6 py-3 rounded-xl text-sm"
            >
              View My Order <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      )}

      {/* Pending Verification Screen (Requirement 20) */}
      {isPendingVerification && !isResubmitting && (
        <div className="glass-card rounded-2xl p-6 sm:p-8 text-center space-y-4 mb-6 border border-amber-200 bg-amber-50/50">
          <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 mx-auto">
            <Clock size={28} />
          </div>
          <h2 className="text-2xl font-black text-zinc-900">Thank You!</h2>
          <p className="text-sm font-semibold text-zinc-800">
            Your payment details have been submitted successfully.
          </p>
          <div className="max-w-md mx-auto text-xs text-zinc-600 space-y-1">
            <p>Your payment is currently under verification.</p>
            <p>We will verify your transaction and confirm your order shortly.</p>
            <p className="font-medium text-zinc-800 pt-1">
              You will receive a message from us once your order has been confirmed.
            </p>
          </div>

          <div className="bg-white rounded-xl p-4 border border-zinc-200 text-left max-w-sm mx-auto space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-zinc-500">Order ID:</span>
              <span className="font-mono font-bold text-zinc-900">#{details.orderId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Amount:</span>
              <span className="font-bold text-zinc-900">₹{details.amount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">UPI App:</span>
              <span className="font-medium text-zinc-800">{details.submission?.upiApp || "UPI"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Transaction ID / UTR:</span>
              <span className="font-mono font-bold text-zinc-900 break-all">{details.submission?.transactionId || "—"}</span>
            </div>
            <div className="flex justify-between items-center pt-1 border-t border-zinc-100">
              <span className="text-zinc-500">Payment Status:</span>
              <span className="bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full text-[10px]">
                Pending Verification
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 justify-center pt-2">
            <Link
              to={`/order-confirmed/${encodeURIComponent(details.orderId)}`}
              className="glass-btn-gold text-white font-bold px-6 py-3 rounded-xl text-sm inline-flex items-center gap-2"
            >
              View My Order <ArrowRight size={16} />
            </Link>
            <button
              type="button"
              onClick={() => setIsResubmitting(true)}
              className="text-xs text-zinc-500 hover:text-zinc-800 underline py-2 px-3"
            >
              Edit submitted UTR
            </button>
          </div>
        </div>
      )}

      {/* Rejection / Failed Notice (Requirement 28) */}
      {isFailed && (
        <div className="glass-card rounded-2xl p-5 mb-6 border border-red-200 bg-red-50 text-red-900 space-y-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            <h3 className="font-black text-sm">Payment Verification Failed</h3>
          </div>
          <p className="text-xs text-red-800">
            {details.rejectionReason
              ? `Reason: ${details.rejectionReason}`
              : "We could not verify your payment with the details provided."}
          </p>
          <p className="text-[11px] text-red-700">
            Please check your UPI app transaction history and enter the correct Transaction ID / UTR number below to resubmit.
          </p>
        </div>
      )}

      {/* Payment Instructions & QR Section (Always visible for scanning & reference) */}
      <div className="glass-card rounded-2xl p-5 sm:p-8 space-y-6 mb-6">
        {/* Dynamic QR Code */}
        <div className="text-center space-y-3">
          <div className="inline-block p-4 bg-white rounded-2xl border-2 border-zinc-200 shadow-sm max-w-full">
            {details.qrDataUrl ? (
              <img
                src={details.qrDataUrl}
                alt={`UPI Payment QR for Order #${details.orderId}`}
                className="w-56 h-56 sm:w-64 sm:h-64 object-contain mx-auto rounded-lg"
              />
            ) : (
              <div className="w-56 h-56 flex items-center justify-center bg-zinc-100 rounded-lg text-zinc-400">
                <QrCode size={48} />
              </div>
            )}
          </div>
          <div>
            <p className="text-sm font-bold text-zinc-900">
              Scan this QR using any UPI app
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
              {["Google Pay", "PhonePe", "Paytm", "BHIM", "Any UPI App"].map((name) => (
                <span
                  key={name}
                  className="px-2.5 py-1 bg-zinc-100 rounded-full text-[10px] font-semibold text-zinc-700"
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Mobile UPI Deep-link Button */}
        <div className="pt-2">
          <a
            href={details.upiUri}
            className="w-full glass-btn-gold text-white font-bold py-4 rounded-xl text-center text-sm uppercase tracking-wide flex items-center justify-center gap-2 shadow-md hover:brightness-105 transition-all"
          >
            <Smartphone size={18} />
            Pay ₹{details.amount} with UPI
          </a>
          <p className="text-[11px] text-zinc-500 text-center mt-2">
            Tapping opens your installed UPI apps (GPay, PhonePe, Paytm, BHIM) on supported mobile devices.
          </p>
        </div>

        {/* UPI ID & Copy Section */}
        <div className="bg-zinc-50 rounded-xl p-3.5 sm:p-4 border border-zinc-200 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="text-[10px] uppercase font-bold text-zinc-400 block tracking-wider">
              UPI ID
            </span>
            <span className="font-mono font-bold text-sm text-zinc-900 break-all select-all">
              {details.upiId}
            </span>
            {details.payeeName && (
              <span className="text-[11px] text-zinc-500 block">
                Payee: {details.payeeName}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handleCopyUpi}
            className="shrink-0 glass-btn-grey px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            {copied ? (
              <>
                <Check size={14} className="text-emerald-600" />
                <span className="text-emerald-700">UPI ID copied!</span>
              </>
            ) : (
              <>
                <Copy size={14} />
                <span>Copy UPI ID</span>
              </>
            )}
          </button>
        </div>

        {/* How to Pay Steps */}
        <div className="border-t border-zinc-200 pt-5 space-y-3">
          <h3 className="text-sm font-bold text-zinc-900">How to Pay</h3>
          <ol className="space-y-2 text-xs text-zinc-600">
            <li className="flex gap-2">
              <span className="w-5 h-5 rounded-full bg-zinc-200 font-bold text-zinc-800 flex items-center justify-center shrink-0 text-[10px]">1</span>
              <span>Scan the QR code above or tap &quot;Pay with UPI&quot; using your preferred app.</span>
            </li>
            <li className="flex gap-2">
              <span className="w-5 h-5 rounded-full bg-zinc-200 font-bold text-zinc-800 flex items-center justify-center shrink-0 text-[10px]">2</span>
              <span>Check that the displayed payment amount matches your order total (<strong>₹{details.amount}</strong>).</span>
            </li>
            <li className="flex gap-2">
              <span className="w-5 h-5 rounded-full bg-zinc-200 font-bold text-zinc-800 flex items-center justify-center shrink-0 text-[10px]">3</span>
              <span>Complete the UPI payment securely.</span>
            </li>
            <li className="flex gap-2">
              <span className="w-5 h-5 rounded-full bg-zinc-200 font-bold text-zinc-800 flex items-center justify-center shrink-0 text-[10px]">4</span>
              <span>Return to this page after payment.</span>
            </li>
            <li className="flex gap-2">
              <span className="w-5 h-5 rounded-full bg-zinc-200 font-bold text-zinc-800 flex items-center justify-center shrink-0 text-[10px]">5</span>
              <span>Enter your <strong>UPI Transaction ID / UTR</strong> number below.</span>
            </li>
            <li className="flex gap-2">
              <span className="w-5 h-5 rounded-full bg-zinc-200 font-bold text-zinc-800 flex items-center justify-center shrink-0 text-[10px]">6</span>
              <span>Submit your payment details for verification.</span>
            </li>
          </ol>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-[11px] text-amber-800 font-medium">
            ⚠️ <strong>Important:</strong> Please pay the exact amount of <strong>₹{details.amount}</strong> shown above. Opening the UPI app or scanning the QR does not automatically verify payment.
          </div>
        </div>
      </div>

      {/* 3. Already Paid? Submission Form */}
      {showForm && (
        <form onSubmit={handleSubmitPayment} className="glass-card rounded-2xl p-5 sm:p-8 space-y-5">
          <div className="border-b border-zinc-200 pb-3">
            <h2 className="text-lg font-black text-zinc-900">Already Paid?</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Submit your payment details below for verification.
            </p>
          </div>

          {submitError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{submitError}</span>
            </div>
          )}

          {/* App Used Selector */}
          <div>
            <label className="text-xs font-bold text-zinc-800 block mb-1.5">
              Which app did you use to pay?
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {UPI_APPS.map((app) => (
                <button
                  key={app}
                  type="button"
                  onClick={() => setSelectedApp(app)}
                  className={`py-2 px-3 rounded-xl border text-xs font-semibold text-center transition-all ${
                    selectedApp === app
                      ? "border-[var(--brand-primary)] bg-[var(--brand-primary)]/10 text-zinc-900 shadow-sm"
                      : "border-zinc-200 hover:border-zinc-300 bg-white text-zinc-600"
                  }`}
                >
                  {app}
                </button>
              ))}
            </div>
          </div>

          {/* Transaction ID / UTR Input */}
          <div>
            <label className="text-xs font-bold text-zinc-800 block mb-1">
              UPI Transaction ID / UTR Number <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={transactionId}
              onChange={(e) => setTransactionId(e.target.value)}
              placeholder="Enter Transaction ID / UTR (e.g. 123456789012)"
              className="w-full border border-zinc-300 rounded-xl px-3.5 py-3 text-sm font-mono outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 uppercase"
              required
            />
            <p className="text-[11px] text-zinc-500 mt-1">
              You can find this number in your UPI application&apos;s transaction details (usually 12 digits or alphanumeric).
            </p>
          </div>

          {/* Payment Screenshot (Optional / if enabled) */}
          {details.screenshotEnabled && (
            <div>
              <label className="text-xs font-bold text-zinc-800 block mb-1">
                Upload Payment Screenshot <span className="text-zinc-400 font-normal">(Optional)</span>
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                className="hidden"
              />
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-zinc-300 rounded-xl p-4 text-center cursor-pointer hover:border-zinc-400 transition-colors bg-zinc-50/50"
              >
                {screenshotPreview ? (
                  <div className="space-y-2">
                    <img
                      src={screenshotPreview}
                      alt="Payment Screenshot Preview"
                      className="max-h-48 mx-auto rounded-lg object-contain border border-zinc-200"
                    />
                    <p className="text-xs text-[var(--brand-primary)] font-semibold">
                      Click to change screenshot
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5 py-2">
                    <Upload className="w-6 h-6 mx-auto text-zinc-400" />
                    <p className="text-xs font-semibold text-zinc-700">
                      Upload payment screenshot / receipt
                    </p>
                    <p className="text-[10px] text-zinc-500">
                      PNG, JPG, or WebP up to 5MB
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || uploadingScreenshot}
            className="w-full glass-btn-gold text-white font-bold uppercase tracking-wide text-sm py-4 rounded-xl disabled:opacity-50 transition-colors shadow-sm"
          >
            {submitting || uploadingScreenshot
              ? "Submitting payment details..."
              : isResubmitting
              ? "Update Payment Details"
              : "Submit Payment Details"}
          </button>
        </form>
      )}

      {/* Back to Order / Tracking links */}
      <div className="flex flex-wrap gap-4 justify-center mt-6 text-xs text-zinc-600">
        <Link to={`/order-confirmed/${encodeURIComponent(details.orderId)}`} className="underline hover:text-zinc-900">
          Order Details
        </Link>
        <span>•</span>
        <Link to="/track-order" className="underline hover:text-zinc-900">
          Track Order
        </Link>
      </div>
    </div>
  );
}

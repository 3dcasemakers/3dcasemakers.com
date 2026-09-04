import { useEffect, useState } from "react";
import { api } from "../utils/api";

const DEFAULT_NUMBER = "916369418105"; // +91 63694 18105
const DEFAULT_WHATSAPP_MESSAGE = "Hi 3DCaseMakers! I had a doubt about my order.";
const DEFAULT_INSTAGRAM_URL = "https://www.instagram.com/3d_case_maker/";

// Reassurance banner shown right below the "Pay now" button on Checkout, to
// ease doubts about paying online — points buyers to Instagram reviews or a
// direct WhatsApp chat. Numbers/links come from Admin -> Settings.
export default function PaymentTrustBanner() {
  const [whatsappNumber, setWhatsappNumber] = useState(DEFAULT_NUMBER);
  const [instagramUrl, setInstagramUrl] = useState(DEFAULT_INSTAGRAM_URL);

  useEffect(() => {
    api
      .get("/api/settings")
      .then((s: any) => {
        const raw = (s?.whatsappNumber || "").replace(/[^\d]/g, "");
        if (raw) setWhatsappNumber(raw);
        if (s?.instagramUrl) setInstagramUrl(s.instagramUrl);
      })
      .catch(() => {});
  }, []);

  const whatsappHref = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(DEFAULT_WHATSAPP_MESSAGE)}`;

  return (
    <div className="rounded-xl border-2 border-blue-300 bg-blue-50 shadow-sm pl-3 pr-2.5 sm:pl-3.5 sm:pr-3 py-2 flex items-center gap-2 sm:gap-2.5">
      <span className="text-lg shrink-0 select-none">🙂</span>

      <p className="flex-1 min-w-0 text-[11px] sm:text-xs leading-snug text-zinc-800">
        <span className="font-bold">Order la doubt ah?</span>{" "}
        <a href={instagramUrl} target="_blank" rel="noreferrer" className="font-bold text-rose-600 hover:underline">
          Instagram reviews
        </a>{" "}
        check pannunga illa{" "}
        <a href={whatsappHref} target="_blank" rel="noreferrer" className="font-bold text-emerald-600 hover:underline">
          WhatsApp
        </a>{" "}
        la message pannunga. Nambikkai oda order pannunga ❤️
      </p>

      <div className="flex items-center gap-1.5 shrink-0">
        <a
          href={instagramUrl}
          target="_blank"
          rel="noreferrer"
          aria-label="Instagram"
          className="w-7 h-7 rounded-full overflow-hidden shrink-0 shadow-sm"
        >
          <svg viewBox="0 0 48 48" className="w-full h-full">
            <defs>
              <radialGradient id="igGradientBanner" cx="30%" cy="107%" r="150%">
                <stop offset="0%" stopColor="#fdf497" />
                <stop offset="5%" stopColor="#fdf497" />
                <stop offset="45%" stopColor="#fd5949" />
                <stop offset="60%" stopColor="#d6249f" />
                <stop offset="90%" stopColor="#285AEB" />
              </radialGradient>
            </defs>
            <rect width="48" height="48" rx="12" fill="url(#igGradientBanner)" />
            <rect x="12" y="12" width="24" height="24" rx="7" fill="none" stroke="#fff" strokeWidth="2.2" />
            <circle cx="24" cy="24" r="6.2" fill="none" stroke="#fff" strokeWidth="2.2" />
            <circle cx="31.6" cy="16.4" r="1.6" fill="#fff" />
          </svg>
        </a>
        <a
          href={whatsappHref}
          target="_blank"
          rel="noreferrer"
          aria-label="WhatsApp"
          className="w-7 h-7 rounded-full overflow-hidden shrink-0 shadow-sm bg-[#25D366] flex items-center justify-center"
        >
          <svg viewBox="0 0 32 32" className="w-4.5 h-4.5" fill="white" xmlns="http://www.w3.org/2000/svg">
            <path d="M16.02 3C9.4 3 4 8.4 4 15.02c0 2.36.66 4.56 1.8 6.44L4 29l7.72-1.76a11.94 11.94 0 0 0 4.3.8h.01c6.62 0 12.02-5.4 12.02-12.02C28.05 8.4 22.65 3 16.02 3zm0 21.9c-1.5 0-2.95-.4-4.22-1.14l-.3-.18-4.58 1.04 1.06-4.47-.2-.31a9.83 9.83 0 0 1-1.5-5.22C6.28 9.5 10.62 5.16 16.02 5.16c2.62 0 5.08 1.02 6.93 2.88a9.74 9.74 0 0 1 2.87 6.9c0 5.4-4.35 9.86-9.8 9.86zm5.4-7.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.24-.46-2.36-1.46-.87-.78-1.46-1.74-1.63-2.04-.17-.3-.02-.46.13-.6.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.06 2.88 1.21 3.08c.15.2 2.09 3.2 5.08 4.48.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35z" />
          </svg>
        </a>
      </div>
    </div>
  );
}

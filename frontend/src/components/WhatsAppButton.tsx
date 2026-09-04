// Site-wide floating WhatsApp button — realistic WhatsApp green, liquid-glass finish.
// Clicking it opens a WhatsApp chat with the store's number. The number and default
// message are both configurable from the admin panel (Settings → Social & Chat).
import { useEffect, useState } from "react";
import { api } from "../utils/api";
import { useCart } from "../context/CartContext";

const DEFAULT_NUMBER = "916369418105"; // +91 63694 18105
const DEFAULT_MESSAGE = "Hi 3DCaseMakers! I'd like to know more about your products.";

export default function WhatsAppButton({ hasBottomNav = false }: { hasBottomNav?: boolean }) {
  const [number, setNumber] = useState(DEFAULT_NUMBER);
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const { isDrawerOpen } = useCart();

  useEffect(() => {
    api
      .get("/api/settings")
      .then((s: any) => {
        const raw = (s?.whatsappNumber || "").replace(/[^\d]/g, "");
        if (raw) setNumber(raw);
        if (s?.whatsappMessage) setMessage(s.whatsappMessage);
      })
      .catch(() => {});
  }, []);

  const href = `https://wa.me/${number}?text=${encodeURIComponent(message)}`;

  if (isDrawerOpen) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label="Chat with us on WhatsApp"
      className={`fixed right-5 z-[60] w-14 h-14 flex items-center justify-center
                 bg-[#25D366] shadow-lg overflow-hidden
                 transition-transform duration-200 hover:scale-110 active:scale-95 group
                 lg:bottom-5 ${hasBottomNav ? "bottom-20" : "bottom-5"}`}
      style={{ borderRadius: "9999px" }}
    >
      <svg
        viewBox="0 0 32 32"
        className="w-8 h-8 relative"
        fill="white"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M16.02 3C9.4 3 4 8.4 4 15.02c0 2.36.66 4.56 1.8 6.44L4 29l7.72-1.76a11.94 11.94 0 0 0 4.3.8h.01c6.62 0 12.02-5.4 12.02-12.02C28.05 8.4 22.65 3 16.02 3zm0 21.9c-1.5 0-2.95-.4-4.22-1.14l-.3-.18-4.58 1.04 1.06-4.47-.2-.31a9.83 9.83 0 0 1-1.5-5.22C6.28 9.5 10.62 5.16 16.02 5.16c2.62 0 5.08 1.02 6.93 2.88a9.74 9.74 0 0 1 2.87 6.9c0 5.4-4.35 9.86-9.8 9.86zm5.4-7.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.24-.46-2.36-1.46-.87-.78-1.46-1.74-1.63-2.04-.17-.3-.02-.46.13-.6.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.06 2.88 1.21 3.08c.15.2 2.09 3.2 5.08 4.48.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35z" />
      </svg>
    </a>
  );
}

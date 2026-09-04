import { useParams, Link } from "react-router";
import { useMemo, useState } from "react";
import {
  Truck,
  Lock,
  FileText,
  RotateCcw,
  ChevronRight,
  Mail,
  Phone,
  MapPin,
  Info,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ShieldAlert,
} from "lucide-react";

type Section = { heading?: string; paragraphs?: string[]; bullets?: string[]; note?: { tone: "info" | "success" | "danger" | "warning"; text: string } };
type Policy = { title: string; short: string; icon: typeof Truck; sections: Section[] };

const CONTACT_EMAIL = "3dcasemakers@gmail.com";
const CONTACT_WHATSAPP = "+91 63694 18105";
const LAST_UPDATED = "July 25, 2026";

const CONTACT_SECTION: Section = {
  heading: "CONTACT US",
  paragraphs: [`Email: ${CONTACT_EMAIL}`, `WhatsApp: ${CONTACT_WHATSAPP}`, "Location: Avinashi, Tamil Nadu, India - 641654"],
};

const POLICIES: Record<string, Policy> = {
  shipping: {
    title: "Shipping Policy",
    short: "Delivery times, courier partners, and tracking",
    icon: Truck,
    sections: [
      {
        paragraphs: [
          "Thank you for shopping with 3DCaseMakers. We aim to deliver your customized products safely and efficiently across India.",
        ],
      },
      {
        heading: "PROCESSING TIME",
        bullets: [
          "This is a custom-made product, so it takes a couple of hours to process.",
          "During peak seasons or high-demand periods, processing times may extend slightly. We appreciate your patience.",
          "You will receive an email confirmation with tracking information once your order has shipped.",
        ],
      },
      {
        heading: "ORDER TRACKING",
        bullets: [
          "Once your order has shipped, you will receive a tracking number via email.",
          "Tracking updates may take up to 24–48 hours to appear.",
          "For shipments within Tamil Nadu and Puducherry, we offer free shipping via ST Courier.",
          "For deliveries to other states, orders are shipped via Post Office (India Post), and a courier charge of ₹50 applies.",
          "If you do not receive your tracking details, please check your spam/junk folder or contact our support team.",
        ],
      },
      {
        heading: "COURIER PARTNERS",
        paragraphs: [
          "Tamil Nadu & Puducherry: ST Courier — Free Shipping",
          "Other States: Post Office (India Post) — ₹50 Shipping Charge",
        ],
      },
      {
        heading: "LOST OR DELAYED SHIPMENTS",
        bullets: [
          "If your package is delayed beyond the estimated delivery time, please allow a few extra days before reaching out.",
          "If your package is marked as delivered but you did not receive it, please check with neighbors, your local post office, or carrier before contacting us.",
          "If your order is lost in transit, we will work with the carrier to resolve the issue.",
        ],
      },
      {
        heading: "RETURNS DUE TO INCORRECT ADDRESS",
        bullets: [
          "Please ensure your shipping address is correct at checkout.",
          "If a package is returned due to an incorrect or incomplete address, additional shipping charges may apply to resend the order.",
        ],
      },
      {
        heading: "ADDRESS ACCURACY",
        paragraphs: [
          "Customers are responsible for providing accurate shipping details. 3DCaseMakers is not responsible for delivery issues caused by incorrect addresses or unavailable recipients.",
        ],
      },
      CONTACT_SECTION,
    ],
  },
  privacy: {
    title: "Privacy Policy",
    short: "What we collect and how it's used",
    icon: Lock,
    sections: [
      {
        paragraphs: [
          "3DCaseMakers independently operates and manages this website, including all products, services, payment systems, and customer experiences provided through the platform. This Privacy Policy explains how we collect, use, store, and protect your personal information when you browse our website, place orders, contact customer support, or interact with our services.",
        ],
      },
      {
        heading: "INFORMATION WE COLLECT",
        bullets: [
          "Name, phone number, email address, and shipping address.",
          "Order and payment related details.",
          "Device information such as browser and IP address.",
          "Website usage and interaction analytics.",
          "Customer support messages and inquiries.",
        ],
      },
      {
        heading: "HOW WE USE YOUR INFORMATION",
        bullets: [
          "To process and deliver your orders.",
          "To improve our website and shopping experience.",
          "To provide customer support.",
          "To send updates regarding orders and offers.",
          "To prevent fraud and unauthorized activity.",
        ],
      },
      {
        heading: "THIRD-PARTY SERVICES",
        paragraphs: ["We may share limited information with trusted third-party providers who help us operate our business efficiently."],
        bullets: [
          "Courier and Cash on Delivery collection partners.",
          "Shipping and logistics partners.",
          "Analytics and website performance tools.",
          "Communication and support platforms.",
        ],
      },
      {
        heading: "DATA SECURITY",
        paragraphs: ["We use reasonable security practices to protect your information. However, no online service can guarantee absolute security."],
      },
      CONTACT_SECTION,
    ],
  },
  terms: {
    title: "Terms and Conditions",
    short: "The rules for using 3DCaseMakers and placing orders",
    icon: FileText,
    sections: [
      {
        paragraphs: [
          "Welcome to 3DCaseMakers! By accessing or purchasing from our website, you agree to the following terms and conditions. Please read them carefully before placing an order.",
        ],
      },
      {
        heading: "1. GENERAL",
        bullets: [
          "3DCaseMakers offers customized phone cases and accessories designed to reflect your style.",
          "By using our website, you acknowledge and agree to these terms.",
          "We reserve the right to update or modify these terms at any time without prior notice.",
        ],
      },
      {
        heading: "2. ORDERS & CUSTOMIZATION",
        bullets: [
          "Customers must provide accurate details for custom designs (text, images, colors, etc.).",
          "We reserve the right to reject designs that include offensive, illegal, or copyrighted content.",
          "Once an order is confirmed, modifications may not be possible if production has started.",
        ],
      },
      {
        heading: "3. PRICING",
        bullets: [
          "Prices listed on 3DCaseMakers are subject to change without prior notice.",
          "Discounts and offers may be available for a limited time and cannot be combined unless specified.",
        ],
      },
      {
        heading: "4. SHIPPING & DELIVERY",
        bullets: [
          "For shipments within Tamil Nadu and Puducherry, we offer free shipping via ST Courier.",
          "For deliveries to other states, orders are shipped via Post Office (India Post), and a courier charge of ₹50 applies.",
          "We are not responsible for delays caused by shipping carriers or incorrect address details provided by the customer.",
          "If a package is lost in transit, we will assist in resolving the issue with the courier service.",
        ],
      },
      {
        heading: "5. RETURNS & REPLACEMENTS",
        bullets: [
          "Since our products are customized, we do not accept returns or exchanges unless there is a defect or a mistake in the order.",
          "If you receive a defective or incorrect product, contact us within 48 hours of delivery with images for verification.",
          "Refunds or replacements will be issued at our discretion after reviewing the claim.",
        ],
      },
      {
        heading: "6. INTELLECTUAL PROPERTY",
        bullets: [
          "Designs created by 3DCaseMakers remain our property and may not be reproduced without permission.",
          "Customers must have legal rights to use any images, logos, or text submitted for customization.",
        ],
      },
      {
        heading: "7. PRODUCT DISCLAIMER",
        bullets: [
          "Our phone cases are designed to offer protection, but we do not guarantee complete prevention of damage to your device.",
          "We are not liable for any indirect or accidental damages resulting from the use of our products.",
        ],
      },
      {
        heading: "8. PRIVACY & DATA PROTECTION",
        paragraphs: ["We value your privacy and only collect personal information necessary to fulfill your order. See our Privacy Policy for more details."],
      },
      CONTACT_SECTION,
    ],
  },
  returns: {
    title: "Cancellations and Refunds",
    short: "When you're eligible for a refund or replacement",
    icon: RotateCcw,
    sections: [
      {
        paragraphs: [
          "We at 3DCaseMakers value your satisfaction. If your purchase doesn't meet your expectations, don't worry — we're here to help! Check out our policy below for details on returns, refunds, and exchanges.",
        ],
      },
      {
        note: { tone: "danger", text: "Customized products cannot be canceled once the order is placed and production has started." },
      },
      {
        heading: "RETURNS AND REFUNDS ARE NOT APPLICABLE FOR THE BELOW REASONS",
        paragraphs: [
          "When placing an order, you will be required to confirm specific details such as the item's size, design, model, and spelling. Providing incorrect information will not qualify for an exchange or refund. Therefore, we do not accept returns or exchanges due to incorrect item selection, size, or model.",
        ],
        note: {
          tone: "info",
          text: "[NO] Minor color differences\n[NO] Low-quality uploaded images\n[NO] Slight print alignment variations\n[NO] Incorrect model selected by customer",
        },
      },
      {
        heading: "REFUNDS ARE APPLICABLE FOR THE BELOW REASONS",
        note: {
          tone: "success",
          text: "[YES] Wrong product received\n[YES] Damaged product received\n[YES] Your mobile model or product is not available — refund processed in 2–5 working days",
        },
      },
      {
        heading: "DAMAGED PRODUCTS",
        paragraphs: ["If you receive a damaged, defective, or incorrect product, contact us within 48 hours with photos and an unboxing video."],
      },
      {
        note: { tone: "warning", text: "WARNING: Unboxing video is mandatory for all damage claims." },
      },
      CONTACT_SECTION,
    ],
  },
};

const TONE_STYLES: Record<string, { box: string; icon: typeof Info; iconClass: string }> = {
  info: { box: "bg-blue-50 border-blue-100", icon: Info, iconClass: "text-blue-500" },
  success: { box: "bg-emerald-50 border-emerald-100", icon: CheckCircle2, iconClass: "text-emerald-500" },
  danger: { box: "bg-red-50 border-red-100", icon: ShieldAlert, iconClass: "text-red-500" },
  warning: { box: "bg-blue-50 border-blue-100", icon: AlertTriangle, iconClass: "text-blue-500" },
};

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

// Notes like "[YES] Wrong product received\n[NO] Minor color differences" get
// rendered as a proper check/cross list instead of one dense paragraph.
function parseChecklist(text: string) {
  const lines = text.split("\n").filter(Boolean);
  if (lines.length === 0 || !lines.every((l) => /^\[(YES|NO)\]/.test(l.trim()))) return null;
  return lines.map((l) => {
    const ok = l.trim().startsWith("[YES]");
    return { ok, text: l.trim().replace(/^\[(YES|NO)\]\s*/, "") };
  });
}

function NoteBlock({ note }: { note: NonNullable<Section["note"]> }) {
  const checklist = parseChecklist(note.text);
  const style = TONE_STYLES[note.tone] || TONE_STYLES.info;
  const ToneIcon = style.icon;

  if (checklist) {
    return (
      <div className={`rounded-xl border ${style.box} p-4 space-y-2`}>
        {checklist.map((item, i) => (
          <div key={i} className="flex items-start gap-2.5 text-sm">
            {item.ok ? (
              <CheckCircle2 size={16} className="text-emerald-500 mt-0.5 shrink-0" />
            ) : (
              <XCircle size={16} className="text-red-400 mt-0.5 shrink-0" />
            )}
            <span className="text-zinc-700 font-medium">{item.text}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={`rounded-xl border ${style.box} p-4 flex items-start gap-3`}>
      <ToneIcon size={17} className={`${style.iconClass} mt-0.5 shrink-0`} />
      <p className="text-sm text-zinc-700 font-semibold leading-relaxed whitespace-pre-line">{note.text}</p>
    </div>
  );
}

export default function PolicyPage() {
  const { slug } = useParams();
  const policy = POLICIES[slug || ""];
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const navItems = useMemo(
    () => Object.entries(POLICIES).map(([key, p]) => ({ key, title: p.title, icon: p.icon })),
    []
  );

  const toc = useMemo(
    () => (policy ? policy.sections.filter((s) => s.heading && s.heading !== "CONTACT US").map((s) => ({ heading: s.heading!, id: slugify(s.heading!) })) : []),
    [policy]
  );

  if (!policy) {
    return (
      <div className="max-w-3xl mx-auto px-6 sm:px-10 lg:px-20 py-16 text-center">
        <h1 className="text-2xl font-bold text-zinc-900 mb-2">Policy not found</h1>
        <p className="text-zinc-500">Content coming soon.</p>
        <Link to="/" className="inline-block mt-6 text-sm font-bold text-[var(--brand-primary)] hover:underline">
          Back to home
        </Link>
      </div>
    );
  }

  const Icon = policy.icon;

  return (
    <div className="max-w-[1400px] mx-auto px-6 sm:px-10 lg:px-20 py-10 sm:py-14">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs text-zinc-400 font-medium mb-8">
        <Link to="/" className="hover:text-zinc-600">Home</Link>
        <ChevronRight size={12} />
        <span className="text-zinc-600">{policy.title}</span>
      </div>

      {/* Mobile policy switcher */}
      <div className="lg:hidden mb-6 relative">
        <button
          onClick={() => setMobileNavOpen((v) => !v)}
          className="w-full flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3.5"
        >
          <span className="flex items-center gap-2.5 text-sm font-bold text-zinc-900">
            <Icon size={16} className="text-[var(--brand-primary)]" /> {policy.title}
          </span>
          <ChevronRight size={16} className={`text-zinc-400 transition-transform ${mobileNavOpen ? "rotate-90" : ""}`} />
        </button>
        {mobileNavOpen && (
          <div className="absolute z-20 left-0 right-0 mt-1.5 rounded-2xl border border-zinc-200 bg-white shadow-lg overflow-hidden">
            {navItems.map((item) => {
              const ItemIcon = item.icon;
              const active = item.key === slug;
              return (
                <Link
                  key={item.key}
                  to={`/policy/${item.key}`}
                  onClick={() => setMobileNavOpen(false)}
                  className={`flex items-center gap-2.5 px-4 py-3 text-sm font-semibold border-b border-zinc-100 last:border-0 ${
                    active ? "bg-zinc-50 text-zinc-900" : "text-zinc-500"
                  }`}
                >
                  <ItemIcon size={15} className={active ? "text-[var(--brand-primary)]" : "text-zinc-400"} />
                  {item.title}
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <div className="lg:grid lg:grid-cols-[220px_1fr] lg:gap-12">
        {/* Sidebar — desktop only */}
        <aside className="hidden lg:block">
          <div className="sticky top-28 space-y-6">
            <nav className="space-y-1">
              {navItems.map((item) => {
                const ItemIcon = item.icon;
                const active = item.key === slug;
                return (
                  <Link
                    key={item.key}
                    to={`/policy/${item.key}`}
                    className={`flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-colors ${
                      active ? "bg-zinc-900 text-white" : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                    }`}
                  >
                    <ItemIcon size={15} className={active ? "text-white" : "text-zinc-400"} />
                    {item.title}
                  </Link>
                );
              })}
            </nav>

            {toc.length > 1 && (
              <div className="pt-4 border-t border-zinc-200">
                <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 px-3.5 mb-2">On this page</p>
                <nav className="space-y-0.5">
                  {toc.map((t) => (
                    <a
                      key={t.id}
                      href={`#${t.id}`}
                      className="block rounded-lg px-3.5 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-900 hover:bg-zinc-50 truncate"
                    >
                      {t.heading}
                    </a>
                  ))}
                </nav>
              </div>
            )}
          </div>
        </aside>

        {/* Main content */}
        <div className="min-w-0">
          <div className="flex items-start gap-4 mb-8">
            <div className="w-11 h-11 rounded-2xl bg-[var(--brand-primary-soft)] flex items-center justify-center shrink-0">
              <Icon size={20} className="text-[var(--brand-primary)]" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-zinc-900 tracking-tight">{policy.title}</h1>
              <p className="text-sm text-zinc-450 mt-1">{policy.short}</p>
              <p className="text-[11px] text-zinc-400 font-medium mt-1.5">Last updated: {LAST_UPDATED}</p>
            </div>
          </div>

          <div className="space-y-10">
            {policy.sections.map((section, i) => {
              if (section.heading === "CONTACT US") {
                return (
                  <div key={i} className="rounded-2xl border border-zinc-200 bg-zinc-50/60 p-6">
                    <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-900 mb-4">Still have questions?</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <a href={`mailto:${CONTACT_EMAIL}`} className="flex items-center gap-2.5 text-sm text-zinc-600 hover:text-zinc-900">
                        <Mail size={15} className="text-zinc-400 shrink-0" /> {CONTACT_EMAIL}
                      </a>
                      <a href={`https://wa.me/916369418105`} className="flex items-center gap-2.5 text-sm text-zinc-600 hover:text-zinc-900">
                        <Phone size={15} className="text-zinc-400 shrink-0" /> {CONTACT_WHATSAPP}
                      </a>
                      <div className="flex items-center gap-2.5 text-sm text-zinc-600">
                        <MapPin size={15} className="text-zinc-400 shrink-0" /> Avinashi, Tamil Nadu, India - 641654
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div key={i} id={section.heading ? slugify(section.heading) : undefined} className="scroll-mt-28 space-y-3">
                  {section.heading && (
                    <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-900">{section.heading}</h2>
                  )}
                  {section.paragraphs?.map((p, j) => (
                    <p key={j} className="text-[15px] text-zinc-500 leading-relaxed">
                      {p}
                    </p>
                  ))}
                  {section.bullets && (
                    <ul className="space-y-2">
                      {section.bullets.map((b, j) => (
                        <li key={j} className="flex items-start gap-2.5 text-[15px] text-zinc-500 leading-relaxed">
                          <span className="w-1.5 h-1.5 rounded-full bg-zinc-300 mt-2 shrink-0" />
                          {b}
                        </li>
                      ))}
                    </ul>
                  )}
                  {section.note && <NoteBlock note={section.note} />}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

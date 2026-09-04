import { useEffect, useState } from "react";
import { Link } from "react-router";
import { ShieldCheck, Truck, ChevronDown } from "lucide-react";
import { api } from "../utils/api";
import { Collection } from "../types";
import BrandLogo from "./BrandLogo";
import facebookIcon from "../assets/social-icons/facebook.svg";
import instagramIcon from "../assets/social-icons/instagram.svg";
import youtubeIcon from "../assets/social-icons/youtube.svg";

export default function Footer({ collections = [] }: { collections?: Collection[] }) {
  const [settings, setSettings] = useState<any>({});
  const [openSection, setOpenSection] = useState<string | null>(null);

  useEffect(() => {
    api.get("/api/settings").then(setSettings).catch(() => {});
  }, []);

  const toggleSection = (key: string) =>
    setOpenSection((prev) => (prev === key ? null : key));

  const sections: { key: string; title: string; content: React.ReactNode }[] = [
    {
      key: "company",
      title: "Company",
      content: (
        <ul className="space-y-3 text-sm text-zinc-500 font-semibold">
          <li><Link to="/about-us" className="hover:text-[var(--brand-primary)]">About Us</Link></li>
          <li><Link to="/policy/terms" className="hover:text-[var(--brand-primary)]">Terms &amp; Conditions</Link></li>
          <li><Link to="/policy/privacy" className="hover:text-[var(--brand-primary)]">Privacy Policy</Link></li>
          <li><Link to="/policy/shipping" className="hover:text-[var(--brand-primary)]">Shipping Policy</Link></li>
        </ul>
      ),
    },
    {
      key: "support",
      title: "Support",
      content: (
        <ul className="space-y-3 text-sm text-zinc-500 font-semibold">
          <li><Link to="/contact" className="hover:text-[var(--brand-primary)]">Contact Us</Link></li>
          <li><Link to="/track-order" className="hover:text-[var(--brand-primary)]">Track Order</Link></li>
          <li><Link to="/policy/returns" className="hover:text-[var(--brand-primary)]">Cancellations &amp; Refunds</Link></li>
          <li><Link to="/faqs" className="hover:text-[var(--brand-primary)]">FAQ's</Link></li>
        </ul>
      ),
    },
  ];

  return (
    <footer className="mt-16 bg-zinc-950 text-zinc-100 font-sans">
      {/* Trust strip */}
      <div className="border-b border-white/10">
        <div className="max-w-[1600px] mx-auto px-6 sm:px-10 lg:px-20 grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-white/10">
          <div className="flex items-center justify-center gap-2.5 py-6 text-xs font-bold uppercase tracking-wider">
            <ShieldCheck className="w-5 h-5 text-white" /> Premium Quality Assured
          </div>
          <div className="flex items-center justify-center gap-2.5 py-6 text-xs font-bold uppercase tracking-wider">
            <Truck className="w-5 h-5 text-white" /> Free and Fast Delivery
          </div>
        </div>
      </div>

      {/* Follow us */}
      <div className="max-w-[1600px] mx-auto px-6 sm:px-10 lg:px-20 py-12 border-b border-white/10">
        <div className="text-center">
          <h4 className="text-sm font-black uppercase tracking-widest mb-5">Follow Us</h4>
          <div className="flex flex-wrap items-center justify-center gap-6">
            <a href={settings?.facebookUrl || "https://facebook.com/share/1HTPDgV2T1/"} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-1.5 text-zinc-300 hover:text-white">
              <span className="w-11 h-11 rounded-full bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden"><img src={facebookIcon} alt="Facebook" className="w-6 h-6" /></span>
              <span className="text-[11px] font-semibold">Facebook</span>
            </a>
            <a href={settings?.instagramUrl || "https://www.instagram.com/3d_case_maker/"} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-1.5 text-zinc-300 hover:text-white">
              <span className="w-11 h-11 rounded-full bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden"><img src={instagramIcon} alt="Instagram" className="w-6 h-6 rounded-md" /></span>
              <span className="text-[11px] font-semibold">Instagram</span>
            </a>
            <a href={settings?.youtubeUrl || "https://www.youtube.com/@3Dcasemakers"} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-1.5 text-zinc-300 hover:text-white">
              <span className="w-11 h-11 rounded-full bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden"><img src={youtubeIcon} alt="YouTube" className="w-6 h-6" /></span>
              <span className="text-[11px] font-semibold">YouTube</span>
            </a>
          </div>
        </div>
      </div>

      {/* Cash on Delivery */}
      <div className="max-w-[1600px] mx-auto px-6 sm:px-10 lg:px-20 py-10 border-b border-white/10 text-center">
        <h4 className="text-sm font-black uppercase tracking-widest mb-2">Cash on Delivery</h4>
        <p className="text-xs text-zinc-400">Pay in cash when your order arrives at your doorstep.</p>
      </div>

      {/* Link columns */}
      <div className="bg-white text-zinc-800 rounded-t-3xl mt-2">
        {/* Mobile: accordion */}
        <div className="sm:hidden px-6 divide-y divide-zinc-100">
          {sections.map((s) => {
            const isOpen = openSection === s.key;
            return (
              <div key={s.key}>
                <button
                  type="button"
                  onClick={() => toggleSection(s.key)}
                  aria-expanded={isOpen}
                  className="w-full flex items-center justify-between py-5 text-left"
                >
                  <span className="text-sm font-black uppercase tracking-wide">{s.title}</span>
                  <ChevronDown
                    className={`w-4 h-4 shrink-0 text-zinc-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                  />
                </button>
                <div
                  className={`overflow-hidden transition-all duration-200 ${isOpen ? "max-h-60 pb-5" : "max-h-0"}`}
                >
                  {s.content}
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop: full grid */}
        <div className="hidden sm:grid max-w-[1600px] mx-auto px-10 lg:px-20 py-12 grid-cols-2 gap-8">
          {sections.map((s) => (
            <div key={s.key}>
              <h5 className="text-sm font-black uppercase tracking-wide mb-4">{s.title}</h5>
              {s.content}
            </div>
          ))}
        </div>

        <div className="border-t border-zinc-100 py-5 text-center">
          <Link to="/" className="inline-flex mb-2" aria-label="3DCaseMakers">
            <BrandLogo markClassName="h-6 w-6" textClassName="text-sm" gap="gap-1" />
          </Link>
          <p className="text-xs text-zinc-400">
            Copyright © {new Date().getFullYear()}. All rights reserved by{" "}
            <a href="https://www.3dcasemakers.com" className="hover:text-[var(--brand-primary)]">
              www.3dcasemakers.com
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}

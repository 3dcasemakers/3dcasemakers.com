import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "react-router";
import {
  Info,
  Wand2,
  ShoppingCart,
  CreditCard,
  Truck,
  RotateCcw,
  Tag,
  ChevronDown,
  ChevronRight,
  Search,
} from "lucide-react";
import { api } from "../utils/api";
import { setSEO, setJSONLD } from "../utils/useSEO";

interface FAQ {
  id: string;
  question: string;
  answer: string;
  category: string;
}

const CATEGORY_ICONS: Record<string, any> = {
  "About 3DCaseMakers": Info,
  "Product Customization": Wand2,
  "How to Place Order?": ShoppingCart,
  "Payment and Security": CreditCard,
  "Shipping and Delivery": Truck,
  "Cancellation and Returns": RotateCcw,
  "Coupons and Offers": Tag,
};

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export default function FAQPage() {
  const { category: categorySlug } = useParams();
  const navigate = useNavigate();
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    api.get("/api/faqs").then(setFaqs).catch(() => {});
  }, []);

  useEffect(() => {
    setSEO({
      title: "FAQs | 3DCaseMakers",
      description: "Answers to common questions about ordering, customizing, and shipping 3DCaseMakers phone cases.",
      url: "/faqs",
    });
  }, []);

  useEffect(() => {
    if (faqs.length) {
      setJSONLD("faqpage", {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqs.slice(0, 30).map((f) => ({
          "@type": "Question",
          name: f.question,
          acceptedAnswer: { "@type": "Answer", text: f.answer },
        })),
      });
    }
  }, [faqs]);

  const categories = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of faqs) map.set(f.category, (map.get(f.category) || 0) + 1);
    return Array.from(map.entries()).map(([name, count]) => ({ name, count, slug: slugify(name) }));
  }, [faqs]);

  const activeCategory = categories.find((c) => c.slug === categorySlug);

  const searchResults = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.trim().toLowerCase();
    return faqs.filter((f) => f.question.toLowerCase().includes(q) || f.answer.toLowerCase().includes(q));
  }, [query, faqs]);

  const categoryFaqs = activeCategory ? faqs.filter((f) => f.category === activeCategory.name) : [];

  return (
    <div className="max-w-5xl mx-auto px-6 sm:px-10 lg:px-20 py-12">
      <div className="text-center mb-8">
        <h1 className="text-3xl sm:text-4xl font-black text-zinc-900 tracking-wide uppercase">FAQ's</h1>
        <p className="text-zinc-400 text-sm mt-1">( Frequently Asked Questions )</p>
      </div>

      {query.trim() ? (
        <div className="max-w-3xl mx-auto space-y-2">
          <p className="text-xs text-zinc-400 font-bold uppercase tracking-wide mb-2">
            {searchResults.length} result{searchResults.length === 1 ? "" : "s"}
          </p>
          {searchResults.map((f) => (
            <FAQItem key={f.id} faq={f} open={openId === f.id} onToggle={() => setOpenId(openId === f.id ? null : f.id)} />
          ))}
          {searchResults.length === 0 && <p className="text-zinc-400 text-sm text-center py-10">No matching questions found.</p>}
        </div>
      ) : !activeCategory ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {categories.map((c) => {
            const Icon = CATEGORY_ICONS[c.name] || Info;
            return (
              <Link
                key={c.name}
                to={`/faqs/${c.slug}`}
                className="flex items-center gap-4 glass-card rounded-2xl px-5 py-6 hover:shadow-md transition-shadow"
              >
                <Icon className="w-7 h-7 text-zinc-700 shrink-0" />
                <span className="font-bold text-zinc-900 text-sm">{c.name} <span className="text-zinc-400 font-medium">({c.count})</span></span>
              </Link>
            );
          })}
          {categories.length === 0 && <p className="text-zinc-400 text-sm text-center py-10 col-span-full">FAQs coming soon.</p>}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-3">
            <button onClick={() => navigate("/faqs")} className="text-xs font-bold text-[#3b93f0] mb-3 hover:underline">
              &larr; FAQ / {activeCategory.name}
            </button>
            <div className="glass-card rounded-2xl p-6">
              <h2 className="text-xl font-black text-zinc-900 mb-4 pb-4 border-b border-zinc-100">{activeCategory.name}</h2>
              <div className="divide-y divide-zinc-100">
                {categoryFaqs.map((f) => (
                  <FAQItem key={f.id} faq={f} open={openId === f.id} onToggle={() => setOpenId(openId === f.id ? null : f.id)} bare />
                ))}
              </div>
            </div>
          </div>
          <div className="lg:col-span-1">
            <h3 className="text-sm font-black text-zinc-900 uppercase tracking-wide mb-3 text-center lg:text-left">More FAQ's</h3>
            <div className="space-y-1">
              {categories.map((c) => (
                <Link
                  key={c.name}
                  to={`/faqs/${c.slug}`}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm font-semibold ${c.slug === categorySlug ? "text-[#3b93f0]" : "text-zinc-600 hover:text-[#3b93f0]"}`}
                >
                  {c.name} <ChevronRight className="w-4 h-4" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FAQItem({ faq, open, onToggle, bare = false }: { faq: FAQ; open: boolean; onToggle: () => void; bare?: boolean }) {
  return (
    <div className={bare ? "py-4" : "glass-card rounded-2xl overflow-hidden"}>
      <button onClick={onToggle} className="w-full flex items-center justify-between text-left gap-3">
        <span className="font-bold text-zinc-900 text-sm">{faq.question}</span>
        <ChevronDown size={18} className={`shrink-0 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <p className="mt-3 text-sm text-zinc-500 leading-relaxed">{faq.answer}</p>}
    </div>
  );
}

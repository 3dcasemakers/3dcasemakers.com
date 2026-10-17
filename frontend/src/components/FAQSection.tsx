import { useEffect, useState } from "react";
import { Link } from "react-router";
import { ChevronDown } from "lucide-react";
import { api } from "../utils/api";

interface FAQ {
  id: string;
  question: string;
  answer: string;
}

// Feature 7: accordion FAQ, driven by /api/faqs
export default function FAQSection() {
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    api.get("/api/faqs").then(setFaqs).catch(() => {});
  }, []);

  if (!faqs.length) return null;

  return (
    <section id="faq" className="max-w-3xl mx-auto px-6 sm:px-10 lg:px-20 py-14">
      <h2 className="text-xl font-black text-zinc-900 mb-6 text-center uppercase tracking-wide">FREQUENTLY ASKED QUESTIONS</h2>
      <div className="space-y-2">
        {faqs.slice(0, 6).map((f) => {
          const open = openId === f.id;
          return (
            <div key={f.id} className="glass rounded-2xl overflow-hidden">
              <button
                onClick={() => setOpenId(open ? null : f.id)}
                className="w-full flex items-center justify-between px-4 py-3 text-left font-semibold text-zinc-900"
              >
                {f.question}
                <ChevronDown size={18} className={`transition-transform ${open ? "rotate-180" : ""}`} />
              </button>
              {open && <div className="px-4 pb-4 text-zinc-600 text-sm leading-relaxed">{f.answer}</div>}
            </div>
          );
        })}
      </div>
      <div className="mt-6 text-center">
        <Link to="/faqs" className="text-sm font-bold text-[var(--brand-primary)] hover:text-[var(--brand-primary-hover)]">View all FAQs &rarr;</Link>
      </div>
    </section>
  );
}

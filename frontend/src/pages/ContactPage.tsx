import { useEffect, useState } from "react";
import { api } from "../utils/api";
import { setSEO } from "../utils/useSEO";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";

export default function ContactPage() {
  const [settings, setSettings] = useState<any>({});
  const [form, setForm] = useState({ name: "", email: "", phone: "", message: "" });
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/api/settings").then(setSettings).catch(() => {});
  }, []);

  useEffect(() => {
    setSEO({
      title: "Contact Us | 3DCaseMakers",
      description: "Get in touch with 3DCaseMakers support for order, shipping, or custom design questions.",
      url: "/contact",
    });
  }, []);

  const update = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.name.trim() || !form.email.trim() || !form.phone.trim() || !form.message.trim()) {
      setError("Please fill in every field.");
      return;
    }
    setStatus("submitting");
    try {
      await api.post("/api/contact", form);
      setStatus("success");
      setForm({ name: "", email: "", phone: "", message: "" });
    } catch (err: any) {
      setStatus("error");
      setError(err?.message || "Something went wrong — please try again.");
    }
  };

  return (
    <div className="max-w-[1600px] mx-auto px-6 sm:px-10 lg:px-20 py-12 sm:py-16">
      <section id="contact" className="scroll-mt-20">
        <div className="text-center mb-12">
          <h1 className="text-2xl md:text-3xl tracking-tight font-black text-zinc-900 uppercase">
            {settings?.contactTitle || "Get In Touch With Support"}
          </h1>
          <p className="text-sm text-zinc-450 mt-2 max-w-md mx-auto">
            {settings?.contactSubtitle || "Have questions about your order, shipping, or a custom design? We're here to help."}
          </p>
        </div>
        <div className="max-w-xl mx-auto divide-y divide-zinc-200 border-y border-zinc-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-6 py-6">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Email Address</h3>
            <a href={`mailto:${settings?.contactEmail || "3dcasemakers@gmail.com"}`} className="text-sm font-black text-zinc-900 hover:underline sm:text-right">
              {settings?.contactEmail || "3dcasemakers@gmail.com"}
            </a>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-6 py-6">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Call / Message</h3>
            <div className="sm:text-right">
              <p className="text-sm font-black text-zinc-900">{settings?.contactPhone || "+91 63694 18105"}</p>
              <p className="text-[11px] text-zinc-400 font-medium mt-0.5">{settings?.contactHours || "Available 10 AM – 5 PM"}</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-6 py-6">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Location</h3>
            <p className="text-sm font-black text-zinc-900 sm:text-right">{settings?.contactAddress || "Avinashi, Tamil Nadu, India - 641654"}</p>
          </div>
        </div>

        {/* ---- Report an Issue ---- */}
        <div className="max-w-xl mx-auto mt-16">
          <div className="text-center mb-8">
            <h2 className="text-xl md:text-2xl tracking-tight font-black text-zinc-900 uppercase">Report an Issue</h2>
            <p className="text-sm text-zinc-450 mt-2">Tell us what happened — our team will get back to you by email.</p>
          </div>

          {status === "success" ? (
            <div className="glass-card rounded-2xl p-8 text-center flex flex-col items-center gap-3">
              <CheckCircle2 size={40} className="text-emerald-500" />
              <h3 className="text-base font-bold text-zinc-900">Thanks — we've got it!</h3>
              <p className="text-sm text-zinc-500">Your issue has been submitted. We'll reply to your email as soon as we can.</p>
              <button
                type="button"
                onClick={() => setStatus("idle")}
                className="glass-btn-light mt-2 px-5 py-2 text-sm font-semibold"
              >
                Report another issue
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="glass-card rounded-2xl p-6 sm:p-8 space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1.5">Name</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={update("name")}
                    placeholder="Your full name"
                    className="glass-input w-full rounded-xl px-3.5 py-2.5 text-sm text-zinc-900 placeholder-zinc-400"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1.5">Contact Number</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={update("phone")}
                    placeholder="+91 XXXXX XXXXX"
                    className="glass-input w-full rounded-xl px-3.5 py-2.5 text-sm text-zinc-900 placeholder-zinc-400"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1.5">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={update("email")}
                  placeholder="you@example.com"
                  className="glass-input w-full rounded-xl px-3.5 py-2.5 text-sm text-zinc-900 placeholder-zinc-400"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1.5">Describe the Issue</label>
                <textarea
                  value={form.message}
                  onChange={update("message")}
                  placeholder="Tell us what went wrong — order number, product, or anything that helps us understand the issue."
                  rows={5}
                  className="glass-input w-full rounded-xl px-3.5 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 resize-none"
                  required
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5">
                  <AlertCircle size={16} className="shrink-0" />
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={status === "submitting"}
                className="glass-btn-primary w-full py-3 text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {status === "submitting" && <Loader2 size={16} className="animate-spin" />}
                {status === "submitting" ? "Submitting..." : "Submit Issue"}
              </button>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}

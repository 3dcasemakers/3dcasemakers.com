import { useEffect, useState } from "react";
import { api } from "../utils/api";
import { trackLead } from "../utils/metaPixel";

// Feature 8: newsletter signup section
export default function Newsletter() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const [settings, setSettings] = useState<any>({});

  useEffect(() => {
    api.get("/api/settings").then(setSettings).catch(() => {});
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    setError("");
    try {
      await api.post("/api/newsletter", { email });
      trackLead({ source: "newsletter" });
      setStatus("done");
      setEmail("");
    } catch (err: any) {
      setStatus("error");
      setError(err.message || "Something went wrong");
    }
  };

  return (
    <section className="glass-dark text-white py-14 px-4 mt-16 rounded-3xl mx-4 md:mx-8">
      <div className="max-w-lg mx-auto text-center">
        <h2 className="text-xl font-black mb-2">{settings?.newsletterTitle || "Get 10% off your first order"}</h2>
        <p className="text-zinc-400 text-sm mb-6">{settings?.newsletterSubtitle || "Join our list for drops, offers & new designs."}</p>
        {status === "done" ? (
          <p className="text-green-400 font-semibold">You're subscribed! Check your inbox soon 🎉</p>
        ) : (
          <form onSubmit={submit} className="flex gap-2">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              className="flex-1 rounded-full px-4 py-3 text-zinc-900 outline-none bg-white border border-white/40"
            />
            <button
              disabled={status === "loading"}
              className="glass-pill text-zinc-900 font-bold px-6 py-3 rounded-full disabled:opacity-60"
            >
              {status === "loading" ? "..." : "Join"}
            </button>
          </form>
        )}
        {status === "error" && <p className="text-red-400 text-sm mt-2">{error}</p>}
      </div>
    </section>
  );
}

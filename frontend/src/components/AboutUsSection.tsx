// Shared "brand story" block — same content/settings keys as the About Us
// page (aboutSectionTitle, etc, edited from Admin -> Website Content), so it
// can be dropped into other pages (e.g. Cart) without duplicating copy.
export default function AboutUsSection({ settings }: { settings: any }) {
  return (
    <section className="scroll-mt-20">
      <div className="max-w-2xl mx-auto text-center">
        <h2 className="text-2xl md:text-3xl tracking-tight font-black text-zinc-900 uppercase">
          {settings?.aboutSectionTitle || "Custom Phone Cases & Stickers Built To Last"}
        </h2>

        <div className="mt-6 space-y-4">
          <p className="text-sm text-zinc-500 leading-relaxed">
            {settings?.aboutSectionSubtitle ||
              "We're based in Avinashi, Tamil Nadu, and we specialise in customized acrylic and gold phone cases — crafted with premium materials, sharp printing, and long-lasting shine."}
          </p>
          <p className="text-sm text-zinc-500 leading-relaxed">
            {settings?.aboutSectionDesc1 ||
              "With over 8 years of experience in customized acrylic and gold cases, we've built our craft around durability, precision, and giving every customer a case that truly stands out."}
          </p>
          {settings?.aboutSectionDesc2 && <p className="text-sm text-zinc-500 leading-relaxed">{settings.aboutSectionDesc2}</p>}
        </div>

        {(settings?.instagramFollowers || settings?.youtubeSubscribers) && (
          <div className="flex items-center justify-center divide-x divide-zinc-200 mt-10 pt-8 border-t border-zinc-200">
            {settings?.instagramFollowers && (
              <div className="px-8 first:pl-0 last:pr-0">
                <p className="text-2xl font-black text-zinc-900">{settings.instagramFollowers}</p>
                <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-400 mt-1">Instagram Followers</p>
              </div>
            )}
            {settings?.youtubeSubscribers && (
              <div className="px-8 first:pl-0 last:pr-0">
                <p className="text-2xl font-black text-zinc-900">{settings.youtubeSubscribers}</p>
                <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-400 mt-1">YouTube Subscribers</p>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

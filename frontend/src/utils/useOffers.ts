import { useEffect, useState } from "react";
import { api } from "./api";

export interface Offer {
  id: string;
  label: string;       // internal name, shown in admin list
  badgeText: string;    // shown on the storefront badge/popup
  minQty: number;       // total cart quantity needed to qualify
  discountAmount: number; // flat rupees off
  enabled: boolean;
  endsAt: string | null;  // ISO string; null = no countdown, always on while enabled
}

function twoDaysFromNow(): string {
  return new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
}

// Seeded the first time a store has no offers configured yet. None are
// enabled by default (per Hari: keep the offer bar off until an admin
// explicitly turns one on from Admin -> Discounts -> Offers).
export function defaultOffers(): Offer[] {
  return [
    {
      id: "buy2get100",
      label: "Buy 2 & Get \u20b9100 OFF",
      badgeText: "Buy 2 & Get \u20b9100 OFF",
      minQty: 2,
      discountAmount: 100,
      enabled: false,
      endsAt: twoDaysFromNow(),
    },
    {
      id: "buy3get150",
      label: "Buy 3 & Get \u20b9150 OFF",
      badgeText: "Buy 3 & Get \u20b9150 OFF",
      minQty: 3,
      discountAmount: 150,
      enabled: false,
      endsAt: null,
    },
    {
      id: "buy4get250",
      label: "Buy 4 & Get \u20b9250 OFF",
      badgeText: "Buy 4 & Get \u20b9250 OFF",
      minQty: 4,
      discountAmount: 250,
      enabled: false,
      endsAt: null,
    },
  ];
}

export function isOfferLive(o: Offer): boolean {
  if (!o.enabled) return false;
  if (!o.endsAt) return true;
  return new Date(o.endsAt).getTime() > Date.now();
}

// Best (highest discount) enabled, non-expired offer the given cart quantity
// qualifies for. Returns null if nothing applies.
export function getBestOffer(offers: Offer[], qty: number): Offer | null {
  const eligible = offers.filter((o) => isOfferLive(o) && qty >= o.minQty);
  if (!eligible.length) return null;
  return eligible.reduce((best, o) => (o.discountAmount > best.discountAmount ? o : best));
}

// The next live offer the cart hasn't reached yet — used for the "Add N more
// to get ₹Y off" nudge. Picks the closest tier (fewest extra items needed).
export function getNextOffer(offers: Offer[], qty: number): Offer | null {
  const upcoming = offers.filter((o) => isOfferLive(o) && qty < o.minQty);
  if (!upcoming.length) return null;
  return upcoming.reduce((closest, o) => (o.minQty < closest.minQty ? o : closest));
}


export function getPrimaryDisplayOffer(offers: Offer[]): Offer | null {
  const live = offers.filter(isOfferLive);
  if (!live.length) return null;
  return live.find((o) => o.endsAt) || live[0];
}

export function useOffers(): Offer[] {
  const [offers, setOffers] = useState<Offer[]>(defaultOffers());

  useEffect(() => {
    api
      .get("/api/settings")
      .then((s) => {
        if (Array.isArray(s.offers) && s.offers.length) {
          setOffers(s.offers);
        }
      })
      .catch(() => {});
  }, []);

  return offers;
}

export function pad2(n: number) {
  return n.toString().padStart(2, "0");
}

export interface Countdown {
  expired: boolean;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export function useCountdown(endsAt: string | null): Countdown {
  const [target, setTarget] = useState<number>(() => {
    const parsed = endsAt ? new Date(endsAt).getTime() : NaN;
    return Number.isFinite(parsed) ? parsed : Date.now() + 48 * 60 * 60 * 1000;
  });
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const parsed = endsAt ? new Date(endsAt).getTime() : NaN;
    if (Number.isFinite(parsed)) setTarget(parsed);
  }, [endsAt]);

  useEffect(() => {
    if (!endsAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [endsAt]);

  const diff = Math.max(0, target - now);
  const expired = !!endsAt && diff <= 0;
  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return { expired, days, hours, minutes, seconds };
}

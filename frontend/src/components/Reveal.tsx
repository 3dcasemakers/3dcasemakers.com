import { ReactNode } from "react";
import { useScrollReveal } from "../utils/useScrollReveal";

// Wraps any block of content so it fades + slides up into place the first
// time it scrolls into view. Drop this around a section instead of a plain
// <div>/<section> anywhere on the site to get the same smooth scroll-in
// animation Shopify themes use.
export default function Reveal({
  children,
  as: Tag = "div",
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  as?: "div" | "section";
  className?: string;
  delay?: number;
}) {
  const ref = useScrollReveal<HTMLDivElement>();
  return (
    <Tag
      ref={ref as any}
      className={`scroll-reveal ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}

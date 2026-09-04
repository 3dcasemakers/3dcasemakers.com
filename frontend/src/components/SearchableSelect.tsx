import { useEffect, useRef, useState } from "react";
import { ChevronDown, Search, X, Check } from "lucide-react";

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  error?: boolean;
  icon?: React.ReactNode;
}

// A plain, accessible combobox: click to open, type to filter, click/enter to pick.
// Used for Brand + Model selection on the product page so shoppers with long
// brand/model lists (e.g. Apple, Samsung) can search instead of scrolling.
export default function SearchableSelect({
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder = "Search...",
  disabled = false,
  error = false,
  icon,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const filtered = options.filter((o) => o.toLowerCase().includes(query.trim().toLowerCase()));

  const handleSelect = (opt: string) => {
    onChange(opt);
    setOpen(false);
    setQuery("");
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={`w-full bg-white border-[1.5px] rounded-xl pl-3.5 pr-3 py-3 text-xs font-bold text-left flex items-center gap-2.5 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-150 ${
          value ? "text-zinc-900" : "text-zinc-400"
        } ${
          error
            ? "border-red-400 ring-2 ring-red-100"
            : open
            ? "border-[var(--brand-accent,#18181b)] ring-2 ring-[var(--brand-accent-soft,#f4f4f5)]"
            : value
            ? "border-zinc-300 hover:border-zinc-400"
            : "border-zinc-200 hover:border-zinc-300"
        }`}
      >
        {icon && (
          <span className={`shrink-0 ${value ? "text-[var(--brand-accent,#18181b)]" : "text-zinc-400"}`}>{icon}</span>
        )}
        <span className="truncate flex-1">{value || placeholder}</span>
        {value ? (
          <Check className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
        ) : (
          <ChevronDown className={`w-3.5 h-3.5 shrink-0 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`} />
        )}
      </button>

      {open && !disabled && (
        <div className="absolute z-30 mt-1.5 w-full bg-white border border-zinc-200 rounded-xl shadow-xl shadow-zinc-900/10 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-zinc-100 bg-zinc-50/60">
            <Search className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full text-xs font-bold text-zinc-900 outline-none bg-transparent placeholder:text-zinc-400 placeholder:font-medium"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="Clear search">
                <X className="w-3.5 h-3.5 text-zinc-400" />
              </button>
            )}
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.length ? (
              filtered.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => handleSelect(opt)}
                  className={`w-full text-left px-3.5 py-2.5 text-xs font-bold hover:bg-zinc-50 flex items-center justify-between gap-2 ${
                    opt === value ? "bg-zinc-50 text-zinc-900" : "text-zinc-700"
                  }`}
                >
                  <span className="truncate">{opt}</span>
                  {opt === value && <Check className="w-3.5 h-3.5 shrink-0 text-emerald-500" />}
                </button>
              ))
            ) : (
              <div className="px-3.5 py-3 text-xs font-medium text-zinc-400">No matches found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

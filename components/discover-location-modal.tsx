"use client";

import { BodyPortal } from "@/components/body-portal";
import { ParfadeSpinner } from "@/components/parfade-spinner";

export type DiscoverLocationResult = {
  label: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  locationQuery: string;
  onLocationQueryChange: (q: string) => void;
  locationResults: DiscoverLocationResult[];
  showResults: boolean;
  searchLoading: boolean;
  onPickLocation: (item: DiscoverLocationResult) => void;
  onUseCurrentLocation: () => void;
  onSearchFocus?: () => void;
  radiusMiles: number;
  onRadiusSelect: (miles: number) => void;
};

export function DiscoverLocationModal({
  open,
  onClose,
  locationQuery,
  onLocationQueryChange,
  locationResults,
  showResults,
  searchLoading,
  onPickLocation,
  onUseCurrentLocation,
  onSearchFocus,
  radiusMiles,
  onRadiusSelect,
}: Props) {
  if (!open) return null;

  return (
    <BodyPortal>
      <div
        className="fixed inset-0 z-[100] min-h-dvh w-full overscroll-none"
        role="dialog"
        aria-modal="true"
        aria-labelledby="discover-loc-title"
      >
        <button
          type="button"
          className="absolute inset-0 bg-black/40"
          aria-label="Close"
          onClick={onClose}
        />
        <div className="pointer-events-none absolute inset-0 flex items-start justify-center px-4 pt-[max(2rem,8vh)] pb-8">
          <div
            className="pointer-events-auto relative z-10 max-h-[min(85vh,640px)] w-full max-w-sm overflow-y-auto rounded-2xl border border-[#ece8e1] bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
        <h2 id="discover-loc-title" className="text-lg font-bold text-[#1c1c1e]">
          Location & radius
        </h2>

        <button
          type="button"
          onClick={() => void onUseCurrentLocation()}
          className="mt-4 inline-flex items-center gap-2 rounded-[10px] border border-[#ece8e1] bg-[#f3f1ed] px-2.5 py-2 text-sm font-semibold text-[#1a3c2a]"
        >
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75" />
            <path
              d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          Use current location
        </button>

        <div className="relative mt-4">
          <input
            type="text"
            value={locationQuery}
            onChange={(e) => onLocationQueryChange(e.target.value)}
            onFocus={() => onSearchFocus?.()}
            className="parfade-input w-full pr-10"
            placeholder="Search City, State"
            autoComplete="off"
          />
          {searchLoading && locationQuery.trim().length >= 2 ? (
            <span className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center">
              <ParfadeSpinner size="xs" variant="muted" aria-label="Searching locations" />
            </span>
          ) : locationQuery.trim().length > 0 ? (
            <button
              type="button"
              onClick={() => onLocationQueryChange("")}
              className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-[#6e6e6e] hover:bg-[#ece8e1]"
              aria-label="Clear search"
            >
              ×
            </button>
          ) : null}
        </div>

        {showResults && locationResults.length > 0 ? (
          <ul className="mt-2 max-h-48 overflow-auto rounded-xl border border-[#ece8e1] bg-[#faf8f5]">
            {locationResults.map((item) => (
              <li key={item.label} className="border-b border-[#ece8e1] last:border-b-0">
                <button
                  type="button"
                  onClick={() => onPickLocation(item)}
                  className="w-full px-3 py-3 text-left text-sm font-semibold text-[#1c1c1e] transition hover:bg-white"
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-[#6e6e6e]">
          Radius
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {[10, 25, 50, 100].map((miles) => (
            <button
              key={miles}
              type="button"
              onClick={() => onRadiusSelect(miles)}
              className={`rounded-full px-2.5 py-1.5 text-xs font-semibold transition ${
                radiusMiles === miles
                  ? "bg-[#1a3c2a] text-white"
                  : "bg-[#ece8e1] text-[#1c1c1e] hover:bg-[#e2ddd4]"
              }`}
            >
              {miles} mi
            </button>
          ))}
          <button
            type="button"
            onClick={() => onRadiusSelect(9999)}
            className={`rounded-full px-2.5 py-1.5 text-xs font-semibold transition ${
              radiusMiles >= 9999
                ? "bg-[#1a3c2a] text-white"
                : "bg-[#ece8e1] text-[#1c1c1e] hover:bg-[#e2ddd4]"
            }`}
          >
            Any
          </button>
        </div>
          </div>
        </div>
      </div>
    </BodyPortal>
  );
}

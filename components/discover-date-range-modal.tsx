"use client";

import { useEffect, useState } from "react";
import { BodyPortal } from "@/components/body-portal";

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

type Props = {
  open: boolean;
  onClose: () => void;
  startDate: Date | null;
  endDate: Date | null;
  onApply: (nextStart: Date | null, nextEnd: Date | null) => void;
};

export function DiscoverDateRangeModal({
  open,
  onClose,
  startDate,
  endDate,
  onApply,
}: Props) {
  const [draftStartDate, setDraftStartDate] = useState<Date | null>(null);
  const [draftEndDate, setDraftEndDate] = useState<Date | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  useEffect(() => {
    if (!open) return;
    setDraftStartDate(startDate);
    setDraftEndDate(endDate);
    const anchor = startDate ?? endDate ?? new Date();
    setCalendarMonth(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
  }, [open, startDate, endDate]);

  function isInSelectedRange(day: Date) {
    if (!draftStartDate || !draftEndDate) return false;
    const d = startOfDay(day).getTime();
    return (
      d >= startOfDay(draftStartDate).getTime() && d <= startOfDay(draftEndDate).getTime()
    );
  }

  function applyRange(nextStart: Date | null, nextEnd: Date | null) {
    onApply(nextStart, nextEnd);
    onClose();
  }

  function onSelectDay(day: Date) {
    const picked = startOfDay(day);
    if (!draftStartDate || (draftStartDate && draftEndDate)) {
      setDraftStartDate(picked);
      setDraftEndDate(null);
      return;
    }
    const draftStart = startOfDay(draftStartDate);
    if (picked.getTime() === draftStart.getTime()) {
      applyRange(draftStart, draftStart);
      return;
    }
    if (picked.getTime() < draftStart.getTime()) {
      setDraftStartDate(picked);
      setDraftEndDate(null);
      return;
    }
    setDraftEndDate(picked);
    applyRange(draftStart, picked);
  }

  function applyDraftRange() {
    if (!draftStartDate) return;
    applyRange(draftStartDate, draftEndDate ?? draftStartDate);
  }

  function cancel() {
    onClose();
  }

  function shiftMonth(delta: number) {
    setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  }

  if (!open) return null;

  const monthLabel = calendarMonth.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  const firstWeekday = new Date(
    calendarMonth.getFullYear(),
    calendarMonth.getMonth(),
    1,
  ).getDay();
  const daysInMonth = new Date(
    calendarMonth.getFullYear(),
    calendarMonth.getMonth() + 1,
    0,
  ).getDate();
  const dayCells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }).map(() => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (dayCells.length % 7 !== 0) dayCells.push(null);

  const todayStart = startOfDay(new Date());

  return (
    <BodyPortal>
      <div
        className="fixed inset-0 z-[100] min-h-dvh w-full overscroll-none"
        role="dialog"
        aria-modal="true"
        aria-labelledby="discover-range-title"
      >
        <button
          type="button"
          className="absolute inset-0 bg-black/40"
          aria-label="Close"
          onClick={cancel}
        />
        <div className="pointer-events-none absolute inset-0 flex items-start justify-center px-4 pt-[max(2rem,8vh)] pb-8">
          <div
            className="pointer-events-auto relative z-10 w-full max-w-sm rounded-2xl border border-[#ece8e1] bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
        <h2 id="discover-range-title" className="text-lg font-bold text-[#1c1c1e]">
          Date range
        </h2>

        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#ece8e1] text-[#1a3c2a] transition hover:bg-[#faf8f5]"
            aria-label="Previous month"
          >
            ‹
          </button>
          <span className="text-sm font-semibold text-[#1c1c1e]">{monthLabel}</span>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#ece8e1] text-[#1a3c2a] transition hover:bg-[#faf8f5]"
            aria-label="Next month"
          >
            ›
          </button>
        </div>

        <div className="mt-2 grid grid-cols-7 gap-0.5 text-center text-[11px] font-semibold text-[#6e6e6e]">
          {["S", "M", "T", "W", "T", "F", "S"].map((d, idx) => (
            <span key={`${d}-${idx}`}>{d}</span>
          ))}
        </div>

        <div className="mt-1 grid grid-cols-7 gap-0.5">
          {dayCells.map((dayNum, idx) => {
            if (dayNum === null) {
              return <div key={`e-${idx}`} className="aspect-square" />;
            }
            const dayDate = new Date(
              calendarMonth.getFullYear(),
              calendarMonth.getMonth(),
              dayNum,
            );
            const isPast = startOfDay(dayDate).getTime() < todayStart.getTime();
            const isStart = draftStartDate ? isSameDay(dayDate, draftStartDate) : false;
            const isEnd = draftEndDate ? isSameDay(dayDate, draftEndDate) : false;
            const inRange = !isPast && isInSelectedRange(dayDate);
            return (
              <button
                key={`d-${calendarMonth.getFullYear()}-${calendarMonth.getMonth()}-${dayNum}`}
                type="button"
                disabled={isPast}
                onClick={() => onSelectDay(dayDate)}
                className={`flex aspect-square items-center justify-center rounded-lg text-sm font-semibold transition ${
                  isPast ? "cursor-not-allowed text-[#c4c4c4]" : "text-[#1c1c1e] hover:bg-[#f1efea]"
                } ${inRange && !isStart && !isEnd ? "bg-[#edf4ef]" : ""}`}
              >
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full ${
                    isStart || isEnd ? "bg-[#1a3c2a] text-white" : ""
                  }`}
                >
                  {dayNum}
                </span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          disabled={!draftStartDate}
          onClick={applyDraftRange}
          className="parfade-btn-primary mt-4 w-full disabled:cursor-not-allowed disabled:opacity-40"
        >
          Apply
        </button>
          </div>
        </div>
      </div>
    </BodyPortal>
  );
}

"use client";
import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import {
  PERSIAN_MONTHS,
  currentJalaliYear,
  isoToJalali,
  jalaliMonthDays,
  jalaliToIso,
  jalaliWeekday,
  jalaliYearRange,
  toPersianDigits,
} from "@/lib/utils/jalali";

const WEEKDAY_LABELS = ["ش", "ی", "د", "س", "چ", "پ", "ج"];
const YEARS = jalaliYearRange();

export function JalaliDatePicker({ value, onChange }: { value: string; onChange: (iso: string) => void }) {
  const selected = isoToJalali(value);
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(selected?.jy ?? currentJalaliYear());
  const [viewMonth, setViewMonth] = useState(selected?.jm ?? 1);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocumentMouseDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocumentMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocumentMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function openPicker() {
    setViewYear(selected?.jy ?? currentJalaliYear());
    setViewMonth(selected?.jm ?? 1);
    setOpen(true);
  }

  function shiftMonth(delta: number) {
    let month = viewMonth + delta;
    let year = viewYear;
    if (month > 12) {
      month = 1;
      year += 1;
    } else if (month < 1) {
      month = 12;
      year -= 1;
    }
    setViewMonth(month);
    setViewYear(year);
  }

  function pickDay(day: number) {
    onChange(jalaliToIso(viewYear, viewMonth, day) ?? "");
    setOpen(false);
  }

  const daysInMonth = jalaliMonthDays(viewYear, viewMonth);
  const leadingBlanks = jalaliWeekday(viewYear, viewMonth, 1);
  const cells: Array<number | null> = [...Array(leadingBlanks).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const label = selected
    ? `${toPersianDigits(selected.jd)} ${PERSIAN_MONTHS[selected.jm - 1]} ${toPersianDigits(selected.jy)}`
    : "انتخاب تاریخ";

  return (
    <div className="jalali-date" ref={containerRef}>
      <button
        type="button"
        className="jalali-date__trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openPicker())}
      >
        <CalendarDays aria-hidden="true" size={17} strokeWidth={2} />
        <span data-placeholder={!selected}>{label}</span>
      </button>
      {open ? (
        <div className="jalali-date__popover" role="dialog" aria-label="انتخاب تاریخ">
          <div className="jalali-date__header">
            <button type="button" className="icon-button" aria-label="ماه بعد" onClick={() => shiftMonth(1)}>
              <ChevronLeft aria-hidden="true" size={16} />
            </button>
            <div className="jalali-date__header-selects">
              <select aria-label="ماه" value={viewMonth} onChange={(e) => setViewMonth(Number(e.target.value))}>
                {PERSIAN_MONTHS.map((month, index) => (
                  <option key={month} value={index + 1}>
                    {month}
                  </option>
                ))}
              </select>
              <select aria-label="سال" value={viewYear} onChange={(e) => setViewYear(Number(e.target.value))}>
                {YEARS.map((year) => (
                  <option key={year} value={year}>
                    {toPersianDigits(year)}
                  </option>
                ))}
              </select>
            </div>
            <button type="button" className="icon-button" aria-label="ماه قبل" onClick={() => shiftMonth(-1)}>
              <ChevronRight aria-hidden="true" size={16} />
            </button>
          </div>
          <div className="jalali-date__weekdays">
            {WEEKDAY_LABELS.map((weekday) => (
              <span key={weekday}>{weekday}</span>
            ))}
          </div>
          <div className="jalali-date__grid">
            {cells.map((day, index) =>
              day === null ? (
                <span key={`blank-${index}`} />
              ) : (
                <button
                  type="button"
                  key={day}
                  className={
                    "jalali-date__day" +
                    (selected && selected.jy === viewYear && selected.jm === viewMonth && selected.jd === day
                      ? " jalali-date__day--selected"
                      : "")
                  }
                  onClick={() => pickDay(day)}
                >
                  {toPersianDigits(day)}
                </button>
              ),
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

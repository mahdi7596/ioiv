"use client";

import { useEffect, useRef } from "react";
import { keepAsciiDigits } from "@/lib/input/digits";

const CODE_LENGTH = 6;
const EMPTY_SLOT = " ";

type OtpFormProps = {
  code: string;
  error?: string;
  loading?: boolean;
  canResend?: boolean;
  secondsRemaining: number;
  onCodeChange: (code: string) => void;
  onSubmit: () => void;
  onResend: () => void;
  onBack: () => void;
};

function toSlots(code: string) {
  return Array.from({ length: CODE_LENGTH }, (_, index) => {
    const char = code[index];
    return char && char !== EMPTY_SLOT ? char : "";
  });
}

function fromSlots(slots: string[]) {
  return slots.map((slot) => slot || EMPTY_SLOT).join("");
}

export function OtpForm({
  code,
  error,
  loading,
  canResend,
  secondsRemaining,
  onCodeChange,
  onSubmit,
  onResend,
  onBack,
}: OtpFormProps) {
  const slots = toSlots(code);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const lastSubmittedCode = useRef<string | null>(null);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (error) {
      inputRefs.current[0]?.focus();
    }
  }, [error]);

  useEffect(() => {
    if (!/^\d{6}$/.test(code)) {
      lastSubmittedCode.current = null;
      return;
    }
    if (loading || lastSubmittedCode.current === code) {
      return;
    }
    lastSubmittedCode.current = code;
    onSubmit();
  }, [code, loading, onSubmit]);

  function setSlot(index: number, value: string) {
    const nextSlots = [...slots];
    nextSlots[index] = value;
    onCodeChange(fromSlots(nextSlots));
  }

  function focusSlot(index: number) {
    inputRefs.current[Math.max(0, Math.min(index, CODE_LENGTH - 1))]?.focus();
  }

  function handleChange(index: number, rawValue: string) {
    const digit = keepAsciiDigits(rawValue).slice(-1);
    setSlot(index, digit);
    if (digit) {
      focusSlot(index + 1);
    }
  }

  function handleKeyDown(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace") {
      event.preventDefault();
      if (slots[index]) {
        setSlot(index, "");
      } else if (index > 0) {
        setSlot(index - 1, "");
        focusSlot(index - 1);
      }
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusSlot(index - 1);
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      focusSlot(index + 1);
    }
  }

  function handlePaste(index: number, event: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = keepAsciiDigits(event.clipboardData.getData("text"));
    if (!pasted) {
      return;
    }
    event.preventDefault();
    const nextSlots = [...slots];
    let cursor = index;
    for (const digit of pasted) {
      if (cursor >= CODE_LENGTH) break;
      nextSlots[cursor] = digit;
      cursor += 1;
    }
    onCodeChange(fromSlots(nextSlots));
    focusSlot(cursor);
  }

  return (
    <form
      className="stack"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="field" data-invalid={error ? "true" : undefined}>
        <label id="otp-label">
          کد تایید <span className="text-red-600">*</span>
        </label>
        <div className="otp-boxes" role="group" aria-labelledby="otp-label" dir="ltr">
          {slots.map((slot, index) => (
            <input
              key={index}
              ref={(node) => {
                inputRefs.current[index] = node;
              }}
              type="tel"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              maxLength={1}
              className="otp-box"
              value={slot}
              disabled={loading}
              aria-label={`رقم ${index + 1} کد تایید`}
              onChange={(event) => handleChange(index, event.target.value)}
              onKeyDown={(event) => handleKeyDown(index, event)}
              onPaste={(event) => handlePaste(index, event)}
              onFocus={(event) => {
                const input = event.target;
                requestAnimationFrame(() => input.select());
              }}
            />
          ))}
        </div>
        {error ? (
          <p className="field__hint" role="alert">
            {error}
          </p>
        ) : loading ? (
          <p className="field__hint" aria-live="polite">
            در حال بررسی کد تایید...
          </p>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3 text-sm">
        <button type="button" onClick={onBack} className="text-stone-700 hover:text-stone-950">
          تغییر شماره
        </button>
        <button
          type="button"
          onClick={onResend}
          disabled={!canResend || loading}
          className="text-emerald-800 hover:text-emerald-950 disabled:cursor-not-allowed disabled:text-stone-400"
        >
          {canResend ? "ارسال مجدد کد" : `ارسال مجدد تا ${secondsRemaining} ثانیه`}
        </button>
      </div>
    </form>
  );
}

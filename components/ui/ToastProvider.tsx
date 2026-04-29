"use client";

import { useEffect, useState } from "react";

type ToastType = "success" | "error" | "info";

type Toast = {
  id: number;
  message: string;
  type: ToastType;
};

export type ToastDetail = {
  message: string;
  type?: ToastType;
};

export function ToastProvider() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    function showToast(event: Event) {
      const detail = (event as CustomEvent<ToastDetail>).detail;

      if (!detail?.message) {
        return;
      }

      const id = Date.now();
      setToasts((current) => [
        ...current,
        { id, message: detail.message, type: detail.type ?? "info" },
      ]);

      window.setTimeout(() => {
        setToasts((current) => current.filter((toast) => toast.id !== id));
      }, 4200);
    }

    window.addEventListener("sana:toast", showToast);
    return () => window.removeEventListener("sana:toast", showToast);
  }, []);

  return (
    <div className="toast-viewport" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <div className={`toast toast--${toast.type}`} key={toast.id}>
          {toast.message}
        </div>
      ))}
    </div>
  );
}

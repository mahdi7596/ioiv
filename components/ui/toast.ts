import type { ToastDetail } from "./ToastProvider";

export function showToast(detail: ToastDetail) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent("sana:toast", { detail }));
}

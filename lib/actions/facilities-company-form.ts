"use server";

import { logger } from "@/lib/logger";
import { ActionError } from "@/lib/actions/auth";
import { completeFacilitiesCompanyProfile, ensureFacilitiesProfileDocumentSlot, saveFacilitiesCompanyDraft } from "@/lib/actions/facilities-company";

// Expected failures must be returned as data: production React redacts thrown
// server-action errors, including the Persian validation messages.
async function result<T>(action: string, operation: () => Promise<T>) {
  try {
    return { ok: true as const, data: await operation() };
  } catch (error) {
    if (!(error instanceof ActionError) && !(error instanceof Error && error.message === "Unauthorized")) {
      logger.warn("facilities.profile.action_failed", { action, reason: "unexpected_failure" });
    }
    return {
      ok: false as const,
      error: error instanceof ActionError
        ? error.message
        : error instanceof Error && error.message === "Unauthorized"
          ? "نشست شما منقضی شده است؛ دوباره وارد شوید."
          : "انجام عملیات ممکن نشد؛ دوباره تلاش کنید. اگر مشکل ادامه داشت با پشتیبانی تماس بگیرید.",
    };
  }
}

export async function saveCompanyProfileForm(input: unknown) {
  return result("save", () => saveFacilitiesCompanyDraft(input));
}

export async function completeCompanyProfileForm(input: { version: number }) {
  return result("complete", () => completeFacilitiesCompanyProfile(input));
}

export async function prepareCompanyProfileUpload(kind: string, officerId?: string) {
  return result("prepare_upload", async () => {
    const binding = await ensureFacilitiesProfileDocumentSlot(kind, officerId);
    return { id: binding.id };
  });
}

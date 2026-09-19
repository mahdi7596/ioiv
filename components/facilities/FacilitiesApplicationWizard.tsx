"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { PAYMENT_UNCERTAIN_MESSAGE } from "@/lib/payments/messages";
import { useMemo, useState, useTransition } from "react";
import { AlertCircle, CalendarRange, CheckCircle2, Clock, Download, History, Loader2, MessageSquareWarning, Search, Upload, Wallet, type LucideIcon } from "lucide-react";

import { StepIndicator } from "@/components/application/StepIndicator";
import { showToast } from "@/components/ui/toast";
import { createFacilitiesDraft, ensureFacilitiesApplicationSlot, updateFacilitiesApplicationDetails } from "@/lib/actions/facilities-application";
import { startFacilitiesPayment, submitFacilitiesApplication } from "@/lib/actions/facilities-payment";
import { normalizeDigits } from "@/lib/validations/facilities-company";

function groupDigits(value: string) {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatRial(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";
  const [integerPart, ...rest] = String(value).split(".");
  const grouped = groupDigits(integerPart);
  return rest.length ? `${grouped}.${rest.join(".")}` : grouped;
}

// Keep only ASCII digits so the value the server receives is a clean integer for
// Prisma.Decimal, while the input can display grouped digits (۳۰۰٬۰۰۰٬۰۰۰).
function amountDigits(value: string | number | null | undefined) {
  return normalizeDigits(String(value ?? "")).replace(/\D/g, "");
}

type DocItem = readonly [key: string, label: string, required: boolean];

const documentGroups: { title: string; items: DocItem[] }[] = [
  {
    title: "اسناد مالی و مالیاتی",
    items: [
      ["tax-1404", "اظهارنامه مالیاتی ۱۴۰۴", true],
      ["tax-1403", "اظهارنامه مالیاتی ۱۴۰۳ (اختیاری)", false],
      ["tax-1402", "اظهارنامه مالیاتی ۱۴۰۲ (اختیاری)", false],
      ["financial-1404", "صورت مالی حسابرسی‌شده ۱۴۰۴", true],
      ["financial-1403", "صورت مالی حسابرسی‌شده ۱۴۰۳", true],
      ["financial-1402", "صورت مالی حسابرسی‌شده ۱۴۰۲ (اختیاری)", false],
      ["insurance", "لیست بیمه", true],
      ["trial-general", "تراز کل ۱۴۰۵", true],
      ["trial-subsidiary", "تراز معین ۱۴۰۵", true],
    ],
  },
  {
    title: "گزارش‌های اعتباری",
    items: [
      ["credit-company", "گزارش اعتباری شرکت", true],
      ["credit-ceo", "گزارش اعتباری مدیرعامل", true],
      ["credit-board", "گزارش اعتباری عضو هیئت‌مدیره", true],
    ],
  },
  {
    title: "پرسشنامه و مجوزها",
    items: [
      ["questionnaire", "پرسشنامه تکمیل‌شده (فقط Word)", true],
      ["licences", "مجوزها و گواهی‌ها (ZIP)", true],
      ["active-contracts", "قراردادهای فعال (ZIP)", true],
    ],
  },
  {
    title: "ارزش افزوده",
    items: [
      ["vat-1404", "ارزش افزوده ۱۴۰۴ (ZIP)", true],
      ["vat-1403", "ارزش افزوده ۱۴۰۳ (اختیاری)", false],
      ["vat-1402", "ارزش افزوده ۱۴۰۲ (اختیاری)", false],
    ],
  },
];

function acceptFor(key: string) {
  if (key === "questionnaire") return ".doc,.docx";
  if (key.startsWith("vat-") || key === "licences" || key === "active-contracts") return ".zip";
  return ".pdf,.doc,.docx,.xls,.xlsx,.csv,.zip,.jpg,.jpeg,.png,.webp,.heic,.heif";
}

const editSteps = ["مشخصات درخواست", "مدارک درخواست", "تأیید و ارسال"];

// Required document slots for step 2 — mirrors the server-side requirement so
// the user cannot advance before every starred document is uploaded.
const requiredDocKeys = documentGroups.flatMap((group) => group.items.filter(([, , required]) => required).map(([key]) => key));

function bindingReady(binding: any) {
  return binding?.currentUpload?.lifecycleStatus === "PASSED" && binding.currentUpload.storedFile?.scanStatus === "PASSED";
}

const facilityTypeLabels: Record<string, string> = {
  FIXED_CAPITAL: "سرمایه ثابت",
  WORKING_CAPITAL: "سرمایه در گردش",
};

type NoticeTone = "success" | "info" | "pending" | "error";

const noticeIcons: Record<NoticeTone, LucideIcon> = {
  success: CheckCircle2,
  info: Search,
  pending: Clock,
  error: AlertCircle,
};

function StatusNotice({ tone, title, description }: { tone: NoticeTone; title: string; description?: string }) {
  const Icon = noticeIcons[tone];
  return (
    <section className={`status-notice status-notice--${tone}`} role="status">
      <span className="status-notice__icon" aria-hidden="true"><Icon size={20} strokeWidth={2} /></span>
      <div className="status-notice__body">
        <h2 className="status-notice__title">{title}</h2>
        {description ? <p className="status-notice__desc">{description}</p> : null}
      </div>
    </section>
  );
}

const paymentNotices: Record<string, { tone: NoticeTone; title: string; description: string }> = {
  success: { tone: "success", title: "پرداخت تأیید شد", description: "پرداخت شما با موفقیت انجام و درخواست تسهیلات ارسال شد." },
  failed: { tone: "error", title: "پرداخت ناموفق بود", description: "پرداخت انجام نشد؛ پس از بررسی اطلاعات می‌توانید دوباره تلاش کنید." },
  pending: { tone: "pending", title: "در انتظار نتیجه پرداخت", description: PAYMENT_UNCERTAIN_MESSAGE },
  "paid-unsubmitted": { tone: "pending", title: "پرداخت ثبت شد؛ ارسال کامل نشد", description: "پرداخت شما تأیید شده است. مدارک را بررسی و در صورت نیاز دوباره بارگذاری کنید، سپس دکمه ارسال را بزنید؛ هزینه‌ای کسر نمی‌شود." },
  corrected: { tone: "success", title: "اصلاحات ارسال شد", description: "اصلاحات شما ثبت شد و پرونده به صف بررسی بازگشت؛ هزینه‌ای از شما کسر نشد." },
};

const statusLabels: Record<string, string> = {
  DRAFT: "پیش‌نویس",
  PENDING_PAYMENT: "در انتظار پرداخت",
  SUBMITTED: "در صف بررسی",
  UNDER_REVIEW: "در حال بررسی",
  NEEDS_EDIT: "نیازمند اصلاح",
  VALIDATION_COMPLETED: "پایان فرآیند اعتبارسنجی",
};

// The status-history log is append-only, so older rows can carry wording we've
// since improved. Normalize known legacy notes for display without touching
// the stored audit record.
const legacyStatusNotes: Record<string, string> = {
  "درخواست پس از تکمیل بررسی‌های سرور ارسال شد": "درخواست پس از تکمیل بررسی‌های نهایی ارسال شد",
};
function displayStatusNote(note: string) {
  return legacyStatusNotes[note] ?? note;
}

type DocStatus = { state: "uploading" | "done" | "error"; name?: string; previousName?: string; error?: string };

function DocRow({ item, status, disabled, onPick }: { item: DocItem; status?: DocStatus; disabled: boolean; onPick: (file: File) => void }) {
  const [key, label, required] = item;
  return (
    <div className="member-doc" data-status={status?.state}>
      <div className="member-doc__info">
        <span className="member-doc__label">
          {label}
          {required ? <span className="field-required" aria-hidden="true">*</span> : null}
        </span>
      </div>
      <div className="member-doc__control">
        <label className="button button--ghost button--sm">
          <Upload aria-hidden="true" size={15} strokeWidth={2} />
          {status?.state === "done" || status?.previousName ? "تغییر فایل" : "انتخاب فایل"}
          <input
            type="file"
            className="sr-only"
            disabled={disabled}
            accept={acceptFor(key)}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onPick(file);
              event.target.value = "";
            }}
          />
        </label>
        {status?.state === "uploading" ? (
          <span role="status" className="document-list__status document-list__status--uploading">
            <Loader2 aria-hidden="true" size={15} className="spin" />
            در حال بررسی…
          </span>
        ) : status?.state === "done" ? (
          <span className="document-list__status document-list__status--done">
            <CheckCircle2 aria-hidden="true" size={15} />
            <span className="document-list__filename">{status.name || "ثبت شد"}</span>
          </span>
        ) : status?.state === "error" ? (
          <span role="alert" className="document-list__status document-list__status--error">
            <AlertCircle aria-hidden="true" size={15} />
            <span className="document-list__error-text">{status.error || "خطا"}
            {status.previousName ? <span className="document-list__previous-file">آخرین فایل ثبت‌شده: «<bdi>{status.previousName}</bdi>». برای دیدن وضعیت فعلی، صفحه را بازخوانی کنید.</span> : null}</span>
          </span>
        ) : (
          <span className="member-doc__hint">حداکثر ۲۵ مگابایت</span>
        )}
      </div>
    </div>
  );
}

export function FacilitiesApplicationWizard({ data, notice, initialStep = 1 }: { data: any; notice?: string; initialStep?: number }) {
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  // Seed from documents already uploaded AND passed so they show as done on
  // reload — users never re-upload what the server already has.
  const [docStatus, setDocStatus] = useState<Record<string, DocStatus>>(() => {
    const seed: Record<string, DocStatus> = {};
    for (const binding of data.applications[0]?.fileBindings || []) {
      if (!bindingReady(binding) || binding.slotKey.startsWith("questionnaire-attachment-")) continue;
      seed[binding.slotKey] = { state: "done", name: binding.currentUpload.storedFile?.originalName };
    }
    return seed;
  });
  const [attachmentCount, setAttachmentCount] = useState<number>(() =>
    (data.applications[0]?.fileBindings || []).filter((binding: any) => bindingReady(binding) && binding.slotKey.startsWith("questionnaire-attachment-")).length
  );
  const [intakeId, setIntakeId] = useState(data.intakes[0]?.id || "");
  const intake = useMemo(() => data.intakes.find((item: any) => item.id === intakeId), [data.intakes, intakeId]);
  const [supplierId, setSupplierId] = useState(intake?.supplierConfigurations[0]?.id || "");
  const [app, setApp] = useState(data.applications[0] || null);
  const [amount, setAmount] = useState(amountDigits(data.applications[0]?.requestedAmountRial));
  const [type, setType] = useState(data.applications[0]?.facilityType || "FIXED_CAPITAL");
  const [confirmed, setConfirmed] = useState(false);
  const [step, setStep] = useState(Math.min(Math.max(1, initialStep), editSteps.length));
  const [busy, setBusy] = useState(false);

  const paymentEnabled = Boolean(app?.paymentEnabledSnapshot);
  const paymentNotice = notice ? paymentNotices[notice] : undefined;
  const noticePanel = paymentNotice ? <StatusNotice tone={paymentNotice.tone} title={paymentNotice.title} description={paymentNotice.description} /> : null;

  const run = (work: () => Promise<any>) => {
    startTransition(async () => {
      try {
        const result = await work();
        if (result?.id) setApp(result);
        if (result?.redirectTo) {
          window.location.assign(result.redirectTo);
          return;
        }
        if (result?.state === "pending") {
          showToast({ type: "error", message: result.message });
          return;
        }
        showToast({ type: "success", message: "اطلاعات درخواست ذخیره شد" });
      } catch (error) {
        showToast({ type: "error", message: error instanceof Error ? error.message : "عملیات ناموفق بود؛ دوباره تلاش کنید" });
      }
    });
  };

  async function upload(slotKey: string, file: File, attachment = false) {
    if (!app) return;
    setUploading(true);
    if (!attachment) setDocStatus((current) => ({ ...current, [slotKey]: { state: "uploading", previousName: current[slotKey]?.name || current[slotKey]?.previousName } }));
    try {
      const kind = attachment ? `questionnaire-attachment-${crypto.randomUUID().replaceAll("-", "")}` : slotKey.startsWith("tax-") ? "tax" : slotKey.startsWith("financial-") ? "financial" : slotKey.startsWith("vat-") ? "vat" : slotKey;
      const year = attachment ? undefined : Number(slotKey.split("-")[1]) || undefined;
      const binding = await ensureFacilitiesApplicationSlot({ applicationId: app.id, kind, year });
      const form = new FormData();
      form.set("bindingId", binding.id);
      form.set("idempotencyKey", crypto.randomUUID().replaceAll("-", ""));
      form.set("file", file);
      const response = await fetch("/api/facilities/application-files", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok || result.lifecycleStatus !== "PASSED") throw new Error(result.error || "فایل هنوز قابل استفاده نیست؛ دوباره تلاش کنید");
      if (attachment) setAttachmentCount((count) => count + 1);
      else setDocStatus((current) => ({ ...current, [slotKey]: { state: "done", name: file.name } }));
      showToast({ type: "success", message: "فایل بررسی و ثبت شد" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "بارگذاری فایل ناموفق بود";
      if (!attachment) setDocStatus((current) => ({ ...current, [slotKey]: { state: "error", error: message, previousName: current[slotKey]?.previousName } }));
      showToast({ type: "error", message });
    } finally {
      setUploading(false);
    }
  }

  if (!app) {
    if (!data.intakes.length) return <div className="panel" role="status">در حال حاضر دوره یا تأمین‌کننده واجد شرایطی برای درخواست وجود ندارد.</div>;
    const selectedSupplier = intake.supplierConfigurations.find((item: any) => item.id === supplierId);
    // The first step of the wizard is choosing the intake/supplier and amount; it
    // lives inside the same wizard chrome (not a separate screen) and, on success,
    // advances straight to step 2 so the type/amount are never asked twice.
    const createDraft = () => {
      startTransition(async () => {
        try {
          const result = await createFacilitiesDraft({ intakeId, intakeSupplierId: supplierId, facilityType: type as any, requestedAmountRial: amountDigits(amount) });
          if (result?.id) { setApp(result); setStep(2); }
          showToast({ type: "success", message: "پیش‌نویس درخواست ساخته شد" });
        } catch (error) {
          showToast({ type: "error", message: error instanceof Error ? error.message : "ایجاد پیش‌نویس ناموفق بود" });
        }
      });
    };
    return (
      <div className="profile-form" style={{ paddingBlockEnd: 84 }}>
        <div className="panel wizard">
          <div className="wizard__progress">
            <StepIndicator currentStep={1} totalSteps={editSteps.length} title={editSteps[0]} />
          </div>
          <section className="wizard__body">
            <form className="wizard__step" onSubmit={(event) => { event.preventDefault(); createDraft(); }}>
              <h2>{editSteps[0]}</h2>
              <div className="stack">
                <section className="profile-list" aria-labelledby="facilities-intake-heading">
                  <h3 className="section-legend" id="facilities-intake-heading">
                    <CalendarRange aria-hidden="true" size={18} strokeWidth={2} />
                    دوره فراخوان و تأمین‌کننده
                  </h3>
                  <div className="profile-grid">
                    <label>
                      <span className="field-label">دوره فراخوان<span className="field-required" aria-hidden="true">*</span></span>
                      <select value={intakeId} onChange={(event) => { setIntakeId(event.target.value); setSupplierId(data.intakes.find((item: any) => item.id === event.target.value)?.supplierConfigurations[0]?.id || ""); }}>
                        {data.intakes.map((item: any) => <option value={item.id} key={item.id}>{item.name}</option>)}
                      </select>
                    </label>
                    <label>
                      <span className="field-label">تأمین‌کننده<span className="field-required" aria-hidden="true">*</span></span>
                      <select value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
                        {intake.supplierConfigurations.map((item: any) => <option value={item.id} key={item.id}>{item.supplier.name}</option>)}
                      </select>
                    </label>
                  </div>
                  {selectedSupplier ? (
                    <a className="button button--ghost button--sm facilities-prospectus-link" href={`/api/facilities/questionnaires/${selectedSupplier.questionnaireTemplateVersion.id}?intakeSupplierId=${selectedSupplier.id}`}>
                      <Download aria-hidden="true" size={16} strokeWidth={2} />
                      دانلود پرسشنامه این تأمین‌کننده (نسخه {selectedSupplier.questionnaireTemplateVersion.versionLabel})
                    </a>
                  ) : null}
                </section>
                <section className="profile-list" aria-labelledby="facilities-amount-heading">
                  <h3 className="section-legend" id="facilities-amount-heading">
                    <Wallet aria-hidden="true" size={18} strokeWidth={2} />
                    مشخصات تسهیلات درخواستی
                  </h3>
                  <div className="profile-grid">
                    <label>
                      <span className="field-label">نوع تسهیلات<span className="field-required" aria-hidden="true">*</span></span>
                      <select value={type} onChange={(event) => setType(event.target.value)}>
                        <option value="FIXED_CAPITAL">سرمایه ثابت</option>
                        <option value="WORKING_CAPITAL">سرمایه در گردش</option>
                      </select>
                    </label>
                    <label>
                      <span className="field-label">مبلغ درخواستی (ریال)<span className="field-required" aria-hidden="true">*</span></span>
                      <input dir="ltr" required inputMode="numeric" value={groupDigits(amount)} onChange={(event) => setAmount(amountDigits(event.target.value))} />
                      <small>سقف قابل درخواست در این دوره: {formatRial(intake.maximumAmountRial)} ریال</small>
                    </label>
                  </div>
                </section>
              </div>
              <div className="sticky-actions">
                <button className="button button--primary" disabled={pending || !supplierId}>ایجاد پیش‌نویس</button>
              </div>
            </form>
          </section>
        </div>
      </div>
    );
  }

  const latestCorrection = app.correctionRequests?.find((item: any) => !item.resolvedAt);
  const correctionItems: any[] = app.correctionRequests || [];
  const historyItems: any[] = app.history || [];
  const timeline = (
    <section className="panel facilities-history" aria-labelledby="facilities-history-heading">
      <div className="facilities-history__head">
        <span className="facilities-history__icon" aria-hidden="true"><History size={20} strokeWidth={2} /></span>
        <div>
          <h2 id="facilities-history-heading">سوابق وضعیت و اصلاحات</h2>
          <p className="facilities-history__subtitle">روند بررسی پرونده و درخواست‌های اصلاح کارشناس در این بخش ثبت می‌شود.</p>
        </div>
      </div>

      <div className="facilities-history__group">
        <h3 className="facilities-history__label"><MessageSquareWarning aria-hidden="true" size={16} strokeWidth={2} />اصلاحات درخواستی</h3>
        {correctionItems.length ? (
          <ol className="facilities-timeline">
            {correctionItems.map((item) => (
              <li key={item.id} className="facilities-timeline__item" data-state={item.resolvedAt ? "done" : "pending"}>
                <span className="facilities-timeline__marker" aria-hidden="true" />
                <div className="facilities-timeline__content">
                  <div className="facilities-timeline__row">
                    <strong>اصلاح شماره {Number(item.sequence).toLocaleString("fa-IR")}</strong>
                    <span className={`facilities-timeline__pill facilities-timeline__pill--${item.resolvedAt ? "done" : "pending"}`}>{item.resolvedAt ? "ارسال‌شده" : "در انتظار اقدام"}</span>
                  </div>
                  <time className="facilities-timeline__time">{new Date(item.openedAt).toLocaleString("fa-IR")}</time>
                  {item.note ? <p className="facilities-timeline__note">{item.note}</p> : null}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="facilities-history__empty"><CheckCircle2 aria-hidden="true" size={16} strokeWidth={2} />درخواست اصلاحی برای این پرونده ثبت نشده است.</p>
        )}
      </div>

      <div className="facilities-history__group">
        <h3 className="facilities-history__label"><History aria-hidden="true" size={16} strokeWidth={2} />تغییرات وضعیت پرونده</h3>
        {historyItems.length ? (
          <ol className="facilities-timeline">
            {historyItems.map((item) => (
              <li key={item.id} className="facilities-timeline__item">
                <span className="facilities-timeline__marker" aria-hidden="true" />
                <div className="facilities-timeline__content">
                  <div className="facilities-timeline__row"><strong>{statusLabels[item.newStatus] || item.newStatus}</strong></div>
                  <time className="facilities-timeline__time">{new Date(item.createdAt).toLocaleString("fa-IR")}</time>
                  {item.note ? <p className="facilities-timeline__note">{displayStatusNote(item.note)}</p> : null}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="facilities-history__empty"><History aria-hidden="true" size={16} strokeWidth={2} />هنوز تغییری در وضعیت پرونده ثبت نشده است.</p>
        )}
      </div>
    </section>
  );

  if (["SUBMITTED", "UNDER_REVIEW", "VALIDATION_COMPLETED"].includes(app.status)) {
    const tone: NoticeTone = app.status === "VALIDATION_COMPLETED" ? "success" : "info";
    const description = app.status === "SUBMITTED" ? "درخواست در صف بررسی مدیریت قرار دارد." : app.status === "UNDER_REVIEW" ? "کارشناس در حال بررسی اطلاعات و مدارک است." : "فرآیند اعتبارسنجی این درخواست پایان یافته است.";
    return <div className="profile-form">{noticePanel}<StatusNotice tone={tone} title={statusLabels[app.status]} description={description} />{timeline}</div>;
  }
  if (app.status === "PENDING_PAYMENT" || (app.paymentObligation && !["READY", "SETTLED"].includes(app.paymentObligation.state))) {
    const resumable = app.paymentObligation?.state === "PAYABLE";
    return <div className="profile-form"><StatusNotice tone="pending" title={resumable ? "ادامه پرداخت قبلی" : "در انتظار نتیجه پرداخت"} description={resumable ? "می‌توانید همان پرداخت قبلی را در درگاه ادامه دهید." : PAYMENT_UNCERTAIN_MESSAGE} /><button type="button" className="button button--primary" disabled={pending} onClick={() => run(() => startFacilitiesPayment({ applicationId: app.id, confirmed: true }))}>{pending ? "در حال بررسی..." : resumable ? "ادامه پرداخت قبلی" : "بررسی وضعیت پرداخت"}</button>{timeline}</div>;
  }

  const showPaymentConfirm = paymentEnabled && app.status !== "NEEDS_EDIT";
  // The intake/supplier are fixed once the draft exists; look up their names for
  // the read-only summary in step 1 (they may be absent if the intake was retired).
  const appIntake = data.intakes.find((item: any) => item.id === app.intakeId);
  const appSupplier = appIntake?.supplierConfigurations.find((item: any) => item.id === app.intakeSupplierId);

  function scrollToTop() {
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Auto-save the current step's data. Returns false if the server rejected it
  // (e.g. validation) so navigation can stay put. Uploads on step 2 already
  // persist on their own, so only step 1 carries field data (type/amount).
  async function persistStep(target: number): Promise<boolean> {
    try {
      if (target !== 1) return true;
      const result: any = await updateFacilitiesApplicationDetails({ applicationId: app.id, facilityType: type as any, requestedAmountRial: amount });
      if (result?.id) setApp(result);
      if (result?.state === "pending") {
        showToast({ type: "error", message: result.message });
        return false;
      }
      return true;
    } catch (error) {
      showToast({ type: "error", message: error instanceof Error ? error.message : "ذخیره خودکار ناموفق بود؛ دوباره تلاش کنید" });
      return false;
    }
  }

  const missingRequiredDocs = requiredDocKeys.filter((key) => docStatus[key]?.state !== "done" && !docStatus[key]?.previousName);

  async function goNext() {
    if (busy || step >= editSteps.length) return;
    if (step === 2 && missingRequiredDocs.length) {
      showToast({ type: "error", message: `برای ادامه، ${missingRequiredDocs.length.toLocaleString("fa-IR")} مدرک الزامی باقی‌مانده را بارگذاری کنید` });
      scrollToTop();
      return;
    }
    setBusy(true);
    try {
      const saved = await persistStep(step);
      if (!saved) return;
      if (step === 1) showToast({ type: "success", message: "اطلاعات به‌صورت خودکار ذخیره شد" });
      setStep((current) => Math.min(editSteps.length, current + 1));
      scrollToTop();
    } finally {
      setBusy(false);
    }
  }

  function goPrev() {
    if (busy || step <= 1) return;
    // Save the current step in the background so going back never loses edits.
    void persistStep(step);
    setStep((current) => Math.max(1, current - 1));
    scrollToTop();
  }

  return (
    <div className="profile-form" style={{ paddingBlockEnd: 84 }}>
      {noticePanel}
      {app.status === "NEEDS_EDIT" && latestCorrection ? <section className="panel review-message" role="alert"><p className="eyebrow">اقدام لازم</p><h2>موارد درخواستی کارشناس</h2><p>{latestCorrection.note}</p><p className="review-message__hint">اگر مورد خواسته‌شده مربوط به مدارک پروفایل شرکت است (مانند اساسنامه یا آگهی تأسیس)، آن را از <a href="/dashboard/facilities-profile">صفحهٔ پروفایل شرکت</a> جایگزین کنید، سپس در همین صفحه «ارسال اصلاحات» را بزنید.</p></section> : null}

      <div className="panel wizard">
        <div className="wizard__progress">
          <StepIndicator currentStep={step} totalSteps={editSteps.length} title={editSteps[step - 1]} />
        </div>

        <section className="wizard__body">
          <div className="wizard__step" key={step}>
            <h2>{editSteps[step - 1]}</h2>

            {step === 1 ? (
              <div className="stack">
                <section className="profile-list" aria-labelledby="facilities-intake-ro">
                  <h3 className="section-legend" id="facilities-intake-ro">
                    <CalendarRange aria-hidden="true" size={18} strokeWidth={2} />
                    دوره فراخوان و تأمین‌کننده
                  </h3>
                  <div className="profile-grid">
                    <label>
                      <span className="field-label">دوره فراخوان</span>
                      <input value={appIntake?.name ?? "—"} readOnly aria-readonly="true" />
                    </label>
                    <label>
                      <span className="field-label">تأمین‌کننده</span>
                      <input value={appSupplier?.supplier?.name ?? "—"} readOnly aria-readonly="true" />
                    </label>
                  </div>
                  {appSupplier ? (
                    <a className="button button--ghost button--sm facilities-prospectus-link" href={`/api/facilities/questionnaires/${appSupplier.questionnaireTemplateVersion.id}?intakeSupplierId=${appSupplier.id}`}>
                      <Download aria-hidden="true" size={16} strokeWidth={2} />
                      دانلود پرسشنامه این تأمین‌کننده (نسخه {appSupplier.questionnaireTemplateVersion.versionLabel})
                    </a>
                  ) : null}
                </section>
                <section className="profile-list" aria-labelledby="facilities-amount-ro">
                  <h3 className="section-legend" id="facilities-amount-ro">
                    <Wallet aria-hidden="true" size={18} strokeWidth={2} />
                    مشخصات تسهیلات درخواستی
                  </h3>
                  <div className="profile-grid">
                    <label>
                      <span className="field-label">نوع تسهیلات<span className="field-required" aria-hidden="true">*</span></span>
                      <select value={type} onChange={(event) => setType(event.target.value)}>
                        <option value="FIXED_CAPITAL">سرمایه ثابت</option>
                        <option value="WORKING_CAPITAL">سرمایه در گردش</option>
                      </select>
                    </label>
                    <label>
                      <span className="field-label">مبلغ درخواستی (ریال)<span className="field-required" aria-hidden="true">*</span></span>
                      <input dir="ltr" inputMode="numeric" value={groupDigits(amount)} onChange={(event) => setAmount(amountDigits(event.target.value))} />
                      <small>سقف ثبت‌شده: {formatRial(app.maximumAmountRialSnapshot)} ریال</small>
                    </label>
                  </div>
                </section>
                <p className="section-hint"><CheckCircle2 aria-hidden="true" size={15} />اطلاعات با رفتن به مرحله بعد به‌صورت خودکار ذخیره می‌شود.</p>
              </div>
            ) : null}

            {step === 2 ? (
              <div className="stack">
                <p className="section-hint"><AlertCircle aria-hidden="true" size={15} />هر فایل حداکثر ۲۵ مگابایت و مجموع مدارک حداکثر ۱۵۰ مگابایت است.</p>
                <p className={`section-hint${missingRequiredDocs.length ? " section-hint--error" : " section-hint--success"}`}>
                  {missingRequiredDocs.length ? <AlertCircle aria-hidden="true" size={15} /> : <CheckCircle2 aria-hidden="true" size={15} />}
                  {missingRequiredDocs.length
                    ? `${missingRequiredDocs.length.toLocaleString("fa-IR")} مدرک الزامی (ستاره‌دار) هنوز بارگذاری نشده است. مدارک بارگذاری‌شده ذخیره می‌مانند و نیازی به تکرار نیست.`
                    : "همه مدارک الزامی بارگذاری و ذخیره شد. می‌توانید به مرحله بعد بروید."}
                </p>
                {documentGroups.map((group) => (
                  <section className="profile-list" key={group.title}>
                    <h3 className="section-legend">{group.title}</h3>
                    <div className="document-list">
                      {group.items.map((item) => (
                        <DocRow key={item[0]} item={item} status={docStatus[item[0]]} disabled={pending || uploading} onPick={(file) => void upload(item[0], file)} />
                      ))}
                    </div>
                    {group.title === "پرسشنامه و مجوزها" ? (
                      <div className="member-doc">
                        <div className="member-doc__info">
                          <span className="member-doc__label">پیوست‌های پرسشنامه (اختیاری)</span>
                          <span className="member-doc__desc">می‌توانید چند فایل انتخاب کنید{attachmentCount ? ` — ${attachmentCount} فایل ثبت شد` : ""}.</span>
                        </div>
                        <div className="member-doc__control">
                          <label className="button button--ghost button--sm">
                            <Upload aria-hidden="true" size={15} strokeWidth={2} />
                            انتخاب فایل‌ها
                            <input type="file" multiple className="sr-only" disabled={pending || uploading} accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.zip,.jpg,.jpeg,.png,.webp,.heic,.heif" onChange={(event) => { for (const file of Array.from(event.target.files || [])) void upload("questionnaire-attachment", file, true); event.target.value = ""; }} />
                          </label>
                        </div>
                      </div>
                    ) : null}
                  </section>
                ))}
              </div>
            ) : null}

            {step === 3 ? (
              <div className="stack">
                <div className="detail-grid">
                  <div><span className="stat-label">نوع تسهیلات</span><p className="stat-value">{facilityTypeLabels[type] || type}</p></div>
                  <div><span className="stat-label">مبلغ درخواستی</span><p className="stat-value">{formatRial(amount)} ریال</p></div>
                </div>
                {showPaymentConfirm ? (
                  <label className="payment-acknowledgement">
                    <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
                    اطلاعات و مدارک را بررسی کرده‌ام و برای ادامه به پرداخت می‌روم.
                  </label>
                ) : null}
                <button
                  type="button"
                  className="button button--primary"
                  disabled={pending || uploading || (showPaymentConfirm && !confirmed)}
                  onClick={() => run(() => app.status === "NEEDS_EDIT" ? submitFacilitiesApplication({ applicationId: app.id }) : paymentEnabled ? startFacilitiesPayment({ applicationId: app.id, confirmed }) : submitFacilitiesApplication({ applicationId: app.id }))}
                >
                  {app.status === "NEEDS_EDIT" ? "ارسال اصلاحات" : paymentEnabled ? "تأیید و ورود به پرداخت" : "ارسال نهایی درخواست"}
                </button>
                <p className="section-hint">{app.status === "NEEDS_EDIT" ? "ارسال اصلاحات هزینه دیگری ندارد و پرونده را به صف بررسی بازمی‌گرداند." : paymentEnabled ? "پس از تأیید موفق پرداخت، درخواست به‌صورت خودکار ارسال می‌شود." : "پس از بررسی نهایی، درخواست به‌صورت خودکار ارسال می‌شود."}</p>
              </div>
            ) : null}
          </div>
        </section>

        <div className="sticky-actions">
          <button type="button" className="button button--ghost" disabled={step === 1 || busy} onClick={goPrev}>مرحله قبل</button>
          <button type="button" className="button button--primary" disabled={step === editSteps.length || busy} onClick={goNext}>
            {busy ? <Loader2 aria-hidden="true" size={15} className="spin" /> : null}
            {busy ? "در حال ذخیره…" : "مرحله بعد"}
          </button>
        </div>
      </div>

      {timeline}
    </div>
  );
}

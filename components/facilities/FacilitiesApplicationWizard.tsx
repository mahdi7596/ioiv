"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState, useTransition } from "react";
import { AlertCircle, Building2, CalendarRange, CheckCircle2, Clock, Download, History, Loader2, MessageSquareWarning, Search, Upload, Wallet, type LucideIcon } from "lucide-react";

import { StepIndicator } from "@/components/application/StepIndicator";
import { showToast } from "@/components/ui/toast";
import { createFacilitiesDraft, ensureFacilitiesApplicationSlot, saveFacilitiesDraftDetails, updateFacilitiesApplicationDetails } from "@/lib/actions/facilities-application";
import { startFacilitiesPayment, submitFacilitiesApplication } from "@/lib/actions/facilities-payment";

function formatRial(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";
  const [integerPart, ...rest] = String(value).split(".");
  const grouped = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return rest.length ? `${grouped}.${rest.join(".")}` : grouped;
}

type DocItem = readonly [key: string, label: string, required: boolean];

const documentGroups: { title: string; items: DocItem[] }[] = [
  {
    title: "اسناد مالی و مالیاتی",
    items: [
      ["tax-1404", "اظهارنامه مالیاتی ۱۴۰۴", true],
      ["financial-1404", "صورت مالی حسابرسی‌شده ۱۴۰۴", true],
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

const editSteps = ["مشخصات درخواست", "مدارک درخواست", "اطلاعات تکمیلی", "تأیید و ارسال"];

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
  pending: { tone: "pending", title: "در انتظار نتیجه پرداخت", description: "نتیجه پرداخت هنوز مشخص نیست؛ کمی بعد دوباره صفحه را بررسی کنید." },
};

const statusLabels: Record<string, string> = {
  DRAFT: "پیش‌نویس",
  PENDING_PAYMENT: "در انتظار پرداخت",
  SUBMITTED: "در صف بررسی",
  UNDER_REVIEW: "در حال بررسی",
  NEEDS_EDIT: "نیازمند اصلاح",
  VALIDATION_COMPLETED: "پایان فرآیند اعتبارسنجی",
};

type DocStatus = { state: "uploading" | "done" | "error"; name?: string; error?: string };

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
          {status?.state === "done" ? "تغییر فایل" : "انتخاب فایل"}
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
          <span className="document-list__status document-list__status--uploading">
            <Loader2 aria-hidden="true" size={15} className="spin" />
            در حال بررسی…
          </span>
        ) : status?.state === "done" ? (
          <span className="document-list__status document-list__status--done">
            <CheckCircle2 aria-hidden="true" size={15} />
            <span className="document-list__filename">{status.name || "ثبت شد"}</span>
          </span>
        ) : status?.state === "error" ? (
          <span className="document-list__status document-list__status--error">
            <AlertCircle aria-hidden="true" size={15} />
            {status.error || "خطا"}
          </span>
        ) : (
          <span className="member-doc__hint">حداکثر ۲۵ مگابایت</span>
        )}
      </div>
    </div>
  );
}

export function FacilitiesApplicationWizard({ data, notice }: { data: any; notice?: string }) {
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
  const [attachmentCount, setAttachmentCount] = useState(() =>
    (data.applications[0]?.fileBindings || []).filter((binding: any) => bindingReady(binding) && binding.slotKey.startsWith("questionnaire-attachment-")).length
  );
  const [intakeId, setIntakeId] = useState(data.intakes[0]?.id || "");
  const intake = useMemo(() => data.intakes.find((item: any) => item.id === intakeId), [data.intakes, intakeId]);
  const [supplierId, setSupplierId] = useState(intake?.supplierConfigurations[0]?.id || "");
  const [app, setApp] = useState(data.applications[0] || null);
  const [amount, setAmount] = useState(data.applications[0]?.requestedAmountRial || "");
  const [type, setType] = useState(data.applications[0]?.facilityType || "FIXED_CAPITAL");
  const insuranceEvidence = data.applications[0]?.evidence?.find((item: any) => item.kind === "insurance");
  const boardEvidence = data.applications[0]?.evidence?.find((item: any) => item.kind === "credit-board");
  const [employeeCount, setEmployeeCount] = useState(String(insuranceEvidence?.employeeCount ?? 0));
  const [boardOfficerId, setBoardOfficerId] = useState(boardEvidence?.officerId || "");
  const [confirmed, setConfirmed] = useState(false);
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);

  const paymentEnabled = Boolean(app?.paymentEnabledSnapshot);
  const activePayment = app?.payments?.find((payment: any) => ["INITIATED", "REDIRECT_READY", "PENDING", "TIMED_OUT"].includes(payment.status));
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
    if (!attachment) setDocStatus((current) => ({ ...current, [slotKey]: { state: "uploading" } }));
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
      if (!attachment) setDocStatus((current) => ({ ...current, [slotKey]: { state: "error", error: message } }));
      showToast({ type: "error", message });
    } finally {
      setUploading(false);
    }
  }

  if (!app) {
    if (!data.intakes.length) return <div className="panel" role="status">در حال حاضر دوره یا تأمین‌کننده واجد شرایطی برای درخواست وجود ندارد.</div>;
    const selectedSupplier = intake.supplierConfigurations.find((item: any) => item.id === supplierId);
    return (
      <form className="panel profile-form" onSubmit={(event) => { event.preventDefault(); run(() => createFacilitiesDraft({ intakeId, intakeSupplierId: supplierId, facilityType: type as any, requestedAmountRial: amount })); }}>
        <div>
          <h2>شروع درخواست</h2>
          <p className="panel-intro">دوره فراخوان، تأمین‌کننده و مبلغ مورد نیاز خود را مشخص کنید تا پیش‌نویس درخواست ساخته شود.</p>
        </div>
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
              <input dir="ltr" required inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} />
              <small>سقف قابل درخواست در این دوره: {formatRial(intake.maximumAmountRial)} ریال</small>
            </label>
          </div>
        </section>
        <button className="button button--primary" disabled={pending || !supplierId}>ایجاد پیش‌نویس</button>
      </form>
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
                  {item.note ? <p className="facilities-timeline__note">{item.note}</p> : null}
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
  if (app.status === "PENDING_PAYMENT") return <div className="profile-form"><StatusNotice tone="pending" title="در انتظار نتیجه پرداخت" description={activePayment?.status === "TIMED_OUT" ? "نتیجه پرداخت هنوز از درگاه دریافت نشده است." : "پس از مشخص شدن نتیجه پرداخت، این صفحه را دوباره بررسی کنید."} />{timeline}</div>;

  const officers = app.officers?.filter((officer: any) => !officer.isChiefExecutive) || [];
  const showPaymentConfirm = paymentEnabled && app.status !== "NEEDS_EDIT";

  function scrollToTop() {
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Auto-save the current step's data. Returns false if the server rejected it
  // (e.g. validation) so navigation can stay put. Uploads on step 2 already
  // persist on their own, so only steps 1 and 3 carry field data.
  async function persistStep(target: number): Promise<boolean> {
    try {
      let result: any = null;
      if (target === 1) result = await updateFacilitiesApplicationDetails({ applicationId: app.id, facilityType: type as any, requestedAmountRial: amount });
      else if (target === 3) {
        // The server requires a valid non-CEO board member, so only auto-save
        // once one is selected. Otherwise let the user move on without a
        // confusing validation error — the final submit still enforces it.
        if (!boardOfficerId) return true;
        result = await saveFacilitiesDraftDetails({ applicationId: app.id, employeeCount: Number(employeeCount), boardOfficerId });
      } else return true;
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

  const missingRequiredDocs = requiredDocKeys.filter((key) => docStatus[key]?.state !== "done");

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
      if (step === 1 || (step === 3 && boardOfficerId)) showToast({ type: "success", message: "اطلاعات به‌صورت خودکار ذخیره شد" });
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
      {app.status === "NEEDS_EDIT" && latestCorrection ? <section className="panel review-message" role="alert"><p className="eyebrow">اقدام لازم</p><h2>موارد درخواستی کارشناس</h2><p>{latestCorrection.note}</p></section> : null}

      <div className="panel wizard">
        <div className="wizard__progress">
          <StepIndicator currentStep={step} totalSteps={editSteps.length} title={editSteps[step - 1]} />
        </div>

        <section className="wizard__body">
          <div className="wizard__step" key={step}>
            <h2>{editSteps[step - 1]}</h2>

            {step === 1 ? (
              <div className="stack">
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
                    <input dir="ltr" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} />
                    <small>سقف ثبت‌شده: {formatRial(app.maximumAmountRialSnapshot)} ریال</small>
                  </label>
                </div>
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
                  </section>
                ))}
                <section className="profile-list">
                  <h3 className="section-legend">پیوست‌های پرسشنامه (اختیاری)</h3>
                  <div className="member-doc">
                    <div className="member-doc__info">
                      <span className="member-doc__label">افزودن پیوست</span>
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
                </section>
              </div>
            ) : null}

            {step === 3 ? (
              <div className="stack">
                <div className="profile-grid">
                  <label>
                    <span className="field-label">تعداد کارکنان</span>
                    <input inputMode="numeric" value={employeeCount} onChange={(event) => setEmployeeCount(event.target.value)} />
                  </label>
                  <label>
                    <span className="field-label">عضو هیئت‌مدیره برای گزارش اعتباری<span className="field-required" aria-hidden="true">*</span></span>
                    <select value={boardOfficerId} disabled={!officers.length} onChange={(event) => setBoardOfficerId(event.target.value)}>
                      <option value="">{officers.length ? "انتخاب کنید" : "عضو هیئت‌مدیره‌ای ثبت نشده است"}</option>
                      {officers.map((officer: any) => <option key={officer.id} value={officer.id}>{officer.fullName} — {officer.position}</option>)}
                    </select>
                  </label>
                </div>
                {officers.length ? (
                  <p className="section-hint"><CheckCircle2 aria-hidden="true" size={15} />اطلاعات با رفتن به مرحله بعد به‌صورت خودکار ذخیره می‌شود.</p>
                ) : (
                  <div className="empty-note" role="note">
                    <span className="empty-note__icon" aria-hidden="true"><AlertCircle size={20} strokeWidth={2} /></span>
                    <div className="empty-note__body">
                      <p className="empty-note__title">هنوز عضو هیئت‌مدیره‌ای ثبت نشده است</p>
                      <p className="empty-note__desc">گزارش اعتباری به یک عضو هیئت‌مدیره (غیر از مدیرعامل) نیاز دارد. ابتدا اعضای هیئت‌مدیره را در پروفایل شرکت تکمیل کنید، سپس به این مرحله بازگردید.</p>
                      <a className="button button--ghost button--sm" href="/dashboard/facilities-profile">
                        <Building2 aria-hidden="true" size={15} strokeWidth={2} />
                        تکمیل پروفایل شرکت
                      </a>
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            {step === 4 ? (
              <div className="stack">
                <div className="detail-grid">
                  <div><span className="stat-label">نوع تسهیلات</span><p className="stat-value">{facilityTypeLabels[type] || type}</p></div>
                  <div><span className="stat-label">مبلغ درخواستی</span><p className="stat-value">{formatRial(amount)} ریال</p></div>
                  <div><span className="stat-label">تعداد کارکنان</span><p className="stat-value">{employeeCount || "—"}</p></div>
                </div>
                {!boardOfficerId ? (
                  <p className="final-review__notice">
                    برای ارسال، انتخاب «عضو هیئت‌مدیره برای گزارش اعتباری» در مرحله «اطلاعات تکمیلی» الزامی است.
                    {officers.length ? "" : " ابتدا اعضای هیئت‌مدیره را در پروفایل شرکت ثبت کنید."}
                  </p>
                ) : null}
                {showPaymentConfirm ? (
                  <label className="payment-acknowledgement">
                    <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
                    اطلاعات و مدارک را بررسی کرده‌ام و برای ادامه به پرداخت می‌روم.
                  </label>
                ) : null}
                <button
                  type="button"
                  className="button button--primary"
                  disabled={pending || uploading || !boardOfficerId || (showPaymentConfirm && !confirmed)}
                  onClick={() => run(() => app.status === "NEEDS_EDIT" ? submitFacilitiesApplication({ applicationId: app.id, employeeCount: Number(employeeCount), boardOfficerId }) : paymentEnabled ? startFacilitiesPayment({ applicationId: app.id, confirmed, employeeCount: Number(employeeCount), boardOfficerId }) : submitFacilitiesApplication({ applicationId: app.id, employeeCount: Number(employeeCount), boardOfficerId }))}
                >
                  {app.status === "NEEDS_EDIT" ? "ارسال اصلاحات" : paymentEnabled ? "تأیید و ورود به پرداخت" : "ارسال نهایی درخواست"}
                </button>
                <p className="section-hint">{app.status === "NEEDS_EDIT" ? "ارسال اصلاحات هزینه دیگری ندارد و پرونده را به صف بررسی بازمی‌گرداند." : paymentEnabled ? "پس از تأیید موفق پرداخت، درخواست به‌صورت خودکار ارسال می‌شود." : "پس از بررسی نهایی سرور، درخواست ارسال می‌شود."}</p>
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

"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState, useTransition } from "react";

import { showToast } from "@/components/ui/toast";
import { createFacilitiesDraft, ensureFacilitiesApplicationSlot, saveFacilitiesDraftDetails, updateFacilitiesApplicationDetails } from "@/lib/actions/facilities-application";
import { startFacilitiesPayment, submitFacilitiesApplication } from "@/lib/actions/facilities-payment";

const documents = [
  ["tax-1404", "اظهارنامه مالیاتی ۱۴۰۴"],
  ["financial-1404", "صورت مالی حسابرسی‌شده ۱۴۰۴"],
  ["insurance", "لیست بیمه"],
  ["trial-general", "تراز کل ۱۴۰۵"],
  ["trial-subsidiary", "تراز معین ۱۴۰۵"],
  ["credit-company", "گزارش اعتباری شرکت"],
  ["credit-ceo", "گزارش اعتباری مدیرعامل"],
  ["credit-board", "گزارش اعتباری عضو هیئت‌مدیره"],
  ["questionnaire", "پرسشنامه تکمیل‌شده (فقط Word)"],
  ["licences", "مجوزها و گواهی‌ها (ZIP)"],
  ["active-contracts", "قراردادهای فعال (ZIP)"],
  ["vat-1404", "ارزش افزوده ۱۴۰۴ (ZIP)"],
  ["vat-1403", "ارزش افزوده ۱۴۰۳ (اختیاری، ZIP)"],
  ["vat-1402", "ارزش افزوده ۱۴۰۲ (اختیاری، ZIP)"],
] as const;

const paymentMessages: Record<string, string> = {
  success: "پرداخت با موفقیت تأیید شد و درخواست شما ارسال شد.",
  failed: "پرداخت انجام نشد. می‌توانید پس از بررسی اطلاعات دوباره تلاش کنید.",
  pending: "نتیجه پرداخت هنوز مشخص نیست. لطفاً کمی بعد دوباره صفحه را بررسی کنید.",
};

const statusLabels: Record<string, string> = {
  DRAFT: "پیش‌نویس",
  PENDING_PAYMENT: "در انتظار پرداخت",
  SUBMITTED: "در صف بررسی",
  UNDER_REVIEW: "در حال بررسی",
  NEEDS_EDIT: "نیازمند اصلاح",
  VALIDATION_COMPLETED: "پایان فرآیند اعتبارسنجی",
};

export function FacilitiesApplicationWizard({ data, notice }: { data: any; notice?: string }) {
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
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

  const paymentEnabled = Boolean(app?.paymentEnabledSnapshot);
  const activePayment = app?.payments?.find((payment: any) => ["INITIATED", "REDIRECT_READY", "PENDING", "TIMED_OUT"].includes(payment.status));
  const noticePanel = notice && paymentMessages[notice] ? <section className="panel" role="status">{paymentMessages[notice]}</section> : null;

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
      showToast({ type: "success", message: "فایل بررسی و ثبت شد" });
    } catch (error) {
      showToast({ type: "error", message: error instanceof Error ? error.message : "بارگذاری فایل ناموفق بود" });
    } finally {
      setUploading(false);
    }
  }

  if (!app) {
    if (!data.intakes.length) return <div className="panel" role="status">در حال حاضر دوره یا تأمین‌کننده واجد شرایطی برای درخواست وجود ندارد.</div>;
    return (
      <form className="panel profile-form" onSubmit={(event) => { event.preventDefault(); run(() => createFacilitiesDraft({ intakeId, intakeSupplierId: supplierId, facilityType: type as any, requestedAmountRial: amount })); }}>
        <h2>شروع درخواست</h2>
        <label>دوره<select value={intakeId} onChange={(event) => { setIntakeId(event.target.value); setSupplierId(data.intakes.find((item: any) => item.id === event.target.value)?.supplierConfigurations[0]?.id || ""); }}>{data.intakes.map((item: any) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        <label>تأمین‌کننده<select value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>{intake.supplierConfigurations.map((item: any) => <option value={item.id} key={item.id}>{item.supplier.name}</option>)}</select></label>
        {intake.supplierConfigurations.map((item: any) => item.id === supplierId ? <a className="button button--ghost" href={`/api/facilities/questionnaires/${item.questionnaireTemplateVersion.id}?intakeSupplierId=${item.id}`} key={item.id}>دانلود پرسشنامه، نسخه {item.questionnaireTemplateVersion.versionLabel}</a> : null)}
        <label>نوع تسهیلات<select value={type} onChange={(event) => setType(event.target.value)}><option value="FIXED_CAPITAL">سرمایه ثابت</option><option value="WORKING_CAPITAL">سرمایه در گردش</option></select></label>
        <label>مبلغ درخواستی (ریال)<input dir="ltr" required inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} /><small>سقف: {intake.maximumAmountRial} ریال</small></label>
        <button className="button button--primary" disabled={pending}>ایجاد پیش‌نویس</button>
      </form>
    );
  }

  const latestCorrection = app.correctionRequests?.find((item: any) => !item.resolvedAt);
  const timeline = (
    <section className="panel" aria-labelledby="facilities-history-heading">
      <h2 id="facilities-history-heading">سوابق وضعیت و اصلاحات</h2>
      {app.correctionRequests?.length ? <ol className="facilities-timeline">{app.correctionRequests.map((item: any) => <li key={item.id}><strong>اصلاح شماره {item.sequence}</strong><span>{new Date(item.openedAt).toLocaleString("fa-IR")} — {item.resolvedAt ? "ارسال‌شده" : "در انتظار اقدام"}</span><p>{item.note}</p></li>)}</ol> : <p>درخواست اصلاحی ثبت نشده است.</p>}
      {app.history?.length ? <ol className="facilities-timeline">{app.history.map((item: any) => <li key={item.id}><strong>{statusLabels[item.newStatus] || item.newStatus}</strong><span>{new Date(item.createdAt).toLocaleString("fa-IR")}</span>{item.note ? <p>{item.note}</p> : null}</li>)}</ol> : <p>هنوز سابقه‌ای ثبت نشده است.</p>}
    </section>
  );

  if (["SUBMITTED", "UNDER_REVIEW", "VALIDATION_COMPLETED"].includes(app.status)) return <div className="profile-form">{noticePanel}<section className="panel" role="status"><h2>{statusLabels[app.status]}</h2><p>{app.status === "SUBMITTED" ? "درخواست در صف بررسی مدیریت قرار دارد." : app.status === "UNDER_REVIEW" ? "کارشناس در حال بررسی اطلاعات و مدارک است." : "فرآیند اعتبارسنجی این درخواست پایان یافته است."}</p></section>{timeline}</div>;
  if (app.status === "PENDING_PAYMENT") return <div className="profile-form"><section className="panel" role="status"><h2>در انتظار نتیجه پرداخت</h2><p>{activePayment?.status === "TIMED_OUT" ? "نتیجه پرداخت هنوز از درگاه دریافت نشده است." : "پس از مشخص شدن نتیجه پرداخت، این صفحه را دوباره بررسی کنید."}</p></section>{timeline}</div>;

  const officers = app.officers?.filter((officer: any) => !officer.isChiefExecutive) || [];
  return (
    <div className="profile-form">
      {noticePanel}
      {app.status === "NEEDS_EDIT" && latestCorrection ? <section className="panel review-message" role="alert"><p className="eyebrow">اقدام لازم</p><h2>موارد درخواستی کارشناس</h2><p>{latestCorrection.note}</p></section> : null}
      <section className="panel">
        <h2>مشخصات درخواست</h2>
        <label>نوع تسهیلات<select value={type} onChange={(event) => setType(event.target.value)}><option value="FIXED_CAPITAL">سرمایه ثابت</option><option value="WORKING_CAPITAL">سرمایه در گردش</option></select></label>
        <label>مبلغ درخواستی (ریال)<input dir="ltr" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} /><small>سقف ثبت‌شده: {app.maximumAmountRialSnapshot} ریال</small></label>
        <button type="button" className="button button--ghost" disabled={pending || uploading} onClick={() => run(() => updateFacilitiesApplicationDetails({ applicationId: app.id, facilityType: type as any, requestedAmountRial: amount }))}>ذخیره مشخصات درخواست</button>
      </section>
      <section className="panel">
        <h2>مدارک درخواست</h2>
        <p role="status">هر فایل حداکثر ۲۵ مگابایت و مجموع مدارک حداکثر ۱۵۰ مگابایت است.</p>
        {documents.map(([key, label]) => <label className="profile-row" key={key}><span>{label}</span><input type="file" disabled={pending || uploading} accept={key === "questionnaire" ? ".doc,.docx" : key.startsWith("vat-") || ["licences", "active-contracts"].includes(key) ? ".zip" : ".pdf,.doc,.docx,.xls,.xlsx,.csv,.zip"} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(key, file); }} /></label>)}
        <label className="profile-row"><span>پیوست‌های پرسشنامه (اختیاری)</span><input type="file" multiple disabled={pending || uploading} accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.zip" onChange={(event) => { for (const file of Array.from(event.target.files || [])) void upload("questionnaire-attachment", file, true); }} /></label>
      </section>
      <section className="panel">
        <h2>اطلاعات تکمیلی</h2>
        <label>تعداد کارکنان<input inputMode="numeric" value={employeeCount} onChange={(event) => setEmployeeCount(event.target.value)} /></label>
        <label>عضو هیئت‌مدیره برای گزارش اعتباری<select value={boardOfficerId} onChange={(event) => setBoardOfficerId(event.target.value)}><option value="">انتخاب کنید</option>{officers.map((officer: any) => <option key={officer.id} value={officer.id}>{officer.fullName} — {officer.position}</option>)}</select></label>
        <button className="button button--ghost" disabled={pending || uploading} onClick={() => run(() => saveFacilitiesDraftDetails({ applicationId: app.id, employeeCount: Number(employeeCount), boardOfficerId }))}>ذخیره اطلاعات تکمیلی</button>
      </section>
      <section className="panel" aria-labelledby="facilities-final-heading">
        <h2 id="facilities-final-heading">تأیید و ارسال</h2>
        {paymentEnabled && app.status !== "NEEDS_EDIT" ? <label className="checkbox-row"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />اطلاعات و مدارک را بررسی کرده‌ام و برای ادامه به پرداخت می‌روم.</label> : null}
        <button className="button button--primary" disabled={pending || uploading || (paymentEnabled && app.status !== "NEEDS_EDIT" && !confirmed)} onClick={() => run(() => app.status === "NEEDS_EDIT" ? submitFacilitiesApplication({ applicationId: app.id, employeeCount: Number(employeeCount), boardOfficerId }) : paymentEnabled ? startFacilitiesPayment({ applicationId: app.id, confirmed, employeeCount: Number(employeeCount), boardOfficerId }) : submitFacilitiesApplication({ applicationId: app.id, employeeCount: Number(employeeCount), boardOfficerId }))}>{app.status === "NEEDS_EDIT" ? "ارسال اصلاحات" : paymentEnabled ? "تأیید و ورود به پرداخت" : "ارسال نهایی درخواست"}</button>
        <p role="status">{app.status === "NEEDS_EDIT" ? "ارسال اصلاحات هزینه دیگری ندارد و پرونده را به صف بررسی بازمی‌گرداند." : paymentEnabled ? "پس از تأیید موفق پرداخت، درخواست به‌صورت خودکار ارسال می‌شود." : "پس از بررسی نهایی سرور، درخواست ارسال می‌شود."}</p>
      </section>
      {timeline}
    </div>
  );
}

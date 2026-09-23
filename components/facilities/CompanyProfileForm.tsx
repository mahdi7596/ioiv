"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, FileText, Loader2, Plus, Trash2, UploadCloud, UserCog, Users, Check, AlertCircle } from "lucide-react";
import { completeCompanyProfileForm, prepareCompanyProfileUpload, saveCompanyProfileForm } from "@/lib/actions/facilities-company-form";
import { showToast } from "@/components/ui/toast";
import { JalaliDatePicker } from "@/components/ui/JalaliDatePicker";
import { IRAN_PROVINCES } from "@/lib/data/iran-cities";
import { normalizeDigits, normalizedText, CEO_POSITION, isCeoRole } from "@/lib/validations/facilities-company";

async function receive<T>(request: Promise<{ ok: true; data: T } | { ok: false; error: string }>): Promise<T> {
  let result;
  try {
    result = await request;
  } catch {
    throw new Error("ارتباط با سرور برقرار نشد؛ اتصال اینترنت را بررسی و دوباره تلاش کنید.");
  }
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

type Person = { id?: string; fullName: string; nationalId?: string; ownershipPercentage?: string; position?: string };
type Draft = {
  version: number;
  name: string;
  nationalId: string;
  registrationNumber: string;
  registrationPlace: string;
  registrationDate: string;
  registeredCapitalRial: string;
  contactFullName: string;
  contactMobile: string;
  shareholders: Person[];
  officers: Person[];
};

type FieldErrors = Record<string, string>;
type UploadState = { status: "uploading" | "done" | "error"; fileName?: string; previousFileName?: string; message?: string };

const emptyDraft: Draft = {
  version: 0,
  name: "",
  nationalId: "",
  registrationNumber: "",
  registrationPlace: "",
  registrationDate: "",
  registeredCapitalRial: "",
  contactFullName: "",
  contactMobile: "",
  shareholders: [],
  officers: [],
};

type FieldSpec =
  | { type: "text"; key: keyof Draft; label: string; placeholder: string }
  | { type: "place"; label: string }
  | { type: "date"; label: string };

const fields: FieldSpec[] = [
  { type: "text", key: "name", label: "نام شرکت", placeholder: "مثلاً: شرکت نمونه صنعت" },
  { type: "text", key: "nationalId", label: "شناسه ملی", placeholder: "۱۰۱۲۳۴۵۶۷۸۹" },
  { type: "text", key: "registrationNumber", label: "شماره ثبت", placeholder: "مثلاً: ۱۲۳۴۵" },
  { type: "place", label: "محل ثبت" },
  { type: "date", label: "تاریخ ثبت" },
  { type: "text", key: "registeredCapitalRial", label: "سرمایه ثبت‌شده (ریال)", placeholder: "مثلاً: ۱۰۰۰۰۰۰۰۰۰" },
  { type: "text", key: "contactFullName", label: "نام و نام خانوادگی رابط", placeholder: "مثلاً: علی رضایی" },
  { type: "text", key: "contactMobile", label: "شماره همراه رابط", placeholder: "۰۹۱۲۳۴۵۶۷۸۹" },
];

const OFFICER_ROLES = ["مدیرعامل", "رئیس هیئت‌مدیره", "مدیرعامل و رئیس هیئت‌مدیره", "عضو هیئت‌مدیره", "عضو علی‌البدل هیئت‌مدیره"];
const BOARD_MEMBER_POSITION = "عضو هیئت‌مدیره";

const documentFields: Array<[string, string]> = [
  ["incorporation-notice", "آگهی تأسیس"],
  ["articles-of-association", "اساسنامه"],
  ["board-changes-gazette", "روزنامه رسمی تغییرات هیئت‌مدیره"],
  ["capital-increase-gazette", "روزنامه رسمی افزایش سرمایه"],
];

// Guarantees exactly one CEO among officers: if none is marked, the first row
// becomes CEO; extra CEO rows are demoted so the "exactly one" invariant holds.
function withCeoDefault(officers: Person[]): Person[] {
  if (!officers.length) return officers;
  if (!officers.some((officer) => isCeoRole(officer.position))) {
    return officers.map((officer, index) => (index === 0 ? { ...officer, position: CEO_POSITION } : officer));
  }
  let seen = false;
  return officers.map((officer) => {
    if (!isCeoRole(officer.position)) return officer;
    if (seen) return { ...officer, position: "" };
    seen = true;
    return officer;
  });
}

function initialDraft(initial: Draft | null): Draft {
  const base = initial ?? emptyDraft;
  // A credit report requires at least one board member besides the CEO, so a
  // fresh profile starts with both rows to make that expectation obvious.
  const officers = base.officers.length
    ? withCeoDefault(base.officers)
    : [{ fullName: "", position: CEO_POSITION }, { fullName: "", position: BOARD_MEMBER_POSITION }];
  return { ...base, officers };
}

function validateDraft(draft: Draft): FieldErrors {
  const errors: FieldErrors = {};
  const requireText = (key: keyof Draft, label: string) => {
    if (!String(draft[key] ?? "").trim()) errors[key] = `${label} الزامی است`;
  };

  requireText("name", "نام شرکت");

  const nationalId = normalizeDigits(String(draft.nationalId ?? "")).trim();
  if (!nationalId) errors.nationalId = "شناسه ملی الزامی است";
  else if (!/^\d{11}$/.test(nationalId)) errors.nationalId = "شناسه ملی باید ۱۱ رقم باشد";

  requireText("registrationNumber", "شماره ثبت");
  requireText("registrationPlace", "محل ثبت");
  requireText("registrationDate", "تاریخ ثبت");

  const capital = normalizeDigits(String(draft.registeredCapitalRial ?? "")).trim();
  if (!capital) errors.registeredCapitalRial = "سرمایه ثبت‌شده الزامی است";
  else if (!/^[1-9]\d*$/.test(capital)) errors.registeredCapitalRial = "سرمایه باید عدد صحیح مثبت باشد";

  requireText("contactFullName", "نام و نام خانوادگی رابط");

  const contactMobile = normalizeDigits(String(draft.contactMobile ?? "")).trim();
  if (!contactMobile) errors.contactMobile = "شماره همراه رابط الزامی است";
  else if (!/^09\d{9}$/.test(contactMobile)) errors.contactMobile = "شماره همراه باید با ۰۹ شروع شود و ۱۱ رقم باشد";

  draft.shareholders.forEach((person, index) => {
    if (!person.fullName?.trim()) errors[`shareholders.${index}.fullName`] = "مشخصات شخص حقیقی یا حقوقی الزامی است";
    const nationalId = normalizeDigits(String(person.nationalId ?? "")).trim();
    if (!nationalId) errors[`shareholders.${index}.nationalId`] = "کد ملی یا شناسه ملی الزامی است";
    else if (!/^\d{10}$|^\d{11}$/.test(nationalId)) errors[`shareholders.${index}.nationalId`] = "کد ملی (۱۰ رقم) یا شناسه ملی (۱۱ رقم) وارد کنید";
    const pct = normalizeDigits(String(person.ownershipPercentage ?? "")).trim();
    if (!pct) errors[`shareholders.${index}.second`] = "درصد مالکیت الزامی است";
    else if (!(Number(pct) > 0 && Number(pct) <= 100)) errors[`shareholders.${index}.second`] = "درصد باید بین ۰ تا ۱۰۰ باشد";
  });

  draft.officers.forEach((person, index) => {
    if (!person.fullName?.trim()) errors[`officers.${index}.fullName`] = "نام عضو الزامی است";
    if (!person.position?.trim()) errors[`officers.${index}.second`] = "سمت الزامی است";
  });

  const ceoCount = draft.officers.filter((person) => isCeoRole(person.position)).length;
  const boardMemberCount = draft.officers.filter((person) => {
    const role = normalizedText(person.position ?? "");
    return role !== "" && !isCeoRole(person.position);
  }).length;
  if (!draft.officers.length) errors["officers.section"] = "افزودن مدیرعامل و حداقل یک عضو هیئت‌مدیره الزامی است";
  else if (ceoCount === 0) errors["officers.section"] = "یک نفر را به‌عنوان مدیرعامل انتخاب کنید";
  else if (ceoCount > 1) errors["officers.section"] = "فقط یک نفر می‌تواند مدیرعامل باشد";
  else if (boardMemberCount === 0) errors["officers.section"] = "افزودن حداقل یک عضو هیئت‌مدیره (غیر از مدیرعامل) برای گزارش اعتباری الزامی است";

  return errors;
}

function FieldError({ message }: { message?: string }) {
  return (
    <span className="field-error" role={message ? "alert" : undefined} data-visible={message ? "true" : "false"}>
      <span className="field-error__inner">{message ?? ""}</span>
    </span>
  );
}

export function CompanyProfileForm({ initial, documents, locked = false, correctionMode = false }: { initial: Draft | null; documents?: Record<string, { fileName: string }>; locked?: boolean; correctionMode?: boolean }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() => initialDraft(initial));
  const [pending, start] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [uploads, setUploads] = useState<Record<string, UploadState>>(() =>
    Object.fromEntries(Object.entries(documents ?? {}).map(([slot, doc]) => [slot, { status: "done", fileName: doc.fileName } as UploadState]))
  );

  const clearError = (key: string) =>
    setFieldErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });

  const update = (key: keyof Draft, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
    clearError(key);
  };

  function runValidation(): boolean {
    const errors = validateDraft(draft);
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      setFormError("لطفاً خطاهای مشخص‌شده در فرم را برطرف کنید.");
      showToast({ type: "error", message: "برخی فیلدها نیاز به اصلاح دارند" });
      return false;
    }
    setFormError(null);
    return true;
  }

  // Merge the server's saved version and freshly created officer ids back into
  // the draft (matched by order), so each member's ZIP upload activates in place
  // right after saving — no page reload needed.
  function mergeSaved(current: Draft, company: { profileVersion: number; officers?: { id: string }[] }): Draft {
    return {
      ...current,
      version: company.profileVersion,
      officers: company.officers
        ? current.officers.map((officer, index) => ({ ...officer, id: company.officers![index]?.id ?? officer.id }))
        : current.officers,
    };
  }

  async function save() {
    if (!runValidation()) return;
    start(async () => {
      try {
        const company = await receive(saveCompanyProfileForm(draft));
        setDraft((current) => mergeSaved(current, company));
        setFormError(null);
        showToast({ type: "success", message: "پیش‌نویس ذخیره شد" });
      } catch (e) {
        const message = e instanceof Error ? e.message : "ذخیره ناموفق بود";
        setFormError(message);
        showToast({ type: "error", message });
      }
    });
  }

  async function upload(kind: string, officerId?: string) {
    const slot = officerId ? `officer-${officerId}` : kind;
    try {
      const binding = await receive(prepareCompanyProfileUpload(kind, officerId));
      const picker = document.createElement("input");
      picker.type = "file";
      picker.accept = officerId ? ".zip" : ".pdf,.doc,.docx,.xls,.xlsx,.csv,.zip,.jpg,.jpeg,.png,.webp,.heic,.heif";
      picker.onchange = async () => {
        const file = picker.files?.[0];
        if (!file) return;
        setUploads((current) => ({ ...current, [slot]: { status: "uploading", fileName: file.name, previousFileName: current[slot]?.status === "done" ? current[slot]?.fileName : current[slot]?.previousFileName } }));
        try {
          const body = new FormData();
          body.set("bindingId", binding.id);
          body.set("idempotencyKey", crypto.randomUUID().replaceAll("-", ""));
          body.set("file", file);
          const response = await fetch("/api/facilities/profile-files", { method: "POST", body });
          const data = await response.json().catch(() => ({}));
          if (!response.ok || data.lifecycleStatus !== "PASSED") throw new Error(data.error || "فایل هنوز قابل استفاده نیست");
          setUploads((current) => ({ ...current, [slot]: { status: "done", fileName: file.name } }));
          showToast({ type: "success", message: "مدرک با موفقیت بررسی و ثبت شد" });
        } catch (err) {
          const message = err instanceof Error ? err.message : "بارگذاری ناموفق بود";
          setUploads((current) => ({ ...current, [slot]: { status: "error", fileName: file.name, message, previousFileName: current[slot]?.previousFileName } }));
          showToast({ type: "error", message });
        }
      };
      picker.click();
    } catch (e) {
      const message = e instanceof Error ? e.message : "بارگذاری ناموفق بود";
      setUploads((current) => ({ ...current, [slot]: { status: "error", message, previousFileName: current[slot]?.status === "done" ? current[slot]?.fileName : current[slot]?.previousFileName } }));
      showToast({ type: "error", message });
    }
  }

  // A member's identity ZIP is stored against that member's saved record, so a
  // brand-new row must be persisted (to mint its id) before its slot exists.
  // Do that transparently: save the draft, then open the picker for the new id —
  // no separate "activate upload" button. Validation errors surface as usual.
  function saveThenUploadOfficer(index: number) {
    if (!runValidation()) return;
    start(async () => {
      try {
        const company = await receive(saveCompanyProfileForm(draft));
        const merged = mergeSaved(draft, company);
        setDraft(merged);
        const officerId = merged.officers[index]?.id;
        if (!officerId) throw new Error("ذخیره ناموفق بود؛ دوباره تلاش کنید");
        setFormError(null);
        await upload("officer", officerId);
      } catch (e) {
        const message = e instanceof Error ? e.message : "ذخیره ناموفق بود";
        setFormError(message);
        showToast({ type: "error", message });
      }
    });
  }

  function personList(kind: "shareholders" | "officers") {
    const isOfficers = kind === "officers";
    const title = isOfficers ? "مدیرعامل و اعضای هیئت‌مدیره" : "سهام‌داران";
    const Icon = isOfficers ? UserCog : Users;
    const addLabel = isOfficers ? "افزودن عضو" : "افزودن سهام‌دار";

    const headingId = `${kind}-heading`;
    const sectionError = isOfficers ? fieldErrors["officers.section"] : undefined;
    return (
      <section className="profile-list" role="group" aria-labelledby={headingId}>
        <h3 className="section-legend" id={headingId}>
          <Icon aria-hidden="true" size={18} strokeWidth={2} />
          <span className="field-label">
            {title}<span className="field-required" aria-hidden="true">*</span>
          </span>
          <span className="section-legend__count">{draft[kind].length} نفر</span>
        </h3>
        {isOfficers ? (
          <p className="section-hint">سمت هر عضو را انتخاب کنید، سپس نامش را وارد کنید؛ یک نفر باید مدیرعامل و حداقل یک نفر عضو هیئت‌مدیره باشد (برای گزارش اعتباری تسهیلات لازم است).</p>
        ) : null}
        {sectionError ? (
          <p className="section-hint section-hint--error" role="alert">
            <AlertCircle aria-hidden="true" size={15} strokeWidth={2.2} />
            {sectionError}
          </p>
        ) : null}
        <div className="person-list">
          {draft[kind].map((item, index) => {
            const nameError = fieldErrors[`${kind}.${index}.fullName`];
            const nationalIdError = fieldErrors[`${kind}.${index}.nationalId`];
            const secondError = fieldErrors[`${kind}.${index}.second`];
            const officerUpload = isOfficers && item.id ? uploads[`officer-${item.id}`] : undefined;
            const currentRole = normalizedText(item.position ?? "");
            const roleOptions = currentRole && !OFFICER_ROLES.includes(currentRole) ? [currentRole, ...OFFICER_ROLES] : OFFICER_ROLES;
            const nameField = (
              <label className="person-row__field" key="name">
                <span>
                  {isOfficers ? "نام و نام خانوادگی" : "مشخصات شخص حقیقی یا حقوقی"}<span className="field-required" aria-hidden="true">*</span>
                </span>
                <input
                  placeholder={isOfficers ? "مثلاً: علی رضایی" : "مثلاً: علی رضایی یا شرکت نمونه"}
                  value={item.fullName}
                  aria-invalid={nameError ? true : undefined}
                  onChange={(e) => {
                    setDraft((d) => ({ ...d, [kind]: d[kind].map((x, i) => (i === index ? { ...x, fullName: e.target.value } : x)) }));
                    clearError(`${kind}.${index}.fullName`);
                  }}
                />
                <FieldError message={nameError} />
              </label>
            );
            const shareholderIdField = (
              <label className="person-row__field" key="nid">
                <span>
                  کد ملی یا شناسه ملی<span className="field-required" aria-hidden="true">*</span>
                </span>
                <input
                  placeholder="۱۲۳۴۵۶۷۸۹۰"
                  dir="ltr"
                  inputMode="numeric"
                  value={item.nationalId ?? ""}
                  aria-invalid={nationalIdError ? true : undefined}
                  onChange={(e) => {
                    setDraft((d) => ({ ...d, shareholders: d.shareholders.map((x, i) => (i === index ? { ...x, nationalId: e.target.value } : x)) }));
                    clearError(`shareholders.${index}.nationalId`);
                  }}
                />
                <FieldError message={nationalIdError} />
              </label>
            );
            const roleField = (
              <label className="person-row__field" key="role">
                <span>
                  سمت<span className="field-required" aria-hidden="true">*</span>
                </span>
                <select
                  value={currentRole}
                  data-placeholder={currentRole ? undefined : "true"}
                  aria-invalid={secondError ? true : undefined}
                  onChange={(e) => {
                    const role = e.target.value;
                    setDraft((d) => ({
                      ...d,
                      officers: d.officers.map((x, i) => {
                        if (i === index) return { ...x, position: role };
                        if (isCeoRole(role) && isCeoRole(x.position)) return { ...x, position: "" };
                        return x;
                      }),
                    }));
                    clearError(`officers.${index}.second`);
                    clearError("officers.section");
                  }}
                >
                  <option value="">انتخاب کنید</option>
                  {roleOptions.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
                <FieldError message={secondError} />
              </label>
            );
            const percentField = (
              <label className="person-row__field" key="pct">
                <span>
                  درصد مالکیت<span className="field-required" aria-hidden="true">*</span>
                </span>
                <input
                  placeholder="مثلاً: ۲۵"
                  inputMode="decimal"
                  value={item.ownershipPercentage}
                  aria-invalid={secondError ? true : undefined}
                  onChange={(e) => {
                    setDraft((d) => ({ ...d, shareholders: d.shareholders.map((x, i) => (i === index ? { ...x, ownershipPercentage: e.target.value } : x)) }));
                    clearError(`${kind}.${index}.second`);
                  }}
                />
                <FieldError message={secondError} />
              </label>
            );
            return (
              <div className={`person-row${isOfficers ? "" : " person-row--shareholder"}`} key={item.id ?? index}>
                {isOfficers ? roleField : nameField}
                {isOfficers ? nameField : shareholderIdField}
                {isOfficers ? null : percentField}
                <div className="person-row__actions">
                  <button
                    type="button"
                    className="icon-button icon-button--danger"
                    title="حذف ردیف"
                    aria-label="حذف ردیف"
                    onClick={() => {
                      setDraft((d) => {
                        const next = d[kind].filter((_, i) => i !== index);
                        return { ...d, [kind]: isOfficers ? withCeoDefault(next) : next };
                      });
                      clearError("officers.section");
                    }}
                  >
                    <Trash2 aria-hidden="true" size={17} strokeWidth={2} />
                  </button>
                </div>
                {isOfficers ? (
                  <div className="member-doc" data-status={item.id ? officerUpload?.status : undefined}>
                    <div className="member-doc__info">
                      <span className="member-doc__label">
                        <FileText aria-hidden="true" size={16} strokeWidth={2} />
                        مدرک هویتی (یک فایل ZIP)<span className="field-required" aria-hidden="true">*</span>
                      </span>
                      <span className="member-doc__desc">
                        همهٔ این مدارک را در یک فایل ZIP فشرده کنید و بارگذاری نمایید: روی و پشت کارت ملی، صفحهٔ اول و صفحهٔ توضیحات شناسنامه، و رزومه.
                      </span>
                    </div>
                    {item.id ? (
                      <div className="member-doc__control">
                        {officerUpload && officerUpload.status !== "uploading" ? (
                          <span role={officerUpload.status === "error" ? "alert" : "status"} className={`document-list__status document-list__status--${officerUpload.status}`}>
                            {officerUpload.status === "done" ? (
                              <>
                                <Check aria-hidden="true" size={14} strokeWidth={2.6} />
                                <span className="document-list__filename">{officerUpload.fileName}</span>
                              </>
                            ) : (
                              <>
                                <AlertCircle aria-hidden="true" size={14} strokeWidth={2.2} />
                                <span className="document-list__error-text">{officerUpload.message}
                                {officerUpload.previousFileName ? <span className="document-list__previous-file">آخرین فایل ثبت‌شده: «<bdi>{officerUpload.previousFileName}</bdi>». برای دیدن وضعیت فعلی، صفحه را بازخوانی کنید.</span> : null}</span>
                              </>
                            )}
                          </span>
                        ) : null}
                        <button
                          type="button"
                          className="button button--ghost button--sm"
                          disabled={officerUpload?.status === "uploading"}
                          onClick={() => upload("officer", item.id)}
                        >
                          {officerUpload?.status === "uploading" ? (
                            <>
                              <Loader2 aria-hidden="true" size={15} strokeWidth={2.2} className="spin" />
                              در حال بارگذاری
                            </>
                          ) : officerUpload?.status === "done" ? (
                            "جایگزینی"
                          ) : (
                            <>
                              <UploadCloud aria-hidden="true" size={15} strokeWidth={2} />
                              بارگذاری ZIP
                            </>
                          )}
                        </button>
                      </div>
                    ) : (
                      <div className="member-doc__control">
                        <button
                          type="button"
                          className="button button--ghost button--sm"
                          disabled={pending}
                          onClick={() => saveThenUploadOfficer(index)}
                        >
                          {pending ? (
                            <>
                              <Loader2 aria-hidden="true" size={15} strokeWidth={2.2} className="spin" />
                              در حال ذخیره…
                            </>
                          ) : (
                            <>
                              <UploadCloud aria-hidden="true" size={15} strokeWidth={2} />
                              بارگذاری ZIP
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
          <button
            type="button"
            className="add-row-button"
            onClick={() =>
              setDraft((d) => {
                if (!isOfficers) return { ...d, shareholders: [...d.shareholders, { fullName: "", ownershipPercentage: "" }] };
                const hasCeo = d.officers.some((officer) => normalizedText(officer.position ?? "") === CEO_POSITION);
                return { ...d, officers: [...d.officers, { fullName: "", position: hasCeo ? "" : CEO_POSITION }] };
              })
            }
          >
            <Plus aria-hidden="true" size={16} strokeWidth={2.4} />
            {addLabel}
          </button>
        </div>
      </section>
    );
  }

  if (locked) {
    return (
      <div className="space-y-6">
        <section className="panel" role="status">
          <h2>پروفایل شرکت موقتاً قفل است</h2>
          <p>تا پایان پرداخت یا بررسی پرونده فعال، اطلاعات و مدارک پروفایل قابل تغییر نیست. اصلاحات درخواست تسهیلات را از صفحه همان پرونده انجام دهید.</p>
        </section>
      </div>
    );
  }

  // During a correction (application returned as NEEDS_EDIT) only the profile
  // documents may be replaced — field data stays frozen because it is already
  // snapshotted on the application. Reuse the same upload machinery; the final
  // "ارسال اصلاحات" happens back on the application page.
  if (correctionMode) {
    const infoRows: Array<[string, string]> = [
      ["نام شرکت", draft.name],
      ["شناسه ملی", draft.nationalId],
      ["شماره ثبت", draft.registrationNumber],
      ["محل ثبت", draft.registrationPlace],
      ["سرمایه ثبت‌شده (ریال)", draft.registeredCapitalRial],
      ["نام رابط", draft.contactFullName],
      ["شماره همراه رابط", draft.contactMobile],
    ];
    const documentControl = (slot: string, kind: string, officerId?: string) => {
      const state = uploads[slot];
      const uploading = state?.status === "uploading";
      return (
        <div className="member-doc__control">
          {state && !uploading ? (
            <span role={state.status === "error" ? "alert" : "status"} className={`document-list__status document-list__status--${state.status}`}>
              {state.status === "done" ? (
                <>
                  <Check aria-hidden="true" size={14} strokeWidth={2.6} />
                  <span className="document-list__filename">{state.fileName}</span>
                </>
              ) : (
                <>
                  <AlertCircle aria-hidden="true" size={14} strokeWidth={2.2} />
                  <span className="document-list__error-text">{state.message}
                  {state.previousFileName ? <span className="document-list__previous-file">آخرین فایل ثبت‌شده: «<bdi>{state.previousFileName}</bdi>». برای دیدن وضعیت فعلی، صفحه را بازخوانی کنید.</span> : null}</span>
                </>
              )}
            </span>
          ) : null}
          <button type="button" className="button button--ghost button--sm" disabled={uploading} onClick={() => upload(kind, officerId)}>
            {uploading ? (
              <>
                <Loader2 aria-hidden="true" size={15} strokeWidth={2.2} className="spin" />
                در حال بارگذاری
              </>
            ) : state?.status === "done" ? (
              "جایگزینی"
            ) : (
              <>
                <UploadCloud aria-hidden="true" size={15} strokeWidth={2} />
                بارگذاری
              </>
            )}
          </button>
        </div>
      );
    };
    const officersWithId = draft.officers.filter((officer) => officer.id);
    return (
      <div className="space-y-6">
        <section className="panel review-message" role="status">
          <p className="eyebrow">اصلاح پرونده</p>
          <h2>بارگذاری مجدد مدارک پروفایل</h2>
          <p>پرونده تسهیلات شما نیازمند اصلاح است. در این حالت فقط مدارک پروفایل قابل جایگزینی است؛ مورد خواسته‌شدهٔ کارشناس و دکمهٔ «ارسال اصلاحات» در «صفحهٔ درخواست تسهیلات» است. سایر اطلاعات شرکت تا پایان بررسی قابل تغییر نیست.</p>
        </section>
        <div className="panel profile-form">
          <section className="profile-list" role="group" aria-labelledby="correction-info-heading">
            <h3 className="section-legend" id="correction-info-heading">
              <Building2 aria-hidden="true" size={18} strokeWidth={2} />
              اطلاعات ثبتی شرکت
            </h3>
            <div className="profile-grid">
              {infoRows.map(([label, value]) => (
                <div className="profile-row" key={label}>
                  <span className="field-label">{label}</span>
                  <strong>{value || "—"}</strong>
                </div>
              ))}
            </div>
          </section>
          <section className="profile-list" role="group" aria-labelledby="correction-docs-heading">
            <h3 className="section-legend" id="correction-docs-heading">
              <FileText aria-hidden="true" size={18} strokeWidth={2} />
              مدارک شرکت
            </h3>
            <ul className="document-list">
              {documentFields.map(([kind, label]) => (
                <li className="document-list__item" key={kind} data-status={uploads[kind]?.status}>
                  <span className="document-list__label">
                    <FileText aria-hidden="true" size={17} strokeWidth={2} />
                    {label}<span className="field-required" aria-hidden="true">*</span>
                  </span>
                  {documentControl(kind, kind)}
                </li>
              ))}
            </ul>
          </section>
          {officersWithId.length ? (
            <section className="profile-list" role="group" aria-labelledby="correction-officer-docs-heading">
              <h3 className="section-legend" id="correction-officer-docs-heading">
                <UserCog aria-hidden="true" size={18} strokeWidth={2} />
                مدارک هویتی اعضا
              </h3>
              <ul className="document-list">
                {officersWithId.map((officer) => (
                  <li className="document-list__item" key={officer.id} data-status={uploads[`officer-${officer.id}`]?.status}>
                    <span className="document-list__label">
                      <FileText aria-hidden="true" size={17} strokeWidth={2} />
                      {(officer.fullName?.trim() || "عضو")} — بستهٔ هویتی (ZIP)
                    </span>
                    {documentControl(`officer-${officer.id}`, "officer", officer.id)}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <form className="panel profile-form" onSubmit={(e) => { e.preventDefault(); save(); }} noValidate>
        {formError ? <div role="alert" className="form-error">{formError}</div> : null}
        <section className="profile-list" role="group" aria-labelledby="company-info-heading">
          <h3 className="section-legend" id="company-info-heading">
            <Building2 aria-hidden="true" size={18} strokeWidth={2} />
            اطلاعات ثبتی شرکت
          </h3>
          <div className="profile-grid">
            {fields.map((field) => {
              if (field.type === "date") {
                const error = fieldErrors.registrationDate;
                return (
                  <label key="registrationDate" data-invalid={error ? "true" : undefined}>
                    <span className="field-label">
                      {field.label}<span className="field-required" aria-hidden="true">*</span>
                    </span>
                    <JalaliDatePicker value={draft.registrationDate} onChange={(iso) => update("registrationDate", iso)} />
                    <FieldError message={error} />
                  </label>
                );
              }
              if (field.type === "place") {
                const error = fieldErrors.registrationPlace;
                return (
                  <label key="registrationPlace" data-invalid={error ? "true" : undefined}>
                    <span className="field-label">
                      {field.label}<span className="field-required" aria-hidden="true">*</span>
                    </span>
                    <select value={draft.registrationPlace} aria-invalid={error ? true : undefined} onChange={(e) => update("registrationPlace", e.target.value)}>
                      <option value="">انتخاب کنید</option>
                      {IRAN_PROVINCES.map((province) => (
                        <option key={province} value={province}>
                          {province}
                        </option>
                      ))}
                    </select>
                    <FieldError message={error} />
                  </label>
                );
              }
              const { key, label, placeholder } = field;
              const error = fieldErrors[key];
              return (
                <label key={key} data-invalid={error ? "true" : undefined}>
                  <span className="field-label">
                    {label}<span className="field-required" aria-hidden="true">*</span>
                  </span>
                  <input
                    value={draft[key] as string}
                    placeholder={placeholder}
                    dir={key.includes("Id") || key.includes("Capital") || key.includes("Mobile") ? "ltr" : undefined}
                    inputMode={key.includes("Id") || key.includes("Capital") || key.includes("Mobile") ? "numeric" : undefined}
                    aria-invalid={error ? true : undefined}
                    onChange={(e) => update(key, e.target.value)}
                  />
                  <FieldError message={error} />
                </label>
              );
            })}
          </div>
        </section>
        {personList("shareholders")}
        {personList("officers")}
        <section className="profile-list" role="group" aria-labelledby="documents-heading">
          <h3 className="section-legend" id="documents-heading">
            <FileText aria-hidden="true" size={18} strokeWidth={2} />
            مدارک شرکت
          </h3>
          <ul className="document-list">
            {documentFields.map(([kind, label]) => {
              const state = uploads[kind];
              const uploading = state?.status === "uploading";
              return (
                <li className="document-list__item" key={kind} data-status={state?.status}>
                  <span className="document-list__label">
                    <FileText aria-hidden="true" size={17} strokeWidth={2} />
                    {label}<span className="field-required" aria-hidden="true">*</span>
                  </span>
                  {state && !uploading ? (
                    <span role={state.status === "error" ? "alert" : "status"} className={`document-list__status document-list__status--${state.status}`}>
                      {state.status === "done" ? (
                        <>
                          <Check aria-hidden="true" size={14} strokeWidth={2.6} />
                          <span className="document-list__filename">{state.fileName}</span>
                        </>
                      ) : (
                        <>
                          <AlertCircle aria-hidden="true" size={14} strokeWidth={2.2} />
                          <span className="document-list__error-text">{state.message}
                  {state.previousFileName ? <span className="document-list__previous-file">آخرین فایل ثبت‌شده: «<bdi>{state.previousFileName}</bdi>». برای دیدن وضعیت فعلی، صفحه را بازخوانی کنید.</span> : null}</span>
                        </>
                      )}
                    </span>
                  ) : null}
                  <button className="button button--ghost button--sm" type="button" disabled={uploading} onClick={() => upload(kind)}>
                    {uploading ? (
                      <>
                        <Loader2 aria-hidden="true" size={15} strokeWidth={2.2} className="spin" />
                        در حال بارگذاری
                      </>
                    ) : state?.status === "done" ? (
                      "جایگزینی"
                    ) : (
                      "بارگذاری"
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
        <div className="sticky-actions">
          <button className="button button--ghost" disabled={pending}>ذخیره پیش‌نویس</button>
          <button
            type="button"
            className="button button--primary"
            disabled={pending}
            onClick={() => {
              if (!runValidation()) return;
              start(async () => {
                try {
                  const company = await receive(saveCompanyProfileForm(draft));
                  setDraft((current) => mergeSaved(current, company));
                  await receive(completeCompanyProfileForm({ version: company.profileVersion }));
                  setFormError(null);
                  showToast({ type: "success", message: "پروفایل شرکت کامل شد" });
                  router.push("/dashboard");
                } catch (e) {
                  const message = e instanceof Error ? e.message : "تکمیل ناموفق بود";
                  setFormError(message);
                  showToast({ type: "error", message });
                }
              });
            }}
          >
            تأیید تکمیل پروفایل
          </button>
        </div>
      </form>
    </div>
  );
}

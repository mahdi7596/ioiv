import { ChevronDown, Download, FileText } from "lucide-react";

type UploadedFile = {
  id: string;
  fieldKey: string;
  originalName: string;
  size: number;
  createdAt: Date;
};

type SubmissionFilesProps = {
  files: UploadedFile[];
  taxDeclarations: unknown;
  financials: unknown;
};

type FileDisplay = {
  file: UploadedFile;
  fieldLabel: string;
  year?: string;
  requiresYear?: boolean;
  rawFieldKey?: string;
};

type FileGroup = {
  key: string;
  title: string;
  items: FileDisplay[];
};

const numberFormatter = new Intl.NumberFormat("fa-IR", {
  maximumFractionDigits: 1,
});

function asYearRows(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value.map((row) => {
    if (!row || typeof row !== "object" || !("year" in row)) return undefined;
    const year = (row as { year?: unknown }).year;
    return typeof year === "string" && year.trim() ? year : undefined;
  });
}

function formatFileSize(size: number) {
  if (size < 1024) return `${numberFormatter.format(size)} بایت`;
  if (size < 1024 * 1024) return `${numberFormatter.format(size / 1024)} کیلوبایت`;
  return `${numberFormatter.format(size / 1024 / 1024)} مگابایت`;
}

function pushGroupItem(groups: FileGroup[], key: string, item: FileDisplay) {
  groups.find((group) => group.key === key)?.items.push(item);
}

function buildGroups(
  files: UploadedFile[],
  taxDeclarations: unknown,
  financials: unknown,
): FileGroup[] {
  const taxYears = asYearRows(taxDeclarations);
  const financialYears = asYearRows(financials);
  const groups: FileGroup[] = [
    { key: "taxDeclarations", title: "اظهارنامه‌های مالیاتی", items: [] },
    { key: "financials", title: "صورت‌های مالی حسابرسی‌شده", items: [] },
    { key: "humanResources", title: "منابع انسانی", items: [] },
    { key: "trialBalance", title: "تراز آزمایشی", items: [] },
    { key: "creditReports", title: "گزارش‌های اعتبارسنجی", items: [] },
    { key: "other", title: "سایر فایل‌ها", items: [] },
  ];

  for (const file of files) {
    const taxMatch = /^taxDeclarations\.(\d+)\.file$/.exec(file.fieldKey);
    if (taxMatch) {
      const rowNumber = Number(taxMatch[1]) + 1;
      pushGroupItem(groups, "taxDeclarations", {
        file,
        fieldLabel: `اظهارنامه مالیاتی ردیف ${numberFormatter.format(rowNumber)}`,
        year: taxYears[Number(taxMatch[1])],
        requiresYear: true,
      });
      continue;
    }

    const financialMatch = /^financials\.(\d+)\.file$/.exec(file.fieldKey);
    if (financialMatch) {
      const rowNumber = Number(financialMatch[1]) + 1;
      pushGroupItem(groups, "financials", {
        file,
        fieldLabel: `صورت مالی ردیف ${numberFormatter.format(rowNumber)}`,
        year: financialYears[Number(financialMatch[1])],
        requiresYear: true,
      });
      continue;
    }

    if (file.fieldKey === "trialBalance.generalLedger") {
      pushGroupItem(groups, "trialBalance", { file, fieldLabel: "تراز کل" });
      continue;
    }

    if (file.fieldKey === "humanResources.insuranceList") {
      pushGroupItem(groups, "humanResources", { file, fieldLabel: "لیست بیمه" });
      continue;
    }

    if (file.fieldKey === "trialBalance.subsidiaryLedger") {
      pushGroupItem(groups, "trialBalance", { file, fieldLabel: "تراز معین" });
      continue;
    }

    if (file.fieldKey === "creditReports.company") {
      pushGroupItem(groups, "creditReports", { file, fieldLabel: "گزارش اعتبارسنجی شرکت" });
      continue;
    }

    if (file.fieldKey === "creditReports.ceo") {
      pushGroupItem(groups, "creditReports", { file, fieldLabel: "گزارش اعتبارسنجی مدیرعامل" });
      continue;
    }

    if (file.fieldKey === "creditReports.boardMember") {
      pushGroupItem(groups, "creditReports", { file, fieldLabel: "گزارش اعتبارسنجی عضو هیات مدیره" });
      continue;
    }

    pushGroupItem(groups, "other", {
      file,
      fieldLabel: "فیلد ناشناخته",
      rawFieldKey: file.fieldKey,
    });
  }

  return groups.filter((group) => group.items.length > 0);
}

export function SubmissionFiles({
  files,
  taxDeclarations,
  financials,
}: SubmissionFilesProps) {
  const groups = buildGroups(files, taxDeclarations, financials);

  if (files.length === 0) {
    return <p className="empty-state">فایلی ثبت نشده است.</p>;
  }

  return (
    <div className="file-groups">
      {groups.map((group) => (
        <details key={group.key} className="file-group" open>
          <summary className="file-group__header">
            <h3 id={`file-group-${group.key}`}>{group.title}</h3>
            <span className="file-group__summary-meta">
              <span>{numberFormatter.format(group.items.length)} فایل</span>
              <ChevronDown aria-hidden="true" size={18} strokeWidth={2} />
            </span>
          </summary>
          <div className="file-list">
            {group.items.map((item) => (
              <article key={item.file.id} className="file-item">
                <div>
                  <span className="file-item__field">
                    <FileText aria-hidden="true" size={16} strokeWidth={2} />
                    {item.fieldLabel}
                  </span>
                  {item.requiresYear ? (
                    <span className="file-year" data-missing={item.year ? undefined : "true"}>
                      {item.year ? `سال ${item.year}` : "سال ثبت نشده"}
                    </span>
                  ) : null}
                  <span className="file-item__name">{item.file.originalName}</span>
                  <div className="file-item__meta">
                    <span>{formatFileSize(item.file.size)}</span>
                    <span>{item.file.createdAt.toLocaleDateString("fa-IR")}</span>
                    {item.rawFieldKey ? <span dir="ltr">{item.rawFieldKey}</span> : null}
                  </div>
                </div>
                <a
                  className="button button--ghost"
                  href={`/api/files/${item.file.id}`}
                  aria-label={`دانلود ${item.file.originalName}`}
                >
                  <Download aria-hidden="true" size={17} strokeWidth={2} />
                  دانلود
                </a>
              </article>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}

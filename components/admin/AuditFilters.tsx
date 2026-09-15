"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { JalaliDatePicker } from "@/components/ui/JalaliDatePicker";

export type AuditFiltersValue = {
  from?: string;
  to?: string;
  action?: string;
  outcome?: string;
  actorType?: string;
  applicationId?: string;
  entityId?: string;
  requestId?: string;
};

type AuditFiltersProps = {
  initial: AuditFiltersValue;
  actionOptions: string[];
  outcomeOptions: string[];
  actorTypeOptions: string[];
  actionLabels: Record<string, string>;
  outcomeLabels: Record<string, string>;
  actorLabels: Record<string, string>;
};

function buildAuditUrl(filters: AuditFiltersValue) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }

  const query = params.toString();
  return query ? `/admin/facilities/audit?${query}` : "/admin/facilities/audit";
}

export function AuditFilters({
  initial,
  actionOptions,
  outcomeOptions,
  actorTypeOptions,
  actionLabels,
  outcomeLabels,
  actorLabels,
}: AuditFiltersProps) {
  const router = useRouter();
  const [filters, setFilters] = useState<AuditFiltersValue>(initial);
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof AuditFiltersValue>(key: K, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value || undefined }));
  }

  function applyFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(() => {
      router.replace(buildAuditUrl(filters), { scroll: false });
    });
  }

  return (
    <form className="panel filters" onSubmit={applyFilters} aria-busy={isPending}>
      <label>
        از تاریخ
        <JalaliDatePicker value={filters.from || ""} onChange={(iso) => update("from", iso)} />
      </label>
      <label>
        تا تاریخ
        <JalaliDatePicker value={filters.to || ""} onChange={(iso) => update("to", iso)} />
      </label>
      <label>
        رویداد
        <select value={filters.action || ""} onChange={(e) => update("action", e.target.value)}>
          <option value="">همه</option>
          {actionOptions.map((value) => (
            <option key={value} value={value}>
              {actionLabels[value] || value}
            </option>
          ))}
        </select>
      </label>
      <label>
        نتیجه
        <select value={filters.outcome || ""} onChange={(e) => update("outcome", e.target.value)}>
          <option value="">همه</option>
          {outcomeOptions.map((value) => (
            <option key={value} value={value}>
              {outcomeLabels[value] || value}
            </option>
          ))}
        </select>
      </label>
      <label>
        نوع عامل
        <select value={filters.actorType || ""} onChange={(e) => update("actorType", e.target.value)}>
          <option value="">همه</option>
          {actorTypeOptions.map((value) => (
            <option key={value} value={value}>
              {actorLabels[value] || value}
            </option>
          ))}
        </select>
      </label>
      <label>
        شناسه پرونده
        <input dir="ltr" value={filters.applicationId || ""} onChange={(e) => update("applicationId", e.target.value)} />
      </label>
      <label>
        شناسه موجودیت
        <input dir="ltr" value={filters.entityId || ""} onChange={(e) => update("entityId", e.target.value)} />
      </label>
      <label>
        شناسه درخواست
        <input dir="ltr" value={filters.requestId || ""} onChange={(e) => update("requestId", e.target.value)} />
      </label>
      <button className="button button--primary" type="submit" disabled={isPending}>
        {isPending ? <Loader2 aria-hidden="true" size={16} className="spin" /> : null}
        اعمال فیلتر
      </button>
      <span className="sr-only" aria-live="polite">
        {isPending ? "در حال به‌روزرسانی فیلترها" : ""}
      </span>
    </form>
  );
}

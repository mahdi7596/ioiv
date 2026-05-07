"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";

type SubmissionsFiltersProps = {
  q?: string;
  status?: string;
  sort?: string;
};

function buildSubmissionsUrl(params: SubmissionsFiltersProps) {
  const nextParams = new URLSearchParams();

  if (params.q?.trim()) nextParams.set("q", params.q.trim());
  if (params.status) nextParams.set("status", params.status);
  if (params.sort && params.sort !== "newest") nextParams.set("sort", params.sort);

  const query = nextParams.toString();
  return query ? `/admin/submissions?${query}` : "/admin/submissions";
}

export function SubmissionsFilters({
  q = "",
  status = "",
  sort = "newest",
}: SubmissionsFiltersProps) {
  const router = useRouter();
  const [search, setSearch] = useState(q);
  const [selectedStatus, setSelectedStatus] = useState(status);
  const [selectedSort, setSelectedSort] = useState(sort || "newest");
  const [isPending, startTransition] = useTransition();

  const replaceQuery = useCallback(
    (next: SubmissionsFiltersProps) => {
      startTransition(() => {
        router.replace(buildSubmissionsUrl(next), { scroll: false });
      });
    },
    [router],
  );

  useEffect(() => {
    if (search === q) return;

    const timeout = window.setTimeout(() => {
      replaceQuery({ q: search, status: selectedStatus, sort: selectedSort });
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [q, replaceQuery, search, selectedSort, selectedStatus]);

  return (
    <form className="panel submissions-filters" role="search" aria-label="فیلتر پرونده‌ها">
      <div className="field">
        <label htmlFor="admin-submission-search">جستجو</label>
        <input
          id="admin-submission-search"
          name="q"
          value={search}
          placeholder="موبایل، شناسه ملی شرکت یا کد ملی"
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="admin-submission-status">وضعیت</label>
        <select
          id="admin-submission-status"
          name="status"
          value={selectedStatus}
          onChange={(event) => {
            const nextStatus = event.target.value;
            setSelectedStatus(nextStatus);
            replaceQuery({ q: search, status: nextStatus, sort: selectedSort });
          }}
        >
          <option value="">همه وضعیت‌ها</option>
          <option value="SUBMITTED">در صف بررسی</option>
          <option value="UNDER_REVIEW">در حال بررسی</option>
          <option value="NEEDS_EDIT">نیازمند اصلاح</option>
          <option value="VALIDATION_COMPLETED">پایان فرآیند اعتبارسنجی</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="admin-submission-sort">مرتب‌سازی</label>
        <select
          id="admin-submission-sort"
          name="sort"
          value={selectedSort}
          onChange={(event) => {
            const nextSort = event.target.value;
            setSelectedSort(nextSort);
            replaceQuery({ q: search, status: selectedStatus, sort: nextSort });
          }}
        >
          <option value="newest">جدیدترین</option>
          <option value="oldest">قدیمی‌ترین</option>
        </select>
      </div>
      <span className="sr-only" aria-live="polite">
        {isPending ? "در حال به‌روزرسانی فیلترها" : ""}
      </span>
    </form>
  );
}

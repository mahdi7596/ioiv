import Link from "next/link";
import { StatusBadge } from "./StatusBadge";

type SubmissionRow = {
  id: string;
  mobile: string;
  companyNationalId: string;
  status: string;
  createdAt: Date;
  payments: { status: string; referenceId: string | null }[];
};

export function SubmissionsTable({ submissions }: { submissions: SubmissionRow[] }) {
  return (
    <div className="panel table-wrap">
      <table className="data-table text-sm">
        <thead className="bg-stone-50 text-stone-600">
          <tr>
            <th className="px-4 py-3 text-right">موبایل</th>
            <th className="px-4 py-3 text-right">شناسه ملی شرکت</th>
            <th className="px-4 py-3 text-right">وضعیت</th>
            <th className="px-4 py-3 text-right">پرداخت</th>
            <th className="px-4 py-3 text-right">تاریخ</th>
            <th className="px-4 py-3 text-right">جزئیات</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {submissions.map((submission) => (
            <tr key={submission.id}>
              <td className="px-4 py-3" dir="ltr">
                {submission.mobile}
              </td>
              <td className="px-4 py-3" dir="ltr">
                {submission.companyNationalId}
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={submission.status} />
              </td>
              <td className="px-4 py-3">{submission.payments[0]?.status || "ثبت نشده"}</td>
              <td className="px-4 py-3">{submission.createdAt.toLocaleDateString("fa-IR")}</td>
              <td className="px-4 py-3">
                <Link className="font-medium text-emerald-800" href={`/admin/submissions/${submission.id}`}>
                  مشاهده
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

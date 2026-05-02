import Link from "next/link";
import { Eye } from "lucide-react";
import { PaymentStatusBadge } from "./PaymentStatusBadge";
import { StatusBadge } from "./StatusBadge";

type SubmissionRow = {
  id: string;
  mobile: string;
  companyName: string | null;
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
            <th className="px-4 py-3 text-right">نام شرکت</th>
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
              <td className="px-4 py-3">
                {submission.companyName || "-"}
              </td>
              <td className="px-4 py-3" dir="ltr">
                {submission.companyNationalId}
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={submission.status} />
              </td>
              <td className="px-4 py-3">
                <PaymentStatusBadge status={submission.payments[0]?.status} />
              </td>
              <td className="px-4 py-3">{submission.createdAt.toLocaleDateString("fa-IR")}</td>
              <td className="px-4 py-3">
                <Link
                  className="icon-button"
                  href={`/admin/submissions/${submission.id}`}
                  aria-label={`مشاهده پرونده ${submission.companyNationalId}`}
                  title="مشاهده پرونده"
                >
                  <Eye aria-hidden="true" size={18} strokeWidth={2} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

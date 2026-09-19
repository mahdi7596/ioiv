import { PAYMENT_UNCERTAIN_MESSAGE } from "@/lib/payments/messages";
import Link from "next/link";
import { PaymentStatus } from "@prisma/client";
import { CheckCircle2, CircleHelp, XCircle } from "lucide-react";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type PaymentReturnPageProps = {
  searchParams: Promise<{ status?: string; paymentId?: string }>;
};

type ReturnState = "success" | "repair" | "failed" | "pending" | "unknown";

/**
 * The gateway sends users here with `?status=`, but the outcome is read from the
 * payment row owned by the signed-in user. The query string is never trusted.
 */
async function resolveReturnState(paymentId: string | undefined): Promise<ReturnState> {
  if (!paymentId) return "unknown";
  const session = await getSession();
  if (!session || session.kind !== "user") return "unknown";

  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    select: { status: true, application: { select: { userId: true, status: true, paymentObligation: { select: { state: true } } } } },
  });
  if (!payment || payment.application.userId !== session.subjectId) return "unknown";

  if (payment.status === PaymentStatus.VERIFIED || payment.application.paymentObligation?.state === "SETTLED") return ["DRAFT", "PENDING_PAYMENT"].includes(payment.application.status) ? "repair" : "success";
  // Still open: the gateway answer was inconclusive or the confirmed payment
  // could not be persisted yet. It is re-verified on the next retry, so the
  // applicant must not be invited to pay again.
  if ((payment.application.paymentObligation && payment.application.paymentObligation.state !== "SETTLED") || payment.status === PaymentStatus.INITIATED) return "pending";
  return "failed";
}

const copy: Record<ReturnState, { Icon: typeof CheckCircle2; title: string; body: string }> = {
  repair: { Icon: CircleHelp, title: "پرداخت ثبت شد؛ ارسال پرونده باقی مانده است", body: "نیازی به پرداخت دوباره نیست. مدارک پرونده را بررسی و تکمیل کنید، سپس پرونده را دوباره ارسال کنید." },
  success: { Icon: CheckCircle2, title: "پرداخت با موفقیت ثبت شد", body: "پرداخت شما ثبت شده است. وضعیت فعلی پرونده را در داشبورد ببینید. تا چند لحظه دیگر به داشبورد منتقل می‌شوید." },
  failed: { Icon: XCircle, title: "پرداخت ناموفق بود", body: "پرداخت تایید نشد یا از درگاه خارج شدید. می‌توانید دوباره پرداخت را انجام دهید." },
  pending: { Icon: CircleHelp, title: "وضعیت پرداخت هنوز مشخص نیست", body: PAYMENT_UNCERTAIN_MESSAGE },
  unknown: { Icon: CircleHelp, title: "وضعیت پرداخت مشخص نیست", body: "نتیجه پرداخت از این صفحه قابل تأیید نیست؛ وضعیت پرونده را در داشبورد ببینید." },
};

export default async function PaymentReturnPage({ searchParams }: PaymentReturnPageProps) {
  const params = await searchParams;
  const state = await resolveReturnState(params.paymentId);
  const { Icon, title, body } = copy[state];

  return (
    <main className="auth-page payment-return-page">
      <meta httpEquiv="refresh" content="5;url=/dashboard" />
      <section className="auth-panel payment-return-panel" aria-live="polite">
        <div className="payment-return-panel__icon" data-state={state}>
          <Icon aria-hidden="true" size={42} strokeWidth={2.1} />
        </div>
        <div className="payment-return-panel__copy">
          <p className="eyebrow">بازگشت از درگاه پرداخت</p>
          <h1>{title}</h1>
          <p>{body}</p>
        </div>
        <Link href="/dashboard" className="button button--primary">
          رفتن به داشبورد
        </Link>
      </section>
    </main>
  );
}

import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";

type PaymentReturnPageProps = {
  searchParams: Promise<{ status?: string; paymentId?: string }>;
};

export default async function PaymentReturnPage({ searchParams }: PaymentReturnPageProps) {
  const params = await searchParams;
  const isSuccess = params.status === "success";
  const Icon = isSuccess ? CheckCircle2 : XCircle;

  return (
    <main className="auth-page payment-return-page">
      <meta httpEquiv="refresh" content="5;url=/dashboard" />
      <section className="auth-panel payment-return-panel" aria-live="polite">
        <div className="payment-return-panel__icon" data-state={isSuccess ? "success" : "failed"}>
          <Icon aria-hidden="true" size={42} strokeWidth={2.1} />
        </div>
        <div className="payment-return-panel__copy">
          <p className="eyebrow">بازگشت از درگاه پرداخت</p>
          <h1>{isSuccess ? "پرداخت با موفقیت ثبت شد" : "پرداخت ناموفق بود"}</h1>
          <p>
            {isSuccess
              ? "پرونده شما در صف بررسی قرار گرفت. تا چند لحظه دیگر به داشبورد منتقل می‌شوید."
              : "پرداخت تایید نشد یا از درگاه خارج شدید. می‌توانید دوباره پرداخت را انجام دهید."}
          </p>
        </div>
        <Link href="/dashboard" className="button button--primary">
          رفتن به داشبورد
        </Link>
      </section>
    </main>
  );
}

import Image from "next/image";
import { AuthFlow } from "@/components/auth/AuthFlow";

const serviceName = "سامانه اعتبار سنجی سانا";

export default function Home() {
  return (
    <main className="auth-page">
      <section className="auth-info" aria-labelledby="auth-info-title">
        <div className="auth-info__media">
          <Image
            src="/ioiv-banner.jpg"
            alt=""
            width={836}
            height={471}
            className="auth-info__banner"
            priority
          />
        </div>
        <h1 id="auth-info-title">فرایند ارزیابی مالی و اعتباری تامین‌کنندگان</h1>
        <div className="auth-info__copy">
          <p>
            متقاضیان عضویت در تامین‌کنندگان لیست بلند نفت به عنوان یک مرحله از فرایند ارزیابی مورد
            بررسی مالی و اعتباری قرار خواهند گرفت.
          </p>
          <p>
            این مرحله به عنوان یک شاخص اصلی شرکت‌های توانمند تامین‌کننده برای حضور در لیست بلند
            وزارت نفت در نظر گرفته شده است. از این رو از شرکت‌های متقاضی درخواست می‌گردد در ارائه
            کلیه اطلاعات خواسته شده در این فرایند با نهاد اعتبارسنجی همکاری‌های لازم را به عمل
            آورند.
          </p>
          <p>
            نتیجه گزارش اعتبارسنجی پس از بررسی در سامانه به صورت برخط به وزارت نفت ارسال خواهد
            گردید و نیازمند پیگیری از سمت شرکت متقاضی نمی‌باشد.
          </p>
          <p>
            همچنین در راستای شفافیت کامل مسیر تعریف شده شرکت‌ها می‌توانند به منظور رفع ابهامات و
            مشکلات احتمالی با شماره تلفن{" "}
            <a href="tel:02186122370" dir="ltr">
              02186122370
            </a>{" "}
            داخلی <span className="text-accent">3</span> تماس حاصل نمایند.
          </p>
        </div>
        <a
          className="enamad-seal enamad-seal--info"
          referrerPolicy="origin"
          target="_blank"
          rel="noopener noreferrer"
          href="https://trustseal.enamad.ir/?id=460034&Code=2JmpBGjve8PEVhflY0sJnYUKOlmzeLz9"
        >
          <img
            referrerPolicy="origin"
            src="https://trustseal.enamad.ir/logo.aspx?id=460034&Code=2JmpBGjve8PEVhflY0sJnYUKOlmzeLz9"
            alt=""
            data-code="2JmpBGjve8PEVhflY0sJnYUKOlmzeLz9"
          />
        </a>
      </section>

      <div className="auth-panel-stack">
        <p className="auth-panel-stack__service-name">{serviceName}</p>
        <section className="auth-panel" aria-label="ورود متقاضی به سانا">
          <div className="auth-panel__header">
            <Image
              src="/ioiv-logo.png"
              alt="نشان صندوق پژوهش و فناوری صنعت نفت"
              width={206}
              height={100}
              className="auth-logo"
              priority
            />
            <p className="auth-panel__intro">
              اگر قبلا ثبت‌نام کرده باشید وارد داشبورد می‌شوید؛ در غیر این صورت پس از تایید کد،
              اطلاعات تکمیلی شرکت و رابط دریافت خواهد شد.
            </p>
          </div>
          <AuthFlow />
        </section>
      </div>
    </main>
  );
}

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ValidationCertificatePanel } from "@/components/admin/ValidationCertificatePanel";

describe("ValidationCertificatePanel", () => {
  it("renders certificate metadata and replacement control after validation completes", () => {
    const markup = renderToStaticMarkup(
      <ValidationCertificatePanel
        applicationId="app-1"
        currentStatus="VALIDATION_COMPLETED"
        certificate={{
          id: "file-1",
          originalName: "certificate.pdf",
          size: 2048,
          createdAt: new Date("2026-05-07T00:00:00.000Z"),
        }}
      />,
    );

    expect(markup).toContain("certificate.pdf");
    expect(markup).toContain("/api/files/file-1");
    expect(markup).toContain("تعویض فایل PDF گواهی");
  });

  it("does not render replacement control before validation completes", () => {
    const markup = renderToStaticMarkup(
      <ValidationCertificatePanel
        applicationId="app-1"
        currentStatus="UNDER_REVIEW"
        certificate={undefined}
      />,
    );

    expect(markup).toContain("هنوز گواهی برای این پرونده ثبت نشده است");
    expect(markup).not.toContain("تعویض فایل PDF گواهی");
  });

  it("hides certificate actions when permissions deny them", () => {
    const markup = renderToStaticMarkup(
      <ValidationCertificatePanel
        applicationId="app-1"
        currentStatus="VALIDATION_COMPLETED"
        certificate={{
          id: "file-1",
          originalName: "certificate.pdf",
          size: 2048,
          createdAt: new Date("2026-05-07T00:00:00.000Z"),
        }}
        canDownload={false}
        canReplace={false}
      />,
    );

    expect(markup).toContain("certificate.pdf");
    expect(markup).not.toContain("/api/files/file-1");
    expect(markup).not.toContain("تعویض فایل PDF گواهی");
  });
});

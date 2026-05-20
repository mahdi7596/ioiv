import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SubmissionFiles } from "@/components/admin/SubmissionFiles";
import { ValidationCertificatePanel } from "@/components/admin/ValidationCertificatePanel";

const uploadedFile = {
  id: "file-1",
  fieldKey: "humanResources.insuranceList",
  originalName: "insurance-list.xlsx",
  size: 2048,
  createdAt: new Date("2026-05-07T00:00:00.000Z"),
};

describe("read-only admin UI controls", () => {
  it("keeps file metadata visible while hiding download controls", () => {
    const markup = renderToStaticMarkup(
      <SubmissionFiles
        files={[uploadedFile]}
        taxDeclarations={[]}
        financials={[]}
        canDownload={false}
      />,
    );

    expect(markup).toContain("insurance-list.xlsx");
    expect(markup).not.toContain("/api/files/file-1");
    expect(markup).not.toContain("دانلود");
  });

  it("keeps existing admins able to see file download controls", () => {
    const markup = renderToStaticMarkup(
      <SubmissionFiles
        files={[uploadedFile]}
        taxDeclarations={[]}
        financials={[]}
        canDownload
      />,
    );

    expect(markup).toContain("/api/files/file-1");
    expect(markup).toContain("دانلود");
  });

  it("hides validation certificate download and replacement controls for read-only admins", () => {
    const markup = renderToStaticMarkup(
      <ValidationCertificatePanel
        applicationId="app-1"
        currentStatus="VALIDATION_COMPLETED"
        certificate={{
          id: "certificate-1",
          originalName: "certificate.pdf",
          size: 2048,
          createdAt: new Date("2026-05-07T00:00:00.000Z"),
        }}
        canDownload={false}
        canReplace={false}
      />,
    );

    expect(markup).toContain("certificate.pdf");
    expect(markup).not.toContain("/api/files/certificate-1");
    expect(markup).not.toContain("تعویض فایل PDF گواهی");
    expect(markup).not.toContain("بارگذاری گواهی");
  });
});

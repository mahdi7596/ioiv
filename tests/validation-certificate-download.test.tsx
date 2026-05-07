import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ValidationCertificateDownload } from "@/components/dashboard/ValidationCertificateDownload";

describe("ValidationCertificateDownload", () => {
  it("renders a protected certificate download link when a certificate exists", () => {
    const markup = renderToStaticMarkup(
      <ValidationCertificateDownload
        certificate={{
          id: "file-1",
          originalName: "certificate.pdf",
          size: 1024,
          createdAt: new Date("2026-05-07T00:00:00.000Z"),
        }}
      />,
    );

    expect(markup).toContain("دانلود گواهی");
    expect(markup).toContain("/api/files/file-1");
  });

  it("renders nothing when no certificate exists", () => {
    const markup = renderToStaticMarkup(<ValidationCertificateDownload certificate={null} />);

    expect(markup).toBe("");
  });
});

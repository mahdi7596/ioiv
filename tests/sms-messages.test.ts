import { describe, expect, it } from "vitest";
import {
  createOtpSmsMessage,
  createStatusChangeSmsMessage,
  createSubmissionReceivedSmsMessage,
} from "@/lib/sms/messages";

describe("SMS message templates", () => {
  it("uses the registered Ghasedak OTP template with the code as param1", () => {
    expect(createOtpSmsMessage("09123456789", "4321")).toMatchObject({
      to: "09123456789",
      template: "sanaotp",
      params: { code: "4321" },
    });
  });

  it("uses the registered status-change template with a safe recipient param", () => {
    const message = createStatusChangeSmsMessage("09123456789");

    expect(message).toMatchObject({
      to: "09123456789",
      template: "sanastatus",
      params: { recipient: "کاربر" },
    });
  });

  it("uses the registered successful-submission template with a safe recipient param", () => {
    const message = createSubmissionReceivedSmsMessage("09123456789");

    expect(message).toMatchObject({
      to: "09123456789",
      template: "sanasubmitted",
      params: { recipient: "کاربر" },
    });
  });
});

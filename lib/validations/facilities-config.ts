import { z } from "zod";
import { normalizeDigits, normalizedText } from "@/lib/validations/facilities-company";

const name = z.string().transform(normalizedText).refine(Boolean, "نام الزامی است").refine((value) => value.length <= 120, "نام طولانی است");
const rial = z.string().transform(normalizeDigits).refine((value) => /^[1-9]\d*$/.test(value), "حداکثر مبلغ باید عدد صحیح مثبت به ریال باشد");
const toman = z.string().transform(normalizeDigits).refine((value) => /^[1-9]\d*$/.test(value), "مبلغ پرداخت باید عدد صحیح مثبت به تومان باشد");

export const programmeConfigurationSchema = z.object({ isEnabled: z.boolean() });
export const intakeSchema = z.object({ id: z.string().optional(), name, isEnabled: z.boolean(), maximumAmountRial: rial, paymentEnabled: z.boolean(), paymentAmountToman: toman });
export const intakeSupplierSchema = z.object({ intakeId: z.string(), supplierId: z.string(), isEnabled: z.boolean(), questionnaireTemplateVersionId: z.string().nullable() });
export const templateLabelSchema = z.string().transform(normalizedText).refine(Boolean, "شماره نسخه الزامی است").refine((value) => value.length <= 80, "شماره نسخه طولانی است");

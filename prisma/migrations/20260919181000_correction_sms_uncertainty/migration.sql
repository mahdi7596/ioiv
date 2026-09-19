BEGIN;
ALTER TABLE public."FacilitiesCorrectionRequest" DROP CONSTRAINT "FacilitiesCorrectionRequest_sms_state_check";
ALTER TABLE public."FacilitiesCorrectionRequest" ADD CONSTRAINT "FacilitiesCorrectionRequest_sms_state_check" CHECK (
 ("smsStatus"='PENDING' AND "smsSentAt" IS NULL AND (
  "smsFailureCode" IS NULL OR ("smsFailureCode" IN ('DELIVERY_UNCONFIRMED','PERSISTENCE_UNCONFIRMED') AND "smsAttemptCount">0 AND "smsLastAttemptAt" IS NOT NULL)
 )) OR
 ("smsStatus"='SENT' AND "smsAttemptCount">0 AND "smsLastAttemptAt" IS NOT NULL AND "smsSentAt" IS NOT NULL AND "smsFailureCode" IS NULL) OR
 ("smsStatus"='FAILED' AND "smsAttemptCount">0 AND "smsLastAttemptAt" IS NOT NULL AND "smsSentAt" IS NULL AND "smsFailureCode" IS NOT NULL)
);
COMMIT;

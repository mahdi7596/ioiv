## Track 1: Kalan Hesab Functional Verification

- [ ] 1.1 Verify full form submission flow: navigate to `/kalan-hesab`, fill all 6 fields with valid data, request OTP via ارسال کد, verify OTP via تایید شماره, click دریافت ارزیابی تخصصی, confirm success message appears
- [ ] 1.2 Verify SMS delivered to user mobile: confirm the submitter's phone receives "ضمن تشکر از اعتماد شما، کارشناسان کالان حساب در اولین فرصت با شما تماس خواهند گرفت."
- [ ] 1.3 Verify SMS delivered to 09224872163: confirm admin number receives "فرم جدید در کالان حساب ثبت شد - <fullName>"
- [ ] 1.4 Verify SMS delivered to 09390649614: confirm admin number receives "فرم جدید در کالان حساب ثبت شد - <fullName>"
- [x] 1.5 Verify OTP rate limiting: request OTP, immediately request again for same mobile within 90s, confirm second request is rejected
- [ ] 1.6 Verify "سایر" conditional fields: select سایر for both سمت سازمانی and بزرگترین دغدغه, confirm text inputs slide in, submit the form, confirm positionOther and concernOther appear correctly in the admin panel
- [x] 1.7 Verify submit button disabled until OTP verified: fill all fields but do NOT verify OTP, confirm دریافت ارزیابی تخصصی button is disabled; complete OTP verification, confirm button becomes enabled
- [ ] 1.8 Verify admin 09224872163 can log in: navigate to `/kalan-hesab/admin/login`, enter 09224872163, complete OTP, confirm redirect to `/kalan-hesab/admin` and submissions list renders
- [ ] 1.9 Verify admin 09390649614 can log in: navigate to `/kalan-hesab/admin/login`, enter 09390649614, complete OTP, confirm redirect to `/kalan-hesab/admin` and submissions list renders
- [ ] 1.10 Verify search filters correctly: with multiple submissions present, search by fullName, companyName, and mobile independently; confirm only matching rows appear; confirm empty search shows all rows
- [ ] 1.11 Verify Excel export: click دریافت Excel on the admin panel, confirm `.xlsx` downloads, open file and confirm all 7 columns (نام و نام خانوادگی, نام شرکت, سمت, اندازه تیم, دغدغه, موبایل, تاریخ ثبت) are present and populated
- [ ] 1.12 Verify mobile-responsive layout: open `/kalan-hesab` at 375px viewport width, confirm no horizontal overflow, all fields are accessible, OTP section and submit button are usable

## Track 2: IOIV Regression Verification

- [x] 2.1 Verify `/` (public page) loads: navigate to `/`, confirm the page renders without errors and no gold theme is applied
- [ ] 2.2 Verify `/dashboard` loads for authenticated users: log in as an IOIV user via USER_LOGIN OTP flow, navigate to `/dashboard`, confirm the page renders correctly
- [ ] 2.3 Verify `/admin` loads for IOIV admins: log in as an IOIV admin via ADMIN_LOGIN OTP flow, navigate to `/admin`, confirm the admin panel renders correctly
- [x] 2.4 Verify gold theme does NOT appear on IOIV routes: inspect `/`, `/dashboard`, and `/admin` in a browser, confirm no gold colors (#C89820, #A67A10, #ead9a0) are visible on buttons, borders, or backgrounds
- [ ] 2.5 Verify existing OTP flows still work: complete the USER_LOGIN OTP flow for an IOIV user and the ADMIN_LOGIN OTP flow for an IOIV admin; confirm both create sessions and reach their respective protected pages

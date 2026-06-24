## Step 1: Ghasedak SMS Template Registration

- [ ] 1.1 Submit the following text to the Ghasedak panel for template registration: "ضمن تشکر از اعتماد شما، کارشناسان کالان حساب در اولین فرصت با شما تماس خواهند گرفت."
- [ ] 1.2 Receive the approved template name from Ghasedak and record it for use in Step 2

## Step 2: Environment Variables

- [ ] 2.1 Copy the existing IOIV `.env.production` to the production environment for the Kalan Hesab deployment
- [ ] 2.2 Add `GHASEDAK_KALAN_HESAB_USER_TEMPLATE=<template_name>` to the production environment using the name received in task 1.2

## Step 3: DNS Configuration

- [ ] 3.1 Create an A or CNAME DNS record pointing `form.kalanhesab.com` to the production server
- [ ] 3.2 Confirm DNS has propagated and `form.kalanhesab.com` resolves to the production server

## Step 4: Deploy

- [ ] 4.1 Deploy from the `kalan-hesab-form-submission` branch to the production server
- [ ] 4.2 Run `npm run db:migrate` on the production server to apply the `add_kalan_hesab_submission` migration

## Step 5: Database Seed

- [ ] 5.1 Run `npm run db:seed` on the production server to create the two KALAN_HESAB_ADMIN accounts (09224872163 and 09390649614)

## Step 6: Smoke Test

- [ ] 6.1 Open `form.kalanhesab.com` in a browser, fill all form fields, complete OTP verification, and submit the form
- [ ] 6.2 Confirm the submitter's mobile receives: "ضمن تشکر از اعتماد شما، کارشناسان کالان حساب در اولین فرصت با شما تماس خواهند گرفت."
- [ ] 6.3 Confirm 09224872163 receives the admin notification SMS with the submitted fullName
- [ ] 6.4 Confirm 09390649614 receives the admin notification SMS with the submitted fullName

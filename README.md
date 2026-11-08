# CCES Farm to Market

## Overview

CCES Farm to Market is a web marketplace for customers to buy farm products, farmers to manage their own storefronts and orders, and CCES administrators to review farmer applications and oversee the marketplace.

The client is a React single-page application. Firebase Authentication handles sign-in, Cloud Firestore stores application data and enforces access through `firestore.rules`, Cloudinary hosts uploaded images, and a Vercel function sends new-order email notifications.

## Roles and permissions

The `users/{uid}.role` field has three supported values:

| Role | Permissions |
| --- | --- |
| `customer` | Browse products, maintain a cart, place orders, message active farmers, confirm delivery, and review items from eligible orders. |
| `farmer` | Manage their own active storefront, products, orders, payments, customer conversations, and customer notes. Farmer data is scoped by UID and `farmerId`. |
| `cces_admin` | Review farmer applications, approve or reject applicants, suspend or reactivate farmers, and view cross-farmer administration and analytics. |

New accounts are customers. A customer may apply to become a farmer; the application remains pending until a CCES administrator reviews it. Approval changes the account role and creates an active farmer profile together. Rejected applicants can reapply. CCES administrators can suspend or reactivate a farmer through the farmer profile status. A suspended farmer cannot manage products or orders, and suspended storefronts are not available for customer ordering.

Client code cannot assign the `cces_admin` role. Initial CCES administrator accounts must be provisioned through a trusted administrative process, not through public signup.

## Features by role

### Customers

- Browse, search, and review products with farm names.
- Keep a cart limited to products from one farmer at a time.
- Choose delivery or pickup and pay by COD, GCash, or Maya.
- View orders and receipts, submit online-payment receipts, and confirm delivery.
- Message eligible active farmers and review products from qualifying delivered orders.
- View their farmer-application status and, if rejected, its reason and reapply.

### Farmers

- Use the farm identity and contact information recorded on the approved application, and configure pickup location/days/hours, delivery fee, and GCash/Maya payment details and QR codes.
- Manage their own products and inventory.
- Process orders, verify online payments, reject submitted receipts, and track fulfillment.
- Message customers and keep private, farmer-specific customer notes.
- View their own analytics and print or save the report as a PDF.

### CCES administrators

- Review pending, approved, and rejected farmer applications.
- Approve or reject applications, provide a rejection reason, and suspend or reactivate farmers.
- View cross-farmer dashboards and analytics, filter by farmer, and print or save reports as PDFs.

New orders trigger a best-effort email to the farmer assigned to the order. The optional `settings/storefront.notificationEmail` may receive a copy.

## Order and payment flow

The cart accepts products from one farmer only. Checkout creates one order and uses that farmer's profile for payment instructions, pickup information, and delivery fee. A checkout transaction validates product ownership, stock, price, totals, and inventory changes in Firestore.

- Tax is 5% of the item subtotal. The order total is subtotal plus tax plus the selected farmer's delivery fee.
- Each order starts with status `pending`. COD starts with payment status `unpaid`; GCash and Maya start as `awaiting_verification` and require a receipt.
- The farmer can mark COD or verified online payment as `paid`, advance fulfillment through `pending`, `confirmed`, `packed`, and `delivered`, or cancel an eligible order.
- Rejecting an online payment receipt cancels the order and restores its stock. Eligible farmer cancellations also restore stock.
- A customer can confirm delivery after the order is marked delivered. Reviews require a delivered, customer-confirmed order and can only be created for an item in that order.

Firestore rules enforce a maximum of five line items per order. The checkout UI and rules must remain aligned if this limit changes.

## Technology and architecture

- **React, TypeScript, Vite:** browser application, routing, and production build.
- **Firebase Authentication:** customer and staff authentication.
- **Cloud Firestore:** users, farmer applications and profiles, products, orders, conversations, and reviews. `firestore.rules` is the authoritative client-access boundary.
- **Cloudinary:** product and payment-receipt image hosting through configured upload presets.
- **Vercel:** hosts the frontend and `api/notify-order.ts`.
- **Firebase Admin SDK and Nodemailer:** server-side ID-token verification, order notification idempotency, and Gmail delivery.

The Vercel function verifies the caller's Firebase ID token, verifies that the order belongs to that caller, accepts only recently created orders, and uses claim/sent timestamps to prevent duplicate email. It sends mail only to the order's farmer and the optional storefront notification address.

## Data model

| Collection/path | Purpose and key fields |
| --- | --- |
| `users/{uid}` | Account profile, email, and role (`customer`, `farmer`, or `cces_admin`). Customer and farmer profile fields are also used by application forms and the UI. |
| `farmerApplications/{uid}` | Application status, `farmName`, `contactNumber`, `address`, `createdAt`, `reviewedBy`, `reviewedAt`, and `rejectionReason`. |
| `farmerProfiles/{farmerId}` | Farmer status, farm identity/contact details, `storeReady`, `deliveryFee`, pickup information, and GCash/Maya account and QR details. Storefront data is read from this profile. |
| `farmerProfiles/{farmerId}/customerNotes/{customerId}` | Private farmer-specific customer notes, with note text and update metadata. |
| `products/{productId}` | Product name, category, price, stock, unit, image, availability, sold count, and owning `farmerId`. |
| `products/{productId}/reviews/{orderId}` | A customer's rating/comment for that product/order item. |
| `orders/{orderId}` | Customer and farmer IDs, order number, checkout group ID, items, subtotal, delivery fee, tax, total, payment method/status, fulfillment status/details, receipt, and timestamps. |
| `conversations/{customerId}/farmers/{farmerId}` | A conversation between one customer and one farmer, including its last-message summary. |
| `conversations/{customerId}/farmers/{farmerId}/messages/{messageId}` | Individual messages, sender ID/role, text, and creation time. |
| `settings/storefront` | Retained for the optional `notificationEmail` copied on order notifications. It is not the source of farmer storefront settings. |
## Security

Firestore rules enforce role checks and ownership on reads and writes. Farmer product and order access is scoped to the authenticated farmer's UID; customers can read their own orders, and CCES administrators can read across farmers. Farmer role changes and application approval require CCES administrator authority and matching updates to the application, user, and farmer profile. A customer cannot promote their own role, and client writes cannot assign `cces_admin`.

Rules also require active farmer profiles for farmer operations and customer-facing storefront availability. They validate product and order ownership, price and stock changes, the 5% tax and order total, payment state, receipt URLs, and stock restoration on eligible cancellation or rejected payment. Conversation creation is limited to active farmer accounts, and customer notes are readable and writable only by their owning farmer.

For the complete policy, review [`firestore.rules`](./firestore.rules). Do not weaken rules to accommodate a client query or UI behavior.

## Project structure

```text
api/                    Vercel serverless API functions
public/                 Static public assets
scripts/                Firestore backup and rules-test runner
src/
  assets/               Imported images and other static assets
  components/
    admin/              Admin-specific reusable components
    common/             Shared UI components
    layout/             Headers, sidebars, and page layout components
    reports/            Analytics print/PDF report
  constants/            Shared constants, including role values
  firebase/             Firebase app, auth, and Firestore setup
  pages/
    admin/              Farmer and CCES administration pages
    customer/            Customer shop, orders, and messaging pages
    public/              Public sign-in and signup pages
  utils/                Shared application utilities
tests/                  Firestore security rules tests
firestore.rules         Firestore authorization and data validation
firebase.json           Firebase CLI rules and emulator configuration
```

## Local setup

Prerequisites:

- Node.js 20.19+ or 22.12+ and npm.
- Java JDK 21 or later for Firestore rules tests.
- Firebase and Cloudinary projects/configuration for running the application against services.

1. Install dependencies:

   ```sh
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in the client-side Firebase and Cloudinary settings. The `VITE_` variables are included in the browser build; they are configuration values, not server-side secrets.
3. Start the development server:

   ```sh
   npm run dev
   ```

Available scripts:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server. |
| `npm run build` | Type-check and create the production build in `dist/`. |
| `npm run preview` | Preview the production build locally. |
| `npm run lint` | Run ESLint on `src/`. |
| `npm run test:rules` | Start/use the Firestore emulator and run the security rules tests. |

The rules test runner uses a cached Firestore emulator when available, otherwise Firebase CLI downloads/starts one. It runs against a demo project ID and does not target a configured production project.

## Environment variables

| Variable | Used by | Purpose |
| --- | --- | --- |
| `VITE_FIREBASE_API_KEY` | Browser | Firebase web app API key. |
| `VITE_FIREBASE_AUTH_DOMAIN` | Browser | Firebase Authentication domain. |
| `VITE_FIREBASE_PROJECT_ID` | Browser | Firebase project ID. |
| `VITE_FIREBASE_STORAGE_BUCKET` | Browser | Firebase project storage bucket configuration. |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Browser | Firebase messaging sender configuration. |
| `VITE_FIREBASE_APP_ID` | Browser | Firebase web app ID. |
| `VITE_FIREBASE_MEASUREMENT_ID` | Browser | Optional Firebase measurement ID. |
| `VITE_CLOUDINARY_CLOUD_NAME` | Browser | Cloudinary cloud name used for uploads. |
| `VITE_CLOUDINARY_UPLOAD_PRESET` | Browser | Cloudinary upload preset. Configure it with only the permissions the app needs. |
| `FIREBASE_SERVICE_ACCOUNT` | Vercel API | Service account JSON used by Firebase Admin; store as a protected Vercel environment variable. |
| `GMAIL_USER` | Vercel API | Gmail sender account. |
| `GMAIL_APP_PASSWORD` | Vercel API | App password for the sender account; do not use or commit an account password. |
| `APP_URL` | Vercel API | Deployed application base URL used in order notification links. |

The server variables are not needed in a local Vite `.env` unless running the Vercel function locally. Keep credentials out of source control.

## Deployment

Select the intended Firebase project in the Firebase CLI before deploying. Deploy Firestore rules with:

```sh
firebase use <firebase-project-id>
firebase deploy --only firestore:rules
```

There is currently no `firestore.indexes.json` configured in `firebase.json`, so there are no index definitions to deploy from this repository. If composite indexes are added later, add and register the index file in `firebase.json`, then deploy them with:

```sh
firebase deploy --only firestore:indexes
```

Deploy the frontend and API through the linked Vercel project (or with `vercel --prod` after authenticating and linking the project). Configure `FIREBASE_SERVICE_ACCOUNT`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, and `APP_URL` in the Vercel environment before deploying the API. The service account needs only the Firebase permissions required by the notification function; never commit its JSON file.

For Gmail notifications, enable two-step verification on the sending Google account and create an app password for the deployment. Set that value as `GMAIL_APP_PASSWORD`. Do not store it in the repository or a client-side environment variable.

## Testing

Run Firestore rules tests with:

```sh
npm run test:rules
```

The emulator tests cover role and ownership restrictions, application approval, product/order validation, stock handling, conversations, reviews, and farmer-specific notes. Java 21 or later must be available on `PATH`. The rules runner targets its local emulator, not production.

For the application checks, use:

```sh
npm run build
npm run lint
```

## Maintenance

- **Add a farmer:** have the person create a customer account and submit a farmer application. A CCES administrator reviews it in the Farmer Applications page. Do not assign the farmer role directly from public client code.
- **Suspend/reactivate a farmer:** use the CCES administrator's farmer application management page; profile status controls storefront eligibility and farmer operations.
- **Change the notification sender:** update `GMAIL_USER` and its matching `GMAIL_APP_PASSWORD` in Vercel, then redeploy the API.
- **Back up Firestore:** use a trusted service-account JSON file outside the repository:

  ```sh
  node scripts/backup-firestore.mjs /path/to/service-account.json
  ```

  The script exports top-level collections and nested subcollections as JSON under a timestamped `backups/` directory, converting Firestore timestamps to ISO strings. The directory and credential files are ignored by Git. Protect backups because they contain application data.

## Known limitations and future work

- The cart intentionally supports only one farmer per checkout; cross-farmer checkout is not supported.
- Each order is limited to five line items by the current Firestore validation.
- The frontend requires configured Firebase and Cloudinary projects; local development does not provide production-like service emulators for Auth, Cloudinary, email, or the Vercel API.
- Index definitions are not currently maintained in this repository. Add and test required composite indexes alongside any new query shapes.
- Backups are file exports, not an automated schedule or a tested restore workflow. Protect, retain, and periodically verify backups outside the repository.

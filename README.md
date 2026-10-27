# CCES Farm Market

CCES Farm Market is a farm-produce storefront with customer ordering and account features, plus an admin dashboard for managing products, orders, customers, payments, and sales analytics.

## Tech stack

- React and TypeScript
- Vite
- Firebase Authentication and Cloud Firestore
- Cloudinary for product image uploads

## Setup

1. Install the project dependencies:

   ```sh
   npm install
   ```

2. Configure a Firebase project: register a web app, enable Email/Password Authentication, and create a Firestore database. Set the Firebase web app configuration in `src/firebase/firebaseConfig.ts`.

3. Configure Cloudinary with an unsigned image-upload preset. Create a local `.env.local` file in the project root and set these variables (do not commit their values):

   ```text
   VITE_CLOUDINARY_CLOUD_NAME=
   VITE_CLOUDINARY_UPLOAD_PRESET=
   ```

4. Start the development server:

   ```sh
   npm run dev
   ```

## Checks

```sh
npm run build
npx tsc --noEmit
npm run lint
```

Firestore and Storage rules tests run with the local Firebase emulators:

```sh
npm run test:rules
```

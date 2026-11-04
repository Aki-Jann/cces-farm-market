# Multi-farmer migration and deployment runbook

This runbook is for the operator running the deployment and migration. The backup and migration scripts use Firebase Admin credentials and access the project named in that service account. Confirm that it is the intended project before running either script. The migration defaults to dry-run; writes require the explicit `--apply` flag.

## 1. Prepare credentials and workspace

1. Use the `multi-farmer` branch and a clean, reviewed worktree.
2. Obtain a Firebase service-account JSON file with Firestore read/write access. Store it outside the repository, for example at `../private/cces-service-account.json`. Never commit or share the file.
3. Confirm the farmer and CCES admin account email addresses. They must identify two distinct documents in `users`.
4. Ensure the `backups/` directory and service-account JSON patterns are ignored by Git.

## 2. Back up Firestore before changes

From the repository root, run:

```sh
node scripts/backup-firestore.mjs ../private/cces-service-account.json
```

The script exports all top-level collections and recursively exports subcollections to `backups/<timestamp>/`. Documents are stored as JSON with document IDs and data; Firestore timestamps are ISO-8601 strings. Review the printed document counts and confirm that the backup files exist before continuing. Keep a protected copy of the backup outside this workspace.

## 3. Preview the migration

Run the migration in its default dry-run mode:

```sh
node scripts/migrate-multi-farmer.mjs ../private/cces-service-account.json \
  --farmer-email=farmer@example.com \
  --cces-email=cces-admin@example.com
```

The dry run reads Firestore but writes nothing. Review the `found | would change | changed | skipped` counts for users, applications, profiles, products, orders, conversations, and messages. Confirm the matched accounts and expected records before proceeding. If the result is unexpected, stop; do not use `--apply`.

## 4. Deploy in order

1. Deploy Firestore rules first:

   ```sh
   firebase deploy --only firestore:rules
   ```

2. Deploy the reviewed frontend and `api/notify-order.ts` together through the configured Vercel deployment process. Confirm the deployment is ready before migrating data.
3. Do not deploy indexes for this phase; no new compound query was added.
4. Do not change Vercel environment variables for this phase.

## 5. Apply the migration

After confirming the backup, dry-run summary, rules deployment, and frontend/API deployment, run the same migration with `--apply`:

```sh
node scripts/migrate-multi-farmer.mjs ../private/cces-service-account.json \
  --farmer-email=farmer@example.com \
  --cces-email=cces-admin@example.com \
  --apply
```

If the migration was already applied before the farmer-name display fix, rerun the same `--apply` command after deploying the updated frontend. It is idempotent and now synchronizes the original farmer profile name from the approved application and display name from the user profile.

Read the summary and verify that the expected roles, `farmerId` fields, farmer profile, approved application, and farmer-scoped conversations were changed. A subsequent dry run should report no changes for already migrated records. The migration is idempotent and commits Firestore writes in batches of no more than 500 operations.

## 6. Manual role checklist

- **Customer:** sign in; browse products from active farms; place a cart with one farmer and a cart with multiple farmers; verify each created order and farmer email notification; check each farmer conversation; attempt to access another customer's orders or conversations and confirm access is denied; review a delivered item from an order owned by the correct customer.
- **Farmer:** sign in as the migrated farmer and as another approved farmer; verify analytics, products, orders, and conversations only show that farmer's data; reply to a customer conversation; confirm order status and payment verification behavior remains limited to owned orders.
- **CCES admin:** sign in; open analytics, select each farmer and all farmers, and print/save reports to PDF; verify the Farmer column and filter scope; open farmer applications and verify application status and suspension controls.
- **Legacy migration checks:** verify products/orders that lacked `farmerId` now have the migrated farmer's UID; verify untagged conversation messages appear under that farmer's conversation; verify newer, already farmer-scoped conversations remain intact.

## 7. Rollback steps

### Failure before applying migration

If the rules or Vercel deployment fails before migration, stop the rollout and redeploy the last known-good rules and Vercel release using the project's normal rollback procedure. No data migration writes have occurred.

### Failure after applying migration

1. Stop further administrative writes and checkout testing while investigating. Do not rerun with different account emails.
2. Preserve the pre-migration backup and make a second backup of the current state before any repair.
3. If the code deployment is the cause, roll back the Vercel release while retaining rules that safely permit the current stored roles/data. Do not restore older rules that deny the migrated role or data model.
4. If data must be restored, use the backup to selectively restore the affected user roles, application/profile documents, product/order fields, and conversation parent/message paths. Preserve orders and messages created after the backup; do not blindly overwrite whole collections or delete new data.
5. After a selective restore, deploy only rules compatible with the restored data and verify each role before reopening checkout.
6. If the issue cannot be isolated safely, keep writes paused and ask the project maintainer to review the backup and current Firestore state before attempting recovery.

The migration script is forward-only. It does not automatically reverse changes or delete migrated destination conversations during rollback.

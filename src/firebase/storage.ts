import { getStorage } from "firebase/storage";
import { app } from "./firebaseConfig";

export const storage = getStorage(app);

// The SDK default (10 minutes) leaves the UI stuck on a hung request for far
// too long when something is genuinely wrong (auth/rules/CORS). 15s was too
// aggressive and cut off legitimate retries before a slow/cold connection
// could recover, surfacing as storage/retry-limit-exceeded. 30s/20s gives
// real transient issues a fair chance while still failing in a reasonable time.
storage.maxUploadRetryTime = 30000;
storage.maxOperationRetryTime = 20000;


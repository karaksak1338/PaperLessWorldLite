# Modern Testing Guide: DocuVault Pro (Expo Go Compatible)

## 1. Environment Prerequisite
- **Web**: `cd frontend-web` -> `npm run dev`
- **Mobile**: `cd frontend-ios` -> `npx expo start` (Scan with Expo Go)

## 2. Testing Core Workflows

### A. The "Private Vault" Test (Auth & Signed URLs)
1. Sign in on both platforms.
2. Upload a document from the **Web**.
3. View it on **Mobile**. Clicking the thumbnail should load a high-quality preview using a **Signed URL**.
4. Log out on Mobile. Verify the dashboard is protected.

### B. The "Perfect Crop" Test (Manual Mobile Scan)
1. Tap **+** on Mobile -> **Manual Scan & Crop**.
2. Take a photo and adjust the crop handles.
3. Tap **Done**.
4. Verify the OCR extracts the vendor/amount correctly in the **Details** screen.

### C. The "Clean Deletion" Test
1. Identify a document ID on the Web dashboard.
2. Delete it.
3. Verify it disappears from the **Mobile list** instantly.
4. Verify the file is purged from **Supabase Storage**.

## 3. Deployment Check (AI Features)
If "Vendor/Date" is empty, confirm your AI pipeline is active:
```bash
supabase functions deploy process-document --no-verify-jwt
```
Confirm your `OPENAI_API_KEY` is set in Supabase Secrets.

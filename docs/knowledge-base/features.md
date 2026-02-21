# Feature Specification: DocuVault Pro

This document defines the core functional blocks of the application, prioritizing automated document intelligence and cloud-native synchronization.

## 1. Document Intelligence (AI/OCR)
The system leverages AI to transform images into structured data.
- **Auto-Extraction**: Automatic detection of Vendor, Date, Amount, and Document Type (Invoice, Receipt, Contract).
- **Confidence Scoring**: Each extraction includes a confidence rating; low-confidence fields are flagged for manual review.
- **Edge-First OCR**: The mobile app (iOS) performs initial pre-processing, with heavy inference handled by Supabase Edge Functions + OpenAI.

## 2. Universal Vault (Supabase Sync)
Consistent data across Web and iOS.
- **Real-time Sync**: Changes on mobile (e.g., a new scan) appear instantly on the web gallery.
- **Secure Storage**: High-resolution originals are stored in Supabase Storage with signed URL access.
- **Offline Resilience**: iOS client caches recent documents for viewing without network access.

## 3. Intelligent Search & Filtering
- **Semantic Search**: (Future Expansion) Finding documents based on context (e.g., "Find the office rent from last year").
- **Smart Filters**: Filter by tax year, vendor, or amount range.

## 4. Operational Reminders
- **Due Date Extraction**: AI detects payment deadlines.
- **Push Notifications**: Mobile reminders for upcoming contract expirations or invoice deadlines.

## 5. Privacy & Control
- **Self-Service Export**: One-click download of all document data in JSON/CSV + original images.
- **Hard Deletion**: Data is permanently wiped from both database and storage upon request.

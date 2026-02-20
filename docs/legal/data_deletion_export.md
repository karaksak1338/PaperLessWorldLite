# Data Deletion and Export Mechanism

[Drafting Status: Skeleton]

## Deletion Flow
1. User requests deletion via [App Interface].
2. Backend triggers Supabase cascade deletion.
3. Confirmation sent to user.

## Export Flow
1. User requests data export.
2. System generates JSON/CSV of all personal records.
3. Link provided for secure download.

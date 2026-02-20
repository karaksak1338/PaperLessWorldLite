# Architecture Standard: Next.js + Expo + Supabase

This document defines the mandatory architecture for applications built under this framework.

## 1. System of Record: Supabase
Supabase is the absolute source of truth for:
- **Authentication**: All user identities managed via Supabase Auth.
- **Database**: PostgreSQL with Row Level Security (RLS) enabled.
- **Storage**: All user-generated media and files.
- **Service Layer**: Edge Functions for server-side logic.

## 2. Infrastructure Layers
### 2.1 Web Client (Next.js)
- Purpose: Administrative dashboard, public presence, and web-access.
- Constraints: No direct DB access (use Supabase Client), no secrets in client-side bundles.

### 2.2 iOS Client (Expo / React Native)
- Purpose: Primary mobile engagement layer.
- Constraints: Must use NativeWind for styling to maintain alignment with Web. Direct interaction with Supabase via client library.

## 3. Communication Patterns
- **Direct Client-to-Supabase**: Permitted for CRUD operations where RLS ensures safety.
- **Backend Edge Functions**: Mandatory for all complex logic, third-party integrations, and AI inference.

## 4. Security
- Secrets strictly managed in Supabase Environment Secrets.
- API keys for clients are limited to Public/Anon keys only.

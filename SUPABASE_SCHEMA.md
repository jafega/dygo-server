# Supabase Database Schema

**WARNING: This schema is for context only and is not meant to be run.**
**Table order and constraints may not be valid for execution.**

## Overview

This document describes the current Supabase database schema for the dygo application.
All tables use `id` (text) as primary key and store additional data in a `data` (jsonb) column.

---

## Tables

### 1. `public.users`

Main user table - stores both patients and psychologists.

```sql
CREATE TABLE public.users (
  id text NOT NULL,
  data jsonb NOT NULL,
  is_psychologist boolean NOT NULL DEFAULT false,
  user_email text,
  psycologist_profile_id text,
  auth_user_id uuid,
  CONSTRAINT users_pkey PRIMARY KEY (id),
  CONSTRAINT users_psycologist_profile_id_fkey FOREIGN KEY (psycologist_profile_id) REFERENCES public.psychologist_profiles(id),
  CONSTRAINT users_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id)
);
```

**Columns:**
- `id` (text, PK): Unique user identifier
- `data` (jsonb): Additional user data (name, email, password, role, etc.)
- `is_psychologist` (boolean, NOT NULL, default: false): Flag indicating if user is a psychologist
- `user_email` (text, nullable): User's email address
- `psycologist_profile_id` (text, nullable): FK to psychologist_profiles(id) if user has a psychologist profile
- `auth_user_id` (uuid, nullable): FK to auth.users(id) - Supabase Auth user ID for OAuth

---

### 2. `public.care_relationships`

Stores active and ended relationships between psychologists and patients.

```sql
CREATE TABLE public.care_relationships (
  id text NOT NULL,
  data jsonb NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  psychologist_user_id text NOT NULL,
  patient_user_id text NOT NULL,
  CONSTRAINT care_relationships_pkey PRIMARY KEY (id),
  CONSTRAINT care_relationships_psychologist_user_id_fkey FOREIGN KEY (psychologist_user_id) REFERENCES public.users(id),
  CONSTRAINT care_relationships_patient_user_id_fkey FOREIGN KEY (patient_user_id) REFERENCES public.users(id)
);
```

**Columns:**
- `id` (text, PK): Unique relationship identifier
- `data` (jsonb): Additional relationship data (createdAt, endedAt, etc.)
- `created_at` (timestamptz, NOT NULL): When the relationship was created
- `psychologist_user_id` (text, NOT NULL): FK to users(id) - The psychologist in this relationship
- `patient_user_id` (text, NOT NULL): FK to users(id) - The patient in this relationship

---

### 3. `public.entries`

Journal entries and clinical notes.

```sql
CREATE TABLE public.entries (
  id text NOT NULL,
  data jsonb NOT NULL,
  creator_user_id text NOT NULL,
  target_user_id text NOT NULL,
  CONSTRAINT entries_pkey PRIMARY KEY (id),
  CONSTRAINT entries_creator_user_id_fkey FOREIGN KEY (creator_user_id) REFERENCES public.users(id),
  CONSTRAINT entries_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES public.users(id)
);
```

**Columns:**
- `id` (text, PK): Unique entry identifier
- `data` (jsonb): Entry data (date, timestamp, transcript, summary, emotions, feedback, etc.)
- `creator_user_id` (text, NOT NULL): FK to users(id) - User who created the entry
- `target_user_id` (text, NOT NULL): FK to users(id) - User the entry is about/for

---

### 4. `public.goals`

Patient goals and tasks.

```sql
CREATE TABLE public.goals (
  id text NOT NULL,
  data jsonb NOT NULL,
  patient_user_id text NOT NULL,
  CONSTRAINT goals_pkey PRIMARY KEY (id),
  CONSTRAINT goals_patient_user_id_fkey FOREIGN KEY (patient_user_id) REFERENCES public.users(id)
);
```

**Columns:**
- `id` (text, PK): Unique goal identifier
- `data` (jsonb): Goal data (description, createdAt, completed, createdBy, etc.)
- `patient_user_id` (text, NOT NULL): FK to users(id) - Patient who owns this goal

---

### 5. `public.invitations`

Invitations from psychologists to patients.

```sql
CREATE TABLE public.invitations (
  id text NOT NULL,
  data jsonb NOT NULL,
  psychologist_user_id text NOT NULL,
  patient_user_id text,
  CONSTRAINT invitations_pkey PRIMARY KEY (id),
  CONSTRAINT invitations_psychologist_user_id_fkey FOREIGN KEY (psychologist_user_id) REFERENCES public.users(id),
  CONSTRAINT invitations_patient_user_id_fkey FOREIGN KEY (patient_user_id) REFERENCES public.users(id)
);
```

**Columns:**
- `id` (text, PK): Unique invitation identifier
- `data` (jsonb): Invitation data (status, timestamp, emails, names, etc.)
- `psychologist_user_id` (text, NOT NULL): FK to users(id) - Psychologist sending the invitation
- `patient_user_id` (text, nullable): FK to users(id) - Patient receiving the invitation (null until accepted)

---

### 6. `public.sessions`

Therapy sessions between psychologists and patients.

```sql
CREATE TABLE public.sessions (
  id text NOT NULL,
  data jsonb NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  psychologist_user_id text NOT NULL,
  patiente_user_id text,
  CONSTRAINT sessions_pkey PRIMARY KEY (id),
  CONSTRAINT sessions_psychologist_user_id_fkey FOREIGN KEY (psychologist_user_id) REFERENCES public.users(id),
  CONSTRAINT sessions_patiente_user_id_fkey FOREIGN KEY (patiente_user_id) REFERENCES public.users(id)
);
```

**Columns:**
- `id` (text, PK): Unique session identifier
- `data` (jsonb): Session data (date, duration, notes, etc.)
- `created_at` (timestamptz, NOT NULL): When the session was created
- `psychologist_user_id` (text, NOT NULL): FK to users(id) - Psychologist conducting the session
- `patiente_user_id` (text, nullable): FK to users(id) - Patient in the session

**Note:** Column name has typo: `patiente_user_id` (should be `patient_user_id`)

---

### 7. `public.invoices`

Billing invoices for therapy sessions.

```sql
CREATE TABLE public.invoices (
  id text NOT NULL,
  data jsonb NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  psychologist_user_id text NOT NULL,
  patiente_user_id text,
  CONSTRAINT invoices_pkey PRIMARY KEY (id),
  CONSTRAINT invoices_psychologist_user_id_fkey FOREIGN KEY (psychologist_user_id) REFERENCES public.users(id),
  CONSTRAINT invoices_patiente_user_id_fkey FOREIGN KEY (patiente_user_id) REFERENCES public.users(id)
);
```

**Columns:**
- `id` (text, PK): Unique invoice identifier
- `data` (jsonb): Invoice data (amount, status, items, etc.)
- `created_at` (timestamptz, NOT NULL): When the invoice was created
- `psychologist_user_id` (text, NOT NULL): FK to users(id) - Psychologist issuing the invoice
- `patiente_user_id` (text, nullable): FK to users(id) - Patient being billed

**Note:** Column name has typo: `patiente_user_id` (should be `patient_user_id`)

---

### 8. `public.settings`

User settings and preferences.

```sql
CREATE TABLE public.settings (
  id text NOT NULL,
  data jsonb NOT NULL,
  user_id text,
  CONSTRAINT settings_pkey PRIMARY KEY (id),
  CONSTRAINT settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
```

**Columns:**
- `id` (text, PK): Unique settings identifier (typically same as user_id)
- `data` (jsonb): Settings data (notifications, language, voice, etc.)
- `user_id` (text, nullable): FK to users(id) - User who owns these settings

---

### 9. `public.psychologist_profiles`

Extended profile information for psychologists.

```sql
CREATE TABLE public.psychologist_profiles (
  id text NOT NULL,
  data jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  user_id text NOT NULL,
  CONSTRAINT psychologist_profiles_pkey PRIMARY KEY (id),
  CONSTRAINT psychologist_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
```

**Columns:**
- `id` (text, PK): Unique profile identifier
- `data` (jsonb): Profile data (license, specialties, bio, rates, etc.)
- `created_at` (timestamptz, default: now()): When the profile was created
- `updated_at` (timestamptz, default: now()): When the profile was last updated
- `user_id` (text, NOT NULL): FK to users(id) - User who owns this psychologist profile

---

## Foreign Key Relationships

```
users
  ├─> psychologist_profiles (via psycologist_profile_id)
  └─> auth.users (via auth_user_id)

care_relationships
  ├─> users (via psychologist_user_id)
  └─> users (via patient_user_id)

entries
  ├─> users (via creator_user_id)
  └─> users (via target_user_id)

goals
  └─> users (via patient_user_id)

invitations
  ├─> users (via psychologist_user_id)
  └─> users (via patient_user_id)

sessions
  ├─> users (via psychologist_user_id)
  └─> users (via patiente_user_id)

invoices
  ├─> users (via psychologist_user_id)
  └─> users (via patiente_user_id)

settings
  └─> users (via user_id)

psychologist_profiles
  └─> users (via user_id)
```

---

## Important Notes

1. **JSONB Data Column**: All tables have a `data` jsonb column that stores the bulk of the application data. The other columns are denormalized for querying efficiency and foreign key constraints.

2. **Typo in Column Names**: `sessions` and `invoices` tables have `patiente_user_id` (note the 'e' at the end) instead of `patient_user_id`. This is a known issue in the schema.

3. **Circular Reference**: `users.psycologist_profile_id` references `psychologist_profiles.id`, and `psychologist_profiles.user_id` references `users.id`. This requires careful insertion order.

4. **Auth Integration**: `users.auth_user_id` links to Supabase Auth's `auth.users(id)` table for OAuth authentication.

5. **Nullable Foreign Keys**: Most foreign keys are nullable to allow for data migration and orphaned records.

---

## TypeScript Interfaces

See `types.ts` for corresponding TypeScript interfaces that match this schema.

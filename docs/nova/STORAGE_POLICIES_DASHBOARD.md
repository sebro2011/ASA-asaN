# Storage policies — what is left, and exactly how to finish it

_Last checked against the live project `fktqzfzzsjaaaiqfimax` (spce) on 2026-11-06._

## State right now

| Thing | State |
| --- | --- |
| `knowledge` bucket | exists, **private**, 25 MB per object, MIME allow-list applied |
| `storage.objects` RLS | **enabled** |
| Policies on `storage.objects` | **0 — none at all** |
| Effect on clients | **fails closed**: a signed-in client can read nothing and upload nothing |

This is not a bug in the workspace tables. Every NOVA workspace table (`profiles`,
`conversations`, `messages`, `documents`, …) has its own policies and was applied
successfully. Only the storage schema is blocked.

## Why this cannot be applied from SQL

`storage.objects` is owned by `supabase_storage_admin`, and the SQL editor /
Management API query endpoint runs as `postgres`. Checked live:

```
select pg_get_userbyid(relowner) from pg_class …  → supabase_storage_admin
select pg_has_role('postgres','supabase_storage_admin','MEMBER')  → false
set local role supabase_storage_admin;  → ERROR 42501: permission denied to set role
pg_roles: postgres.rolcreaterole = true, but admin_option on supabase_storage_admin = null
```

`CREATE POLICY` requires table ownership, and `postgres` has neither ownership nor
`ADMIN OPTION` on that role, so it cannot grant itself membership either. Supabase
changes these policies through the dashboard (which talks to the storage service),
not through `postgres` SQL. The definitions in
`supabase/migrations/20261105_nova_workspace_storage.sql` are correct — they just
have to be created in a context that owns the table.

## Finish it in the dashboard (about two minutes)

**Storage → Policies → `knowledge` bucket → New policy → For full customization**,
then paste the four blocks below one at a time (or use the policy templates and
match these expressions exactly). Role: `authenticated`. All four use
`(storage.foldername(name))[1]` — the first path segment — because object keys are
written as `{auth.uid()}/{filename}`; checking the folder is stronger than trusting
client-supplied metadata.

**1 — read own objects (`SELECT`)**

```sql
create policy knowledge_objects_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'knowledge'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
```

**2 — upload into own folder (`INSERT`)**

```sql
create policy knowledge_objects_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'knowledge'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
```

**3 — replace/overwrite own object (`UPDATE`)**

```sql
create policy knowledge_objects_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'knowledge'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'knowledge'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
```

**4 — delete own object (`DELETE`)**

```sql
create policy knowledge_objects_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'knowledge'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
```

## How to verify afterwards

Run this in the SQL editor (it works as `postgres`, read-only):

```sql
select policyname, cmd, roles::text, qual, with_check
  from pg_policies
 where schemaname = 'storage' and tablename = 'objects'
 order by policyname;
```

Expected: four rows named `knowledge_objects_select_own`,
`knowledge_objects_insert_own`, `knowledge_objects_update_own`,
`knowledge_objects_delete_own`.

Then, from a signed-in browser session:

1. upload a small text file to `knowledge/<your-uid>/probe.txt` — must succeed;
2. try `knowledge/someone-else/probe.txt` — must fail with a policy error;
3. download your own object — must succeed, and the object must not be reachable
   without a session (the bucket is private).

## Notes

* Nothing in the app uploads yet — the Knowledge module is Phase 4E — so this gap
  blocks no shipped feature today. It is recorded now so the module is not built
  on top of a bucket that silently refuses every write.
* Do not make the bucket public to work around this. Keys live under user folders
  precisely so a folder policy can do the enforcement.
* The service-role key must never be shipped to the browser; nothing in this
  repository needs it.

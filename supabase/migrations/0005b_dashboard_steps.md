# The two things you must click in the Supabase dashboard

Everything else in `supabase/migrations/` is SQL you paste into the SQL editor.
These two cannot be done from SQL — they need the dashboard.

Project: **vmodgrkxiitwwneqhtbo** · region should be **West EU (Paris)** (plan §9.2).

---

## 1 · Enable the access-token hook

Migration `0005_roles_rls.sql` creates `public.custom_access_token_hook`, but a
function does nothing until Auth is told to call it. Without this step every
staff login gets a JWT with **no** `user_role` claim, so every admin RLS policy
denies — the admin will look broken in a way that is hard to diagnose.

1. **Authentication → Hooks** (left sidebar, under Configuration).
2. Find **Customize Access Token (JWT) Claims**.
3. Enable it, choose **Postgres function**, and select
   `public.custom_access_token_hook`.
4. Save.

Verify: sign in, then in the SQL editor run
`select auth_role();` while authenticated — it must return your role, not null.

---

## 2 · Create the first owner, then give them the role

The role lives in `profiles`, which is keyed to `auth.users`. So the user has to
exist before the role can be set.

1. **Authentication → Users → Add user → Create new user**.
2. E-mail: the address Diab Car will actually use. Set a strong password and
   tick **Auto Confirm User** (otherwise the account cannot sign in until the
   confirmation mail is clicked).
3. Then run this in the SQL editor, replacing the e-mail:

```sql
-- Make the first staff member the owner (plan 7.2).
insert into profiles (id, role, display_name, is_active)
select u.id, 'owner', coalesce(u.raw_user_meta_data ->> 'full_name', split_part(u.email, '@', 1)), true
  from auth.users u
 where u.email = 'REPLACE-ME@example.com'
on conflict (id) do update
  set role = 'owner', is_active = true;

-- Confirm it landed.
select p.id, u.email, p.role, p.is_active
  from profiles p join auth.users u on u.id = p.id;
```

**The role only reaches the JWT on the next token issue.** Sign out and back in
after running this, or the session still carries the old claims.

---

### Adding the rest of the team later

Same shape, different role — `manager`, `agent`, or `driver` (plan 7.2: an
`agent` can work reservations and checklists but cannot see or change prices
and settings):

```sql
insert into profiles (id, role, display_name)
select u.id, 'agent', 'Prénom Nom' from auth.users u where u.email = 'collegue@diabcar.ma'
on conflict (id) do update set role = excluded.role;
```

To revoke access without deleting the account: `update profiles set is_active = false where id = '…';`
The hook then issues tokens with no role at all, and every policy denies.

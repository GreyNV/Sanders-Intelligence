# Route State Audit - 2026-06-05

## Summary

- Public browser smoke test: `/login` and `/reset-password` render successfully.
- Authentication guard: `/` and all protected routes redirect unauthenticated
  sessions to `/login`.
- Protected-page live loading/error/empty simulation could not be completed
  because the QA browser session had no authenticated profile.
- Static state audit found one functional empty-state gap.

## Functional Finding

### BUG: Users page shows a blank table when no users are returned

`app/src/pages/admin/UsersPage.tsx` handles loading and query errors, but its
table body only maps `users`. When `users` is empty, the table has no rows and
no explanation.

Expected: show a table-row empty state such as `No users found`.

## Route Checklist

| Route | Loading | Error | Empty | Browser smoke |
|---|---|---|---|---|
| `/login` | Action spinner | Inline error | N/A | Pass |
| `/reset-password` | Action spinner | Inline error | N/A | Pass |
| `/` | Profile gate loader | Profile fallback | N/A | Redirects to login when signed out |
| `/purchasing/action-center` | Present | Present | Present | Auth redirect verified |
| `/purchasing/inventory` | Present | Present | Present | Auth redirect verified |
| `/purchasing/inbound` | Present | Present | Present | Auth redirect verified |
| `/purchasing/vendors` | Present | Present | Present | Auth redirect verified |
| `/executive` | Present | Present | Partial chart/list states | Auth redirect verified |
| `/executive/departments` | N/A static placeholder | N/A | N/A | Auth redirect verified |
| `/today` | Present | Present | Present per section | Auth redirect verified |
| `/tasks` | Present | Present | Present | Auth redirect verified |
| `/admin/users` | Present | Present | **Missing** | Auth redirect verified |
| `/admin/uploads` | Present | Present | Present | Auth redirect verified |

## Deferred Live Checks

An authenticated browser session is still needed to manually confirm:

- `/today` claim flow and read-only task inspection.
- Mandatory cancel/postpone note behavior against Supabase.
- Protected-page loading/error/empty visuals.
- Inbound chart/table values against the latest completed upload timestamp.

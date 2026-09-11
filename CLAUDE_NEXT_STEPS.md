# PSITS Portal V2 - Next Steps

## Current State

- Current Git branch: `staging`.
- The working tree contains local changes that still need review, commit, and push.
- The configured local backend database is the cleaned Supabase staging database currently being prepared for launch.
- Do not run destructive seed/reset scripts against it without confirming the target database first.
- The admin account was renamed to `usm.psits@admin.com`; use a new unique password before production because the previously requested password appeared in Git history.

## Completed

- Backend security fixes: authenticated admin attendance WebSocket, active-event filtering, and regression tests.
- Frontend security fixes: Vercel security headers, CSP, disabled production source maps, and tab-scoped custom tokens.
- Flutter release builds reject non-HTTPS API URLs.
- Backend tests pass: 124 tests.
- Frontend production build passes.

## Do Next

1. Review the uncommitted changes and create a clean commit on `staging`.
2. Push `staging` to GitHub.
3. Configure a separate Render staging service using the `staging` branch and staging environment variables.
4. Configure Vercel Preview variables so the frontend uses the staging Render API.
5. Create a separate Supabase staging project when possible. Until then, use the current launch database only for non-destructive smoke tests.
6. Test admin login, student login, event creation, image upload, scanner Event Code + PIN login, all attendance checkpoints, reviews, payments, and the physical-device APK.
7. Verify CORS, Supabase RLS, Storage policies, secrets, and the deployed CSP.
8. Merge the tested `staging` commit into `main`.
9. Deploy `main` to the production Render and Vercel services, then run production smoke tests.

## Important Rules

- The mobile scanner uses Event Code + PIN; do not require an admin JWT for scanner operations.
- Never commit `.env` files, service-role keys, database passwords, or private student data.
- Production must use `DEBUG=False`, HTTPS API URLs, exact CORS origins, and separate production secrets.
- Do not claim production readiness until Render, Vercel, Supabase, Storage, and the physical APK have been verified at runtime.

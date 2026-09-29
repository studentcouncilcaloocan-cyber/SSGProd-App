# SSG Program Guide Builder — GitHub Migration v1

This is the first migration layer for the existing SSG Program Flow / Tech Guide Builder.

## What this version does

- Hosts the existing frontend as a normal static GitHub Pages application.
- Preserves the existing frontend UI and application logic.
- Keeps the existing Google Apps Script backend and Google Sheets database in place.
- Adds a small HTTP bridge (`doPost`) to the existing Apps Script backend.
- Replaces the Apps Script HTML-template configuration with browser URL/runtime configuration.
- Does **not** migrate accounts, saved guides, live sessions, or Google Drive data yet.

This is intentional. It lets us move the application hosting layer first without rebuilding the working application.

## Files

- `index.html` — migrated existing frontend.
- `config.js` — runtime configuration.
- `apps-script/Code.gs` — existing backend plus the new HTTP bridge.
- `docs/ARCHITECTURE.md` — migration architecture.

## Before deploying

1. Create a new GitHub repository.
2. Prefer a **Private** repository during migration, especially while the project is still being separated from its backend.
3. Upload/extract the contents of this package into the repository root.
4. `config.js` is already preconfigured with the existing Apps Script Web App URL supplied for this migration.
5. You do **not** need to manually edit `config.js` for this v1 package.

`APP_URL` remains blank. The application will use its current GitHub Pages URL automatically.

## Apps Script backend update

The supplied `apps-script/Code.gs` contains the HTTP bridge needed by the GitHub frontend.

Replace the current Apps Script `Code.gs` with this version, or merge the added `doPost(e)` function and the Script Properties change into your current project.

### Officer code

The officer-code hash is intentionally no longer hard-coded in this GitHub-safe backend copy.

In Apps Script:

**Project Settings → Script Properties**

add:

- Property: `OFFICER_CODE_HASH`
- Value: the existing SHA-256 hash used by the current production backend

Do not put the raw officer code in GitHub.

## Redeploy Apps Script

After updating Code.gs:

1. Deploy the Apps Script project as a Web App.
2. Execute as the application owner.
3. Give the required users access according to your existing authentication setup.
4. Copy the deployed `/exec` URL.
5. Put that URL in `config.js`.

## GitHub Pages

In GitHub:

**Settings → Pages**

choose the repository's `main` branch and `/ (root)` as the deployment source.

The resulting page should load the same application UI.

## Important

This v1 does NOT attempt to move the MCGI Music Department Drive, Google Sheets database, accounts, saved guides, or live-session persistence to GitHub.

Those remain server-side.

The next migration phase can move the large static song/lyrics lookup workload away from Apps Script after the GitHub-hosted frontend is confirmed working.

## Do not expose

Do not commit:

- passwords
- raw officer codes
- session tokens
- private account data
- private saved guide data
- private Drive credentials
- service-account keys
- API keys

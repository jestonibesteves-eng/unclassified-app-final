# User Manual
## Unclassified ARRs Data Management System
**DAR Bicol Region · Regional Office No. V**

---

## Table of Contents

1. [What Is This System?](#1-what-is-this-system)
2. [Business Rules](#2-business-rules)
3. [Logging In](#3-logging-in)
4. [Navigating the System](#4-navigating-the-system)
5. [Dashboard](#5-dashboard)
6. [Records Browser](#6-records-browser)
7. [Batch Update (LH)](#7-batch-update-lh)
8. [ARB Batch Update](#8-arb-batch-update)
9. [Audit Log](#9-audit-log)
10. [User Management](#10-user-management)
11. [Backup](#11-backup)
12. [Changing Your Password](#12-changing-your-password)
13. [Roles and What Each Role Can Do](#13-roles-and-what-each-role-can-do)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. What Is This System?

This is the data management system for Region V's Unclassified ARRs (Agrarian Reform Records). It lets staff view, update, and track the status of landholdings and their ARBs (Agrarian Reform Beneficiaries) — from initial validation all the way to distribution of COCROMs.

---

## 2. Business Rules

This section explains how the system works — the rules that determine what status a landholding gets and what data is required at each step.

### 2.1 ARR Statuses

Every landholding record has a status. The system sets it automatically based on the data entered. You cannot manually pick any status except **Not Eligible for Encoding** — all others are determined by the system.

The statuses go in this order:

| Status | What It Means | What Makes the System Set It |
|---|---|---|
| **For Initial Validation** | Default. No validation done yet. | No ARBs have been linked to the landholding. |
| **For Further Validation** | ARBs have been linked, but the total ARB area does not yet equal the LH area. | ARBs are present, but their combined allocated area ≠ validated AMENDAREA. |
| **For Encoding** | Ready for COCROM encoding. | ARBs are linked AND the validated AMENDAREA and condoned amount are both confirmed. |
| **Partially Encoded** | Some COCROMs have been encoded. | At least one ARB has a Date Encoded, but not all of them. |
| **Fully Encoded** | All COCROMs have been encoded. | All ARBs have a Date Encoded. |
| **Partially Distributed** | Some COCROMs have been distributed. | At least one ARB has a Date Distributed, but not all of them. |
| **Fully Distributed** | All COCROMs have been distributed. | All ARBs have a Date Distributed. |
| **Not Eligible for Encoding** | This landholding will not be encoded. | Set manually by an editor with a required reason (e.g., Non-Carpable, Under Classified ARR, With COFP). |

> **Important:** The statuses are successive. A landholding cannot skip a step. For example, it cannot become **Fully Encoded** if the total ARB area does not equal the LH area — even if all the Date Encoded values are already filled in.

### 2.2 Key Business Rules

**Rule 1 — ARB total area must equal LH area before encoding.**
A landholding stays at **For Further Validation** until the combined allocated area of all its linked ARBs matches the validated AMENDAREA of the landholding. Once they match, and the condoned amount is also confirmed, the system moves it to **For Encoding**.

**Rule 2 — Area and condoned amount must be confirmed before encoding.**
You must confirm the validated AMENDAREA and the validated condoned amount (using Area & Amount Confirmation) before the landholding can move to **For Encoding**. Both values must be greater than zero.

**Rule 3 — Allocated area and condoned amount per ARB are locked at "For Encoding".**
Once a landholding reaches **For Encoding** status or beyond, the allocated area and allocated condoned amount fields for its ARBs can no longer be edited. This protects the confirmed data.

**Rule 4 — Not Eligible for Encoding requires a reason.**
When marking a landholding as **Not Eligible for Encoding**, you must provide a reason (e.g., Non-Carpable, With COFP, Under Classified ARR). The system will not accept the update without it.

**Rule 5 — Status changes are logged.**
Every status change is recorded in the Audit Log with the timestamp, the user who made the change, and the source of the change (batch update, individual edit, etc.).

### 2.3 Data Validation Rules

These are the specific rules the system checks when you submit data:

**SEQNO format**
- Must match exactly what is in the database (e.g., `R5-UC-04277`). Spaces, wrong capitalization, or extra characters will cause the record to be reported as "not found."

**Validated AMENDAREA**
- Must be a numeric value in hectares.
- Must be greater than zero.

**Validated Condoned Amount**
- Must be a numeric value.
- Must be greater than zero.

**ASP Status**
- Only accepts: `With ASP` or `Without ASP`. Any other value will be rejected.

**Batch paste format (LH updates)**
- Each line must follow the format: `SEQNO_DARRO` → `Tab` → `value`.
- For Municipality & Barangay: `SEQNO_DARRO` → `Tab` → `Municipality` → `Tab` → `Barangay` (barangay is optional).
- Lines with the wrong format are skipped and listed in the error section of the preview.

**Batch paste format (ARB updates)**
- Each line must follow the format: `SEQNO_DARRO` → `Tab` → `ARB_ID` → `Tab` → `value`.

**Date format (ARB Date Encoded / Date Distributed)**
- Must be in `YYYY-MM-DD` format (e.g., `2026-01-15`).

**Jurisdiction**
- You can only update records within your assigned office level. Records outside your jurisdiction are automatically skipped and listed in the preview.

### 2.4 Priority Targets

Based on the COCROM Group Notice (s2026):

| Priority | Target Status |
|---|---|
| **High Priority** | Fully Distributed |
| **Medium Priority** | Partially Distributed |
| **Not Eligible** | Not Eligible for Encoding |

All landholdings should end up in one of these three statuses by the time the regional COCROM distribution is complete.

---

## 3. Logging In

1. Open your browser and go to the system URL.
2. Enter your **Username** and **Password**.
3. Click **Sign In**.

> If you enter the wrong credentials, an error message will appear. Double-check your username and password, then try again.

**First-time login:** If your account was just created, you will be asked to set a new password before you can use the system. Just fill in the form and click **Set New Password**. You will only need to do this once.

> To sign out, click **Sign Out** at the bottom of the sidebar.

---

## 4. Navigating the System

After logging in, you will see a green sidebar on the left side of the screen. This is the main menu.

| Menu Item | What It Is |
|---|---|
| **Dashboard** | Summary charts and stats for the whole region or your province |
| **Records Browser** | View and search all landholding records |
| **Batch Update (LH)** | Update multiple landholding records at once |
| **ARB Batch Update** | Upload and update ARB information in bulk |
| **Audit Log** | See a history of all changes made in the system |
| **User Management** | Add or manage user accounts |
| **Backup** | Create and restore database backups |

> Not all menu items are visible to all users. What you see depends on your role. See [Section 12](#12-roles-and-what-each-role-can-do) for details.

On mobile, tap the menu icon to open the sidebar. Tap anywhere outside it to close it.

At the bottom of the sidebar, you can see your name, role, and office level.

---

## 5. Dashboard

The Dashboard is the first thing you see after logging in. It gives you an overview of all the landholding records.

### Stat Cards

At the top, you will see a row of cards showing key numbers:

- **Total LHs** — total number of landholding records
- **Total Area** — combined area of all landholdings (in hectares)
- **Validated LHs** — how many records have a validated area
- **No Issues** — records with no data problems
- **Landowners** — number of distinct landowners
- **Total Condoned** — total condoned amount across all records
- **COCROMs Encoded** — number of COCROMs that have been encoded
- **CARPable ARBs** — number of distinct ARBs tagged as CARPable

### Area Toggle

Above the cards, you can switch between **Validated** and **Original** area figures by clicking the toggle. This affects the area values shown throughout the dashboard.

### Province Filter (Regional users only)

If you are a regional user, you can filter the dashboard to show data for one or more specific provinces. Just click the province names you want to include.

### Charts

Below the stat cards, you will find several charts:

**Records by Province** — shows how many LHs are in each province.

**Records by Status** — shows the breakdown of landholdings by their current status (e.g., For Initial Validation, For Encoding, Fully Distributed, etc.).

**Status of Encoding** — shows how many ARBs have been encoded, are still for encoding, or are not eligible, for landholdings that are already at "For Encoding" status or beyond.

**Status of Distribution** — shows how many COCROMs have been distributed per province, for landholdings at "Partially Distributed" or "Fully Distributed" status.

**Landholdings Not Eligible for Encoding** — shows which landholdings have been marked as not eligible, broken down by province and by reason.

---

## 6. Records Browser

Go to **Records Browser** in the sidebar to search and view all landholding records.

You will see a table with all the landholdings. Each row is one record.

### Searching and Filtering

Use the filter bar at the top of the table to narrow down the records. You can filter by:

- **SEQNO** — the landholding's sequence number (e.g., R5-UC-04277)
- **Landowner name**
- **Province**
- **Status**
- **Data flags** (e.g., records with zero area, negative condoned amount, or cross-province duplicates)

Click **Clear** to remove all filters.

### Viewing a Record

Click any row to open the full details of that landholding. This shows all the fields for that record, including the list of ARBs linked to it.

From the detail view, you can also edit individual fields if your role allows it.

---

## 7. Batch Update (LH)

This section is for updating multiple landholding records at the same time. It has two sub-pages.

> This section is only visible to **Editors** and above.

### 6.1 LH Info Update

Go to **Batch Update (LH) > LH Info Update**.

This page lets you paste data from Excel to update several landholdings at once. You can update:

- **Status** — mark landholdings as "Not Eligible for Encoding" with a reason
- **Validated AMENDAREA** — update the validated area (in hectares)
- **Validated Condoned Amount** — update the validated condoned amount (must be greater than 0)
- **Municipality & Barangay** — update the location details
- **ASP Status** — set "With ASP" or "Without ASP"

**How to use it:**

1. Select the type of update you want to do by clicking one of the colored buttons.
2. Copy the relevant columns from your Excel file. The format is always: **SEQNO_DARRO**, then **Tab**, then the value. Each record is on its own line.
3. Paste the copied data into the text area.
4. Click **Preview** to see what will be updated before confirming.
5. Review the preview. It will show which records will be updated and flag any errors or records it could not find.
6. Click **Apply Updates** to save the changes.

> If any records are outside your jurisdiction, they will be skipped automatically.

### 6.2 Area & Amount Confirmation

Go to **Batch Update (LH) > Area & Amount Confirmation**.

This page is for confirming the validated area and condoned amount of landholdings that are ready to move forward. It works the same way as LH Info Update — paste your data from Excel, preview the results, then confirm.

You can confirm:
- Area only
- Condoned amount only
- Both at the same time

Records that already have confirmed values or are blocked (e.g., already past "For Encoding" status) will be skipped.

---

## 8. ARB Batch Update

This section is for managing ARB (Agrarian Reform Beneficiary) data. It has two sub-pages.

> This section is only visible to **Editors** and above.

### 7.1 ARB Upload & Viewer

Go to **ARB Batch Update > ARB Upload & Viewer**.

Here you can see all the ARBs linked to each landholding, and upload new ARB data from an Excel file.

To upload ARBs, prepare your file following the required format, then use the upload button on the page. The system will show you a preview before saving.

You can also view, edit, or delete individual ARBs from this page by clicking on a landholding to expand it.

### 7.2 ARB Info Update

Go to **ARB Batch Update > ARB Info Update**.

This page lets you update ARB fields in bulk by pasting data from Excel. The format is always: **SEQNO_DARRO**, then **Tab**, then **ARB_ID**, then **Tab**, then the value.

You can update:

- **Date Encoded** — the date the COCROM was encoded
- **Date Distributed** — the date the COCROM was distributed
- **ARB Name** — the name of the ARB
- **Allocated Area** — area allocated to the ARB (locked once the LH is "For Encoding" or beyond)
- **Allocated Condoned Amount** — condoned amount allocated to the ARB (also locked at "For Encoding" or beyond)

Just pick the type, paste your data, preview, then confirm.

---

## 9. Audit Log

Go to **Audit Log** in the sidebar.

This page shows a record of every change made in the system — who changed what, when, and what the old and new values were.

> This page is only visible to **Admins** and above.

### Reading the Log

Each row in the table is one change. The columns show:

- **Timestamp** — when the change was made
- **SEQNO** — which landholding was affected
- **Landowner** — the landowner's name
- **Province** — the province of the landholding
- **Action** — the type of change (e.g., Status Update, Amount Update, ARB Edit)
- **Field** — which field was changed
- **Old Value / New Value** — what it was before and after
- **Changed By** — the username of the person who made the change
- **Source** — where the change came from (e.g., individual edit, batch update, ARB upload)

If the old or new value is very long, click the row to expand it and see the full text.

### Filtering

Use the filters at the top to find specific changes. You can filter by SEQNO, action type, username, date range, and province.

### Exporting

Click **Export CSV** to download the current filtered results as a spreadsheet.

---

## 10. User Management

Go to **User Management** in the sidebar.

This page is for managing who has access to the system.

> This page is only visible to **Admins** and above.

### Viewing Users

You will see a table of all users with their name, username, role, office level, province or municipality, and account status.

### Adding a New User

1. Click **New User**.
2. Fill in the **Full Name** and **Username**.
3. Set the **Role** and **Office Level**.
4. If the user is provincial or municipal, select their **Province** and/or **Municipality**.
5. Optionally set a password, or leave it blank to let the system generate one.
6. Click **Create User**.

If the system generated a password, it will be shown on screen. Copy it and share it with the user. They will be asked to change it the first time they log in.

### Editing a User

Click **Edit** next to a user to change their name, role, office level, or location.

### Resetting a Password

Click **Reset PW** next to a user to set a new temporary password for them. The user will be required to change it on their next login.

### Activating or Deactivating a User

Click **Deactivate** to disable a user's access, or **Activate** to restore it. Deactivated users cannot log in.

---

## 11. Backup

Go to **Backup** in the sidebar.

This page lets you manage database backups. It is only visible to **Super Admins**.

> The system automatically creates a backup every day at 2:00 AM. These are labeled "Auto" in the list.

### Creating a Manual Backup

Click **Create Backup** at the top of the page. The backup will appear in the list within a few seconds.

### Downloading a Backup

Click **Download** next to any backup to save a copy to your computer.

### Restoring a Backup

1. Click **Restore** next to the backup you want to restore.
2. A warning will appear. Read it carefully — restoring will replace all current data with the backup.
3. Click **Confirm Restore** to stage it.
4. The restore will take effect the next time the server restarts.

An amber banner will appear at the top of the page to remind you that a restore is staged. If you change your mind, click **Cancel Restore** in the banner.

> Restoring a backup cannot be undone. Make sure you have a recent backup of your current data before restoring an older one.

### Deleting a Backup

Click **Delete** next to a backup, then confirm. Deleted backups cannot be recovered.

---

## 12. Changing Your Password

1. Click your name at the bottom of the sidebar.
2. Select **Change Password**, or go directly to `/change-password`.
3. Enter your **Current Password**.
4. Enter your **New Password** (at least 8 characters).
5. Enter it again in **Confirm New Password**.
6. Click **Set New Password**.

---

## 13. Roles and What Each Role Can Do

| Role | Dashboard | Records | Batch Update | ARB Update | Audit Log | User Management | Backup |
|---|---|---|---|---|---|---|---|
| **Viewer** | Yes | Yes | — | — | — | — | — |
| **Editor** | Yes | Yes | Yes | Yes | — | — | — |
| **Admin** | Yes | Yes | Yes | Yes | Yes | Yes | — |
| **Super Admin** | Yes | Yes | Yes | Yes | Yes | Yes | Yes |

**Office levels** also affect what data you see:

- **Regional** — sees all provinces and can filter by province on the dashboard.
- **Provincial** — sees only the records for their assigned province.
- **Municipal** — sees only the records for their assigned municipality.

---

## 14. Troubleshooting

| Problem | What to Do |
|---|---|
| Cannot log in | Check your username and password. If you forgot your password, ask your administrator to reset it. |
| Page shows "Connection error" | Check your internet connection and try refreshing the page. |
| A record is missing from the list | Try clearing your filters in the Records Browser. |
| A batch update says "not found" | Double-check that the SEQNO in your Excel file matches exactly what is in the system (e.g., R5-UC-04277). |
| Changes are not saving | Make sure you clicked **Apply Updates** or **Confirm** — previewing alone does not save anything. |
| You do not see a menu item | That feature may not be available for your role. Contact your administrator if you think you should have access. |
| The restore banner is showing | A restore has been staged and will apply on the next server restart. Click **Cancel Restore** if you did not intend to do this. |

---

*LTID Group · DAR Region V*

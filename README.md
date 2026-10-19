# IOU

A phone-first web app for tracking and splitting expenses on group trips.

- Anyone can create a trip, invite others with a link, and everyone logs expenses live from their own phone.
- Each trip has one **settle currency** (set by whoever creates it). Balances are always in that currency.
- **Spending currency (optional):** a group can also have a spending currency, the one expenses start in (for example EUR for a euro trip settled in CAD). Everything is still calculated in the settle currency. Each person can have a **card statement currency** (set beside their name in Group settings); an expense paid by someone whose card is in another currency asks for what the card was charged in that currency, which is converted at the group's rate for it until the exact settle-currency amount is typed in. Anyone can still switch an expense back to the settle currency.
- **Icon and colour:** every group has one of 100+ drawn icons on one of 30 colours (defaults by group type). Owners and co-admins change them in Group settings; they show on the groups list, the group header, the Overview, read-only links, Excel and PDF reports and invoices.
- Local expense: type the amount. Foreign expense: flip **"Paid in a different currency"**, enter the local amount, and later come back and enter what your card statement actually charged in the settle currency. Until then it shows as an estimate (if you set a rate) or is left out of balances.
- **Categories:** pick a category (Food, Drinks, Grocery, Transportation, Housing, Attractions, Activities, Entertainment, Shopping, Souvenirs, Fees, Fines) and then a sub-category (for example Transportation › Train). Both levels also accept any text you type ("Custom…"), and customs you used before come back as chips.
- **Breakdown tab:** every expense, grouped by category, sub-category, date or vendor, as total spent or just your share, with drill-down to the individual expenses. The Overview has the same breakdown across groups, one currency at a time.
- **Groups:** a group can be a trip, a household, an event, or anything you type. Light, dark or automatic appearance.
- Splits: equal among any people, by percent, exact amounts, or shares.
- Balances update in real time, with a line-by-line "why" for every amount owed.
- Receipt photos/PDFs are stored per expense, browsable in a **Receipts** tab (by date, vendor or category, with a "missing a receipt" list), and downloadable as one ZIP with descriptive file names.
- **Reports:** a full trip report (Excel or PDF) with every transaction, each person's share, the payment plan and the "why"; plus an **itemized invoice PDF** for any person or couple, crediting what they paid themselves. Both come in **pending** (includes estimates) or **final** (confirmed amounts only) versions.
- **Payments:** record full or partial payments with any date, a method and a note. A payment shows as **Sent** until the person who was paid ticks **Received**. Everything records who entered, edited and confirmed it.
- **Overview tab:** see what each person owes you (or you owe them) across all your trips, or just some of them, per currency, record payments against it, and export a PDF.
- Travelers who only appear in splits do **not** need an account. Only people who add expenses sign in. People without accounts can still check their own balance through a private **balance link** (read-only).

**Stack:** React + TypeScript + Vite (static site) · Supabase (Postgres, Auth, Storage, Realtime). No server of your own to run.

---

## 1. Set up Supabase (about 10 minutes)

1. Create a free project at <https://supabase.com>.
2. Open **SQL Editor** and run these four files, **in order, each once**:
   1. `supabase/migrations/0001_init.sql`: tables, security rules, invite/join functions, the private `receipts` storage bucket, realtime.
   2. `supabase/migrations/0002_share_links.sql`: read-only balance links for people without accounts.
   3. `supabase/migrations/0003_payments_and_overview.sql`: payments you can record in part and have the receiver confirm, "who entered / edited it", and the cross-trip Overview. 
   5. `supabase/migrations/0005_roles_and_scoped_links.sql`: members who change only what they added, and read-only links for the whole group or for specific people.
   7. `supabase/migrations/0007_spending_currency_and_group_look.sql`: spending currency, statement amounts, per-person statement currency, group icon and colour. **Run it after 0006 and before you deploy the matching app update.** Safe to run more than once, like 0005 and 0006.
  8. `supabase/migrations/0008_expense_description.sql`: adds the Description field to expenses (what it was for, such as "Florence to Rome"). **Run it after 0007 and before you deploy the matching app update.** Safe to run more than once.
  9. `supabase/migrations/0009_vaults.sql`: adds Vaults (tickets, reservations, passes and QR codes, documents, contacts), their private `vault` file storage, members and roles, optional link to one group, and read-only share links. **Run it after 0008.** Read-only vault links show details only (no photos, PDFs or QR codes), so they need no extra Supabase setting. Safe to run more than once.
 10. `supabase/migrations/0010_vault_description.sql`: adds a Description to every vault item (title "Italo", description "Venice to Florence"). **Run it after 0009.** Safe to run more than once.
 11. `supabase/migrations/0011_expense_status_and_vault_link.sql`: two optional extras on an expense: a status label (Final, Estimate, Pending, Needs info; a label only, no maths change) and a link to a vault item (shows a small icon). **Run it after 0009 and 0010.** Safe to run more than once.
 12. `supabase/migrations/0012_itineraries.sql`: Itineraries, a timeline of transport, stays, food, attractions, activities, shopping, work and custom items with dates, places, people, vendor and notes. Optional links to one group and one vault; own members and roles; read-only links (notes off by default; vault files never included). **Run it after 0011.** Safe to run more than once.
 13. `supabase/migrations/0013_expense_itinerary_link.sql`: an expense can point at an itinerary item (a small icon shows for people who can see the item). Totals per item are shown only to group members. **Run it after 0012.** Safe to run more than once.
 14. `supabase/migrations/0014_personal_vault.sql`: a private "My vault" for each person (created the first time they open it): one member, no invite, no group link. The Vaults page gets a Group / Private / Both switch. **Run it after 0013.** Safe to run more than once.
 15. `supabase/migrations/0015_expense_personal_vault_link.sql`: an expense can link to one of your own My vault items (only you see the icon). **Run it after 0014.** Safe to run more than once.
   6. `supabase/migrations/0006_simpler_roles_and_link_notes.sql`: co-admins, and notes on read-only links. **Run 0005 and then 0006 before you deploy the matching app update.** Everyone who is a member today stays a member and keeps working as before.
   4. `supabase/migrations/0004_categories_and_group_types.sql`: sub-categories on expenses and a type for each group (Trip, Household, Event, or anything typed). **Run this one before you deploy the matching app update**, because the new app calls it. (If you already ran 0001 to 0003 earlier, run only the new one.)
3. **Authentication → URL Configuration**
   - *Site URL*: your deployed address (for example `https://trips.example.com`).
   - *Redirect URLs*: add `https://trips.example.com/**` and `http://localhost:5173/**`.
4. **Authentication → Providers → Email**: for a small private group you can turn off "Confirm email" so people can sign up and go straight in. Leave it on for a public product.
5. **Project Settings → API**: copy the *Project URL* and the *anon public* key.

> **Email limits:** Supabase's built-in email sender is capped at about **2 emails per hour for the whole project** (sign-up confirmations, magic links and password resets all count) and often lands in spam. Before inviting real users, add your own SMTP provider under **Authentication → SMTP Settings** (this raises the default cap to about 30/hour, adjustable under Rate Limits). Or, for a small private group, leave **Confirm email** off and use passwords only, which needs no email at all.
>
> **Free-plan limits (verify current numbers on supabase.com/pricing):** about 1 GB of file storage in total, 5 GB of bandwidth, and free projects **pause after 7 days of inactivity**. A paused project means the app stops working until you click Restore in the dashboard. Upgrade to Pro for real use. This app also caps each receipt file at 10 MB (set in the migration).

## 2. Run it locally

```bash
cp .env.example .env        # paste your URL and anon key
npm install
npm run dev                 # http://localhost:5173
```

## 3. Deploy

Any static host works. Build command `npm run build`, output directory `dist`, and set the same two environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
`wrangler.jsonc` (Cloudflare), `vercel.json` (Vercel) and `netlify.toml` (Netlify) make deep links like `/join/abc123` open the app instead of a 404.

Then update the Supabase *Site URL* / *Redirect URLs* (step 3 above) to the real address.

## Host it on Cloudflare (nothing runs on your computer)

1. Finish the Supabase part above (run the fifteen SQL files, copy the Project URL and anon key).
2. Put the project files on GitHub (a new repository; on the web page choose **uploading an existing file** and drag in the *contents* of the unzipped `trip-ledger` folder, so `package.json` and `wrangler.jsonc` are at the top level).
3. In the Cloudflare dashboard open **Workers & Pages** → **Create application** → **Import a repository**, connect GitHub and pick the repository. Keep the Worker name `iou` (it must match `name` in `wrangler.jsonc`), set **Build command** `npm run build` and leave **Deploy command** as `npx wrangler deploy`.
4. Add two **build variables** (the build-time ones, not runtime): `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (optionally `NODE_VERSION` = `20`). Deploy. If the first build ran before you added them, add them and retry the build.
5. Copy the address Cloudflare gives you (`https://iou.<your-subdomain>.workers.dev`) and put it in Supabase: **Authentication → URL Configuration → Site URL**, and add `https://<that address>/**` under Redirect URLs.
6. To update the app later, upload the changed files to GitHub; Cloudflare rebuilds automatically.

`wrangler.jsonc` tells Cloudflare to serve the built site as a single-page app, so invite and balance links work.

## How people use it

1. Sign up, tap **Create a trip**, choose the name and settle currency.
2. Open the **Trip** tab: copy or share the invite link; add any travelers who won't have accounts.
3. Friends open the link, sign in, and pick which traveler they are (or add themselves).
4. Tap **+** to log an expense. Everyone sees it immediately.
5. **Balances** shows who is ahead, who pays whom (itemized or fewest payments), and records settle-up payments.

## Where receipts are stored

In your Supabase project's **Storage**, in a private bucket named `receipts`. Each file lives at `<trip id>/<expense id>/<random name>.jpg`, so it is tied to exactly one transaction and one trip by its location, and the database also records which expense it belongs to. Nobody can open a file without being a member of that trip (links are temporary and signed). Photos are shrunk on the phone before upload (long edge 1800 px, JPEG), typically a few hundred KB each; the Supabase free plan includes about 1 GB of file storage at the time of writing, so check their pricing page for current limits.

The random names are for safety, not for people. To match receipts to transactions use the app: the **Receipts** tab shows each photo with its trip, date, vendor and amount, **Download all receipts (ZIP)** names every file `2026-09-12 - Vendor - EUR 64.50.jpg` and adds an `index.csv`, and the Excel report has a **Receipt files** sheet listing the same names next to each transaction.

## Reports and invoices

Open **Balances → Open reports**.

- **Full trip report** (Excel or PDF): all transactions with details and split, balances, the payment plan (itemized and fewest-payments), the line-by-line "why", payments recorded. Excel adds *Shares by person* and *Receipt files* sheets.
- **Invoice to send** (PDF): choose one person, or several to bill together. It lists every transaction with *their* share, then subtracts what they paid themselves and any payments already settled, and ends with the amount due and who to pay. If they are owed money it shows a credit instead. Optional: a note (for example payment details) and the receipt photos appended. On phones, the "Share…" button sends it through email, WhatsApp, etc.

The numbers always reconcile with the Balances tab: amount due = share of all costs − expenses they paid − payments they made + payments they received. An invoice is a cost-sharing statement between travelers, not a tax invoice.

## Payments: partial, Sent, Received

In **Balances → Payments → Record a payment** (or the button on any "who pays whom" row, which pre-fills what is left):

- **Any amount.** A part payment is fine: the screen shows how much will still be owed afterwards. Paying more than is owed becomes a credit.
- **Any date**, a **method** (e-transfer, cash, bank transfer, card, PayPal, Venmo, cheque or your own), and a **note**.
- **Sent → Received.** A payment starts as **Sent** unless you are the person being paid. The person who was paid then ticks **Received** (a confirmation step stops stray taps, and a mistaken tick can be undone). **Sent payments are not counted in balances until they are received**, so a debt only shrinks once the receiver agrees. The trip's "who pays whom" rows are labelled **Unpaid / Partly paid / Pending / Paid** (Pending = a payment is sent and awaiting confirmation).
- **Receiver has no account?** Another member of the trip can tick Received on their behalf (the payer cannot confirm their own payment, except that the trip owner can, so a trip with a single account holder is never stuck). The record says it was confirmed on their behalf, and by whom.
- **Who entered it.** Each payment (and each expense) shows who added it, who last edited it, and who confirmed it. The database stamps this; it cannot be forged from the app.
- **Editing and deleting.** The person who entered a Sent payment, the two people in it, or the trip owner can edit it. A Received payment can be edited by the person who received it or the owner; changing who or how much sends it back to Sent unless the receiver made the change. Deleting always asks first.

## Overview across trips

The **Overview** tab (bottom bar on the Trips screen) answers "does Jack owe me from another trip too?".

- It combines the trips you pick (all by default) and lists each person with what they owe you or you owe them, **separately for each currency** (nothing is converted at an invented rate).
- Tap a person for the trip-by-trip breakdown with every item, then **Record a payment** once and it is spread across the trips that owe it (or edit the split yourself). Each trip gets its own payment, tied together.
- **Export PDF** gives either everyone or a single person's statement.
- People are matched across trips by account or by exact name. If "Jack" and "Jack S." are one person, or two different Jacks got merged, fix it under **People**. Those links are private to you.
- **Everything with one person is netted into one figure per currency.** Example: Jack owes you 100 (Banff) and 50 (Bar), and you owe Jack 25 (Jill's Birthday) → the Overview says **Jack owes you 125**, with +100, +50 and −25 shown underneath. Payments that have been received reduce it; payments still marked Sent do not yet. When you record a payment, the suggested amount is that net figure (125), applied to the oldest trips first.
- The Overview uses the direct amounts between you and each person (the "itemized" view), which can differ from a trip's "fewest payments" suggestion.

## Who can see and change what

| | Account? | How they get in | Can |
|---|---|---|---|
| Owner | yes | creates the group | everything, including deleting the group. Nobody can remove or demote the owner |
| Co-admin | yes | the owner (or another co-admin) sets someone's level | everything the owner can, except delete the group or touch the owner: edit any expense or payment, change people's level, create links, change settings |
| Member | yes | invite link (everyone starts here) | read everything, add expenses and payments, change or delete only the expenses they added |
| Link holder | no | a read-only link from an owner or co-admin | read only: the **entire group** (receipts and notes included) or **specific people** (only their own expenses, with the notes on them, and their own share) |

There is no view-only account. To let someone look without adding anything, send a read-only link. Set someone's level in **More → Group settings → Members with accounts**, and create or turn off links under **Read-only links**. Only owners and co-admins see the links.

**Receipt photos on an entire-group link** need one Supabase setting: **Authentication → Sign In / Providers → Allow anonymous sign-ins** (turn it on). A visitor then gets a throwaway session with no email, which can read that group's receipts only while the link exists. If it is off, the rest of the page works and the Receipts tab says photos can't be shown.

## Balance links (for people without accounts)

In **Trip → Balance links**, pick one person (or a couple) and create a private link such as `https://yourapp/b/<48 random characters>`. Whoever opens it, with no sign-up, sees a read-only page: what they owe or are owed, how to pay, a summary, and every item with their share, plus a "Download as PDF" button. The numbers are computed by the same code as the invoice, so they always match it and the Balances tab.

**What a link holder can see:** the trip name and currency, the names of the travelers, and the trip's expenses (date, vendor, category, place, amounts, who paid, how each is split) and recorded payments. **What they never get:** receipts, notes, account emails or ids, the invite code, or other links. They cannot change anything, and nothing else in the database is reachable without signing in.

**Safety model:** the link *is* the password, so send it only to the person it is for. Each link is ~180 bits of randomness (not guessable), can be set to expire (7/30/90 days), and you can **turn it off** instantly (the link stops working at once; creating a new one gives a different address). Each link shows when it was last opened. Unknown, expired and turned-off links all show the same "Link not available" page. Anyone who joins the trip with an account can create and turn off links. A trip can have up to 50.

If you want link holders to see *less* (only their own transactions) or to see receipts, that needs a stricter variant; it is not built.

## How trips stay separate

Every row in the database carries a `group_id`, and Postgres **row-level security** only lets a signed-in user read or write rows of groups they belong to. Receipts live in a private bucket under `<group_id>/…` with the same rule. Joining requires the group's invite code (a 16-character random secret; the owner can replace it at any time, which kills the old link). Composite foreign keys also make it impossible to attach a person, expense or payment from one group to another.

The anon key in the browser is public by design. **Never put the `service_role` key in this app.**

## Tests

```bash
npm test        # ledger math, payments, overview, invoices, receipts ZIP, exports, balance links, and the screens, categories, breakdown and themes (278 tests)
```

Database rules are tested against a real Postgres: `rls_test.sql` (52 checks: cross-group reads/writes, invite flow, owner rules, currency lock, storage access) and `payments_test.sql` (70 checks: who may confirm, edit, undo and delete a payment, partial amounts, cross-trip batches that succeed or fail as a whole, private contacts, unforgeable authors) `roles_test.sql` (54 checks: members change only their own expenses, co-admins change anything but cannot remove the owner or delete the group, who may change levels, group links versus person links, other people's amounts are not sent on a person link, receipt access follows the link) and `share_links_test.sql` (49 checks: an anonymous visitor cannot read any table or call any other function, tokens cannot be guessed or crossed between trips, nothing private is returned, expiry and turn-off work). Run the second on a fresh database (rebuild it first), then `SHARED_SHAPE_JSON=/tmp/shared_shape.json npx vitest run src/lib/shared.test.ts` checks that the real database output feeds the app's math. Needs a local Postgres with the Supabase roles stubbed:

```bash
createdb tl
psql -d tl -f supabase/tests/stub.sql                     # fake auth/storage schemas + roles
psql -d tl -v ON_ERROR_STOP=1 -f supabase/migrations/0001_init.sql
psql -d tl -v ON_ERROR_STOP=1 -f supabase/migrations/0002_share_links.sql
psql -d tl -v ON_ERROR_STOP=1 -f supabase/migrations/0003_payments_and_overview.sql
psql -d tl -v ON_ERROR_STOP=1 -f supabase/migrations/0004_categories_and_group_types.sql
psql -d tl -v ON_ERROR_STOP=1 -f supabase/migrations/0005_roles_and_scoped_links.sql
psql -d tl -v ON_ERROR_STOP=1 -f supabase/migrations/0006_simpler_roles_and_link_notes.sql
psql -d tl -v ON_ERROR_STOP=1 -f supabase/migrations/0007_spending_currency_and_group_look.sql
psql -d tl -v ON_ERROR_STOP=1 -f supabase/migrations/0008_expense_description.sql
psql -d tl -v ON_ERROR_STOP=1 -f supabase/migrations/0009_vaults.sql
psql -d tl -v ON_ERROR_STOP=1 -f supabase/migrations/0010_vault_description.sql
psql -d tl -v ON_ERROR_STOP=1 -f supabase/migrations/0011_expense_status_and_vault_link.sql
psql -d tl -v ON_ERROR_STOP=1 -f supabase/migrations/0012_itineraries.sql
psql -d tl -v ON_ERROR_STOP=1 -f supabase/migrations/0013_expense_itinerary_link.sql
psql -d tl -v ON_ERROR_STOP=1 -f supabase/migrations/0014_personal_vault.sql
psql -d tl -v ON_ERROR_STOP=1 -f supabase/migrations/0015_expense_personal_vault_link.sql
psql -d tl -f supabase/tests/rls_test.sql | grep -E "PASS|FAIL"      # then rebuild the database and run share_links_test.sql, payments_test.sql, categories_test.sql, roles_test.sql, currency_test.sql (17 checks: who can change icon, colour and spending currency, statement amounts, what links carry), description_test.sql (8 checks) the same way
```

## Known limits (honest list)

- **Overview:** totals stay per currency (no conversion). It reads all your trips each time you open it, so it is meant for tens of trips, not thousands. It does not update live; use Refresh.
- **Payments:** only the person who was paid (or, for someone without an account, another member) can mark a payment Received. There is no automatic reminder to confirm. The trip owner can always edit or delete payments.

- **Trust model:** every member of a trip can edit or delete any expense on it (built for friends/family). There is no per-expense ownership or approval step.
- **Magic-link / confirmation emails** use the PKCE flow: open the link in the **same browser** you signed up in. Password sign-in has no such restriction.
- **Offline:** the app needs a connection. It is installable to the home screen, but entries are not queued offline.
- **Exchange rates are manual.** Estimates use the rate you set; statement amounts always override them.
- **PDF export and invoices** use a Latin-1 font, so names in other scripts print as `?`. The Excel export handles any script.
- **Invoices** embed receipt *photos* only (up to 60); PDF receipts stay in the trip and are noted as not embedded.
- **Orphaned files:** if a delete is interrupted, a stray receipt file can remain in storage (it is still private to the group).
- No account-deletion screen, no password-reset screen (use Supabase's reset email via the dashboard or add a reset page), no push notifications.
- A group owner cannot leave while they are the only owner; they delete the trip instead.
- **Read-only links** are bearer links: anyone who has the URL can open it until it expires or is turned off. The page shows live data (refresh to update); it does not email or notify anyone.

## Layout

```
supabase/migrations/0001_init.sql   schema, RLS, RPCs, storage rules
supabase/migrations/0002_share_links.sql   balance links for non-account people
supabase/migrations/0003_payments_and_overview.sql   payments (partial, Sent/Received), authorship, cross-trip contacts
supabase/migrations/0004_categories_and_group_types.sql   sub-categories, group types
supabase/migrations/0005_roles_and_scoped_links.sql   edit-own-only, group and person links
supabase/migrations/0006_simpler_roles_and_link_notes.sql   co-admins, notes on links
supabase/migrations/0007_spending_currency_and_group_look.sql  spending currency, statement amounts, icon and colour
supabase/migrations/0008_expense_description.sql  expense description
supabase/migrations/0009_vaults.sql  vaults, files, links
supabase/migrations/0010_vault_description.sql  vault item description
supabase/migrations/0011_expense_status_and_vault_link.sql  expense status and vault link
supabase/migrations/0012_itineraries.sql  itineraries
supabase/migrations/0013_expense_itinerary_link.sql  expense to itinerary item link
supabase/migrations/0014_personal_vault.sql  personal vault
supabase/migrations/0015_expense_personal_vault_link.sql  expense to personal vault item
supabase/tests/                     database tests + stub
src/lib/money.ts, ledger.ts         integer-cents math and the balance/"why" engine
src/lib/exporters.ts                Excel + PDF reports
src/lib/invoice.ts                  invoice maths + PDF
src/lib/receiptNames.ts, receiptsZip.ts   receipt file naming and ZIP
src/lib/useGroupData.ts             live group data (realtime + refetch)
wrangler.jsonc, vercel.json, netlify.toml   hosting config (Cloudflare / Vercel / Netlify)
src/pages/                          screens (SharedPage.tsx is the public balance page)
```

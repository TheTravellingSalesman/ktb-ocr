# Setting up the category sheet

The card digitizer can share one list of "Other" item categories between
every computer that uses it. The list lives in a Google Sheet that KTB owns.
Staff can also tidy the list by editing the sheet directly.

This is optional. Without a sheet, the app still works. Each "Other" item
just becomes a provisional category named after what the volunteer wrote.
Provisional rows are marked in the export so they can be merged later.

Setup takes about ten minutes. You need a Google account. A KTB Google
Workspace account is best. A free Google account made just for this works
too.

## 1. Make the sheet

1. Go to [sheets.new](https://sheets.new) to make a new, empty spreadsheet.
2. Name it something clear, like "KTB card categories".

## 2. Add the script

1. In the sheet, open **Extensions → Apps Script**.
2. Delete everything in the editor.
3. Paste in the contents of `apps-script/Code.gs` from this project.
4. Click the save icon.
5. In the toolbar, pick **setup** from the function list, then click **Run**.
   Google asks you to approve access to the spreadsheet the first time.
   Approve it.
6. Back in the sheet, you should now see two tabs, **Categories** and
   **Aliases**, each with a header row.

## 3. Publish it as a web app

1. In the Apps Script editor, click **Deploy → New deployment**.
2. Click the gear next to "Select type" and choose **Web app**.
3. Set **Execute as** to **Me**.
4. Set **Who has access** to **Anyone**.
5. Click **Deploy**, then copy the **Web app URL**. It ends in `/exec`.

The URL works like a password. Anyone who has it can read the category list
and add to it. Only share it with staff. The data is only category names, so
the risk is low.

## 4. Connect the app

1. Open the card digitizer and click **Settings**.
2. Paste the URL into **Category sheet address** and click **Save**.
3. Open Settings again. It should say it's connected, with the number of
   categories. The first connection adds every printed card category to
   the sheet.

Do this on each computer that uses the app.

## Tidying the list

Edit the **Categories** tab directly. The app picks up changes the next time
it loads.

- **Rename** a category by changing its `name`.
- **Merge** a category into another by setting its `status` to `merged` and
  putting the other category's `id` in `merged_into`. Its aliases follow it.
- **Retire** a category by setting its `status` to `retired`. The app stops
  offering it.
- **Move an alias** to a different category by changing the `category_id` on
  its row in the **Aliases** tab.

Don't change a category's `id`. Past exports refer to it.

## If the URL leaks

Make a new deployment (**Deploy → New deployment**), put the new URL in each
computer's settings, then archive the old deployment under **Deploy → Manage
deployments**.

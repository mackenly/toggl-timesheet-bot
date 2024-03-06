# toggl-timesheet-bot
 Send weekly timesheet PDFs using Toggl data

## Usage
1. Clone the repository
2. Install dependencies
```bash
npm install
```
3. Rename `wrangler.example.toml` to `wrangler.toml` and edit the variables
4. Create R2 buckets
5. Create secret for `TOGGL_API_TOKEN`
6. Deploy the worker
```bash
wrangler deploy
```

## TODO
- Automate creating PDFs on CRON
- Either email links to pages or the PDFs themselves to the user
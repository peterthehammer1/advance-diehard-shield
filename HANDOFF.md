# Die Hard Shield — Project Handoff

## What This Is
A call protection system for Advance Auto Parts that uses Retell AI voice agents to screen, block, or connect inbound callers based on whitelist/blacklist status. Built with Node.js, Express, PostgreSQL, and vanilla JS. Deployed on Railway.

## Live URLs
- **https://diespam.com** (primary)
- **https://diehard.autos** (secondary)
- Railway project: `humorous-mindfulness`

## Store Phone Numbers (call these to test)
| Store | Number |
|-------|--------|
| Atlanta #1042 | +1 (470) 465-8528 |
| Charlotte #2187 | +1 (980) 480-4127 |
| Raleigh #0891 | +1 (984) 985-3579 |

## How It Works
1. Someone calls a store number → Retell sends webhook to our server
2. Server checks if caller is whitelisted, blacklisted, or unknown
3. Routes to appropriate voice agent:
   - **Whitelisted** → Store Assistant (friendly, helps with parts questions)
   - **Blacklisted** → Call Blocked (delivers rejection message, hangs up)
   - **Unknown** → Call Screener (asks who they are and why they're calling)
4. After screening call ends, if caller passed (15s+ conversation, agent didn't reject) → auto-whitelisted for next time

## Current State (Feb 27, 2026)
### Done
- [x] Full UI redesign with Die Hard Shield branding
- [x] Retell integration: 3 agents, 3 store numbers, inbound routing
- [x] Auto-whitelist after successful screening
- [x] Post-call webhook captures call duration
- [x] Dashboard with live feed, metrics, auto-whitelisted panel
- [x] Phone list management (whitelist/blacklist CRUD)
- [x] Call log with filtering and pagination
- [x] Simulation mode with demo profiles

### Not Done / Known Issues
- [ ] Uncommitted code: auto-whitelist feature changes need to be committed and pushed to GitHub
- [ ] GitHub auto-deploy not linked to Railway (deploy is manual via `railway up`)
- [ ] Webhook secret key (`key_9f28113b90413b272d9bd412a040`) not used for request verification
- [ ] End-to-end test of auto-whitelist flow needed
- [ ] Classifier service (`services/classifier.js`) exists but isn't used in production webhook path
- [ ] No authentication on the dashboard or API endpoints
- [ ] No custom domain SSL verification status check

## Deploy
```bash
# From project root
railway up --detach --service app

# Check logs
railway logs --lines 20 --service app

# Run DB migrations (if schema changes)
psql "$DATABASE_PUBLIC_URL" -c "YOUR SQL HERE"
```

## Key Files
| File | What It Does |
|------|-------------|
| `routes/retell.js` | Inbound + post-call webhook handlers |
| `routes/retell-admin.js` | Agent setup/teardown, agent prompt configs |
| `services/retell.js` | Retell API client |
| `db/schema.sql` | Database schema (6 tables) |
| `public/js/dashboard.js` | Dashboard metrics, live feed, auto-whitelist panel |
| `public/js/app.js` | Tab switching, SSE connection, module init |

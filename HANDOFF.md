# Die Hard Shield — Project Handoff

## What This Is
A call protection system for Advance Auto Parts that uses Retell AI voice agents to screen, block, or connect inbound callers based on whitelist/blacklist status. Built with Node.js, Express, PostgreSQL, and vanilla JS. Deployed on Railway.

## Live URL
- **https://advance-dashboard-production.up.railway.app** (dashboard + API)
- Railway project: `advance-spam-filter`, service: `advance-dashboard`
- **Do NOT use** `diespam.com` for webhooks — it points to a different Railway project

## Store Phone Numbers (call these to test)
| Store | Retell Number | Transfer-to Landline |
|-------|--------------|---------------------|
| Cumberland #8580 | (606) 766-4269 | (606) 589-5489 |
| Atlanta #1042 | (470) 260-2720 | *not set* |
| Charlotte #2187 | (980) 342-4773 | *not set* |
| Raleigh #0891 | (984) 646-0959 | *not set* |

## How It Works
1. Someone calls a store's Retell number → Retell sends webhook to our server
2. Server checks if caller is whitelisted, blacklisted, or unknown
3. Routes to appropriate voice agent:
   - **Whitelisted** → Store Assistant — silently transfers to the real store (no AI speech)
   - **Blacklisted** → Call Blocked — AI greets, answers store questions, NEVER transfers. Tells caller to email shield@diespam.com
   - **Unknown** → Call Screener — AI greets, answers questions, transfers humans to store (auto-whitelists them), hangs up on bots/recordings
4. Dynamic variables (store address, hours, transfer number) injected per-call via inbound webhook

## Test Numbers
| Number | List | Expected Behavior |
|--------|------|-------------------|
| 519-991-8959 | Whitelisted | Silent transfer to store |
| 226-339-0620 | Whitelisted | Silent transfer to store |
| 519-804-0969 | Unknown | AI screening → transfer if human |

## Deploy
```bash
# Deploy code changes
railway up --detach --service advance-dashboard

# After deploying prompt/tool changes, update agents on Retell:
curl -X POST https://advance-dashboard-production.up.railway.app/api/retell/update-agents

# Check logs
railway logs --lines 20 --service advance-dashboard

# Run DB migrations
psql "postgresql://postgres:UlNkmZODESWGJdzzhOJspNnVoNwlMRpS@crossover.proxy.rlwy.net:41245/railway" -c "YOUR SQL HERE"
```

## Key Files
| File | What It Does |
|------|-------------|
| `routes/retell.js` | Inbound + post-call webhook handlers, auto-whitelist logic |
| `routes/retell-admin.js` | Agent prompts, transfer tool configs, setup/teardown/update-agents endpoints |
| `services/retell.js` | Retell API client (createAgent, updateLlm, phone numbers) |
| `db/schema.sql` | Database schema (6 tables) |
| `public/js/dashboard.js` | Dashboard metrics, live feed, auto-whitelist panel |
| `public/js/app.js` | Tab switching, SSE connection, module init |

## Retell Agents
| Agent | ID | LLM ID | Tools |
|-------|----|--------|-------|
| Store Assistant | agent_b56eccdd041d37ed9b513fca28 | llm_168b99acdf789f26fea397b107c7 | silent transfer_call |
| Call Blocked | agent_6c8fd12927981dcf87ec395949 | llm_faa42956779002da8fa7c150eb01 | end_call |
| Call Screener | agent_722fb3a5086102b1bdd165823d | llm_b60ce21f29c4e1d21834650857f9 | transfer_call, end_call |

## Known Issues
- Atlanta, Charlotte, Raleigh need real store landline numbers, addresses, hours
- `diespam.com` points to old `humorous-mindfulness` Railway project — do not use for webhooks
- Old Railway project `humorous-mindfulness` should be deleted
- Auto-whitelist backfill (call_started event) deployed but not fully tested end-to-end

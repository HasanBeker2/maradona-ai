# Maradona AI Project Assistant
## System Specification v2.0

---

## 1. Project Name

**Maradona AI Project Assistant**

### Name Rationale
The bot is triggered by **@Maradona** mentions in WhatsApp groups. It acts as an AI-powered project assistant: listening to group conversations, extracting tasks, creating them in Basecamp, and summarizing the week's activity.

---

## 2. Project Summary

Maradona AI is an internal team productivity system that:
- Connects to WhatsApp groups via **whatsapp-web.js** (browser-based, QR auth)
- Listens passively to selected groups
- Responds **only** when @Maradona is mentioned
- Extracts task metadata using **Claude AI**
- Creates tasks in **Basecamp**
- Stores all group messages persistently in **PostgreSQL**
- Generates and sends **weekly AI summaries** every Sunday evening
- Provides a **Next.js dashboard** for monitoring messages, tasks, and summaries

---

## 3. Architecture

### Monorepo Structure

```
/
├── backend/                  Node.js + TypeScript + Fastify
│   ├── src/
│   │   ├── db/migrate.ts     Auto-runs SQL migrations on startup
│   │   ├── services/
│   │   │   ├── whatsappClient.ts   whatsapp-web.js client + event routing
│   │   │   ├── messageHandler.ts   @Maradona trigger → Claude → Basecamp
│   │   │   ├── groups.ts           Group whitelist + privacy notice
│   │   │   ├── scheduler.ts        Weekly summary cron (node-cron)
│   │   │   ├── claude.ts           Task extraction + weekly summary
│   │   │   ├── basecamp.ts         Basecamp API (create todo, list, upload)
│   │   │   ├── mapping.ts          All DB queries
│   │   │   └── transcribe.ts       OpenAI Whisper voice transcription
│   │   ├── routes/
│   │   │   ├── api.ts              REST API for dashboard
│   │   │   └── auth.ts             Basecamp OAuth
│   │   ├── prompts/
│   │   │   ├── taskExtraction.ts
│   │   │   ├── voiceTaskExtraction.ts
│   │   │   └── weeklySummary.ts
│   │   ├── migrations/
│   │   │   ├── 001_initial.sql     user_mappings, project_mappings
│   │   │   └── 002_mvp.sql         groups, messages, tasks, weekly_summaries
│   │   └── server.ts
│   └── Dockerfile
├── frontend/                 Next.js 14 + Tailwind + TanStack Query
│   └── app/dashboard/
│       ├── page.tsx          Stats overview
│       ├── messages/         Message log with group filter
│       ├── tasks/            Tasks with Basecamp links + status badges
│       ├── summaries/        Weekly summaries per group
│       └── groups/           Group management + privacy notice
├── docker-compose.yml        postgres + backend + frontend
└── .env.example
```

---

## 4. Tech Stack

| Layer | Technology |
|---|---|
| Language | TypeScript |
| Runtime | Node.js 20 |
| Framework | Fastify |
| WhatsApp | whatsapp-web.js (puppeteer / QR auth) |
| Database | PostgreSQL 16 |
| AI / LLM | Claude API (claude-sonnet-4-6) |
| Voice | OpenAI Whisper |
| Project Management | Basecamp 3 API |
| Dashboard | Next.js 14 (App Router) |
| Styling | Tailwind CSS |
| Data Fetching | TanStack Query |
| Scheduling | node-cron |
| Logging | Pino |
| Validation | Zod |
| Containers | Docker + docker-compose |

---

## 5. Core Workflow

```
WhatsApp group message arrives
        ↓
whatsapp-web.js event listener receives it
        ↓
Is the group in the whitelist (groups table)?
  NO  → skip
  YES → persist message to messages table
        ↓
        First message in group? → send privacy notice
        ↓
        Does message mention @Maradona (or contain "Maradona")?
          NO  → done (message stored, no reply)
          YES → set has_trigger = true
                ↓
                Is it a voice message? → transcribe via Whisper
                ↓
                Fetch last 10 messages from DB as context
                ↓
                Send to Claude → get intent + task JSON
                ↓
                Execute intent (create task / save / list / help / ...)
                ↓
                Write task row to tasks table (sync_status = synced/failed)
                ↓
                Reply to WhatsApp group with confirmation + Basecamp link
```

---

## 6. Database Schema

### `user_mappings` (existing)
| field | type | description |
|---|---|---|
| id | uuid | primary key |
| nickname | text | informal name |
| whatsapp_phone | text | phone number |
| basecamp_user_id | text | Basecamp user id |
| active | boolean | enabled |

### `project_mappings` (existing)
| field | type | description |
|---|---|---|
| id | uuid | primary key |
| project_name | text | logical project name |
| bucket_id | text | Basecamp bucket id |
| todolist_id | text | Basecamp todolist id |
| active | boolean | enabled |

### `groups` (new)
| field | type | description |
|---|---|---|
| id | uuid | primary key |
| chat_id | text | whatsapp-web.js group JID (unique) |
| name | text | group display name |
| is_active | boolean | whether bot listens to this group |
| privacy_notice_sent | boolean | whether privacy notice was sent |
| created_at | timestamptz | |

### `messages` (new)
| field | type | description |
|---|---|---|
| id | uuid | primary key |
| group_id | uuid | FK → groups |
| sender_name | text | display name |
| sender_phone | text | phone number |
| body | text | message text |
| timestamp | timestamptz | when message was sent |
| has_trigger | boolean | true if @Maradona was mentioned |
| created_at | timestamptz | |

### `tasks` (new)
| field | type | description |
|---|---|---|
| id | uuid | primary key |
| message_id | uuid | FK → messages |
| title | text | task title |
| assignee | text | assignee name |
| deadline | date | due date |
| project | text | project name |
| notes | text | context notes |
| basecamp_todo_id | text | Basecamp todo id |
| basecamp_url | text | Basecamp todo link |
| sync_status | text | pending / synced / failed |
| created_at | timestamptz | |

### `weekly_summaries` (new)
| field | type | description |
|---|---|---|
| id | uuid | primary key |
| group_id | uuid | FK → groups |
| week_start | date | Monday of the week |
| week_end | date | Sunday of the week |
| summary_text | text | AI-generated summary |
| sent_at | timestamptz | when it was sent to WhatsApp |
| created_at | timestamptz | |

---

## 7. Trigger Mechanism

The bot responds **only** when:
1. `message.mentionedIds` contains the bot's own WhatsApp JID, **OR**
2. The message body contains the keyword "Maradona" (case-insensitive, via `containsTrigger()`)

For all other messages: stored silently in the database, no reply.

---

## 8. Supported Commands

All commands must include `@Maradona`:

| Command | Example |
|---|---|
| Create task | `@Maradona, API entegrasyonunu bitir, Ahmet, cuma` |
| Save/summarize | `@Maradona, toparla ve kaydet` |
| Save previous message | `@Maradona, üstteki mesajı kaydet` |
| Voice → tasks | Reply to audio with `@Maradona, görev çıkar` |
| Voice → note | Reply to audio with `@Maradona, kaydet` |
| File → Basecamp | Reply to file with `@Maradona, kaydet` |
| New list | `@Maradona, yeni liste oluştur: Sprint 3` |
| Reset list | `@Maradona, liste sıfırla` |
| Help | `@Maradona, yardım` |

---

## 9. Claude Extraction Contract

### Task extraction (text)
```json
{
  "intent": "task | save | voice_task | voice_save | file_save | create_list | reset_list | help",
  "is_task": true,
  "title": "API entegrasyonunu bitir",
  "assignee_name": "Ahmet",
  "due_date_text": "cuma",
  "project": "Backend",
  "use_previous_message_only": false,
  "needs_clarification": false,
  "clarification_question": null
}
```

### Weekly summary output
Plain text, WhatsApp-compatible (`*bold*`, `_italic_`), max ~600 words, auto-detects language.

---

## 10. Weekly Summary

- **Schedule:** Every Sunday at 20:00 (configurable via `SUMMARY_CRON`)
- **Timezone:** Europe/Istanbul (configurable via `TZ`)
- **Process:** fetches all messages for the week → sends to Claude → saves to `weekly_summaries` → sends to WhatsApp group
- **Sections:** What happened, Tasks created, Key topics, Carried over items

---

## 11. Dashboard (Next.js)

| Page | URL | Content |
|---|---|---|
| Stats | /dashboard | Groups, messages, tasks, sync rate |
| Messages | /dashboard/messages | Paginated log, group filter, @Maradona badge |
| Tasks | /dashboard/tasks | Status badges (synced/pending/failed), Basecamp links |
| Summaries | /dashboard/summaries | Weekly summaries per group |
| Groups | /dashboard/groups | Add/toggle groups, send privacy notice |

Dashboard REST API (`/api/*`) is protected by a `API_SECRET` bearer token.

---

## 12. Privacy Notice

On the **first message** received from a group, the bot automatically sends a privacy notice:

> ℹ️ *Maradona AI Asistanı*
> Bu grupta Maradona AI aktif edilmiştir.
> Grup mesajları görev yönetimi amacıyla işlenmektedir.
> @Maradona ile başlayan mesajlara yanıt verilecektir.

Configurable via `PRIVACY_NOTICE_TEXT` env var. Can be re-sent manually from the dashboard.

---

## 13. WhatsApp Connection

- Uses **whatsapp-web.js** with `LocalAuth` strategy
- On first start: prints QR code to terminal
- Scan with phone via **WhatsApp → Linked Devices**
- Session persisted to `.wwebjs_auth/` (Docker: named volume)
- No Meta Business account, no webhooks, no ngrok required

---

## 14. Environment Variables

```env
# PostgreSQL
POSTGRES_PASSWORD=
DATABASE_URL=postgres://maradona:password@localhost:5432/maradona

# Backend
PORT=3000
NODE_ENV=development

# AI
ANTHROPIC_API_KEY=
OPENAI_API_KEY=        # for Whisper voice transcription

# Basecamp
BASECAMP_CLIENT_ID=
BASECAMP_CLIENT_SECRET=
BASECAMP_ACCESS_TOKEN=
BASECAMP_ACCOUNT_ID=
BASECAMP_PROJECT_ID=
BASECAMP_TODOLIST_ID=

# Dashboard
API_SECRET=            # Bearer token for /api/* routes
FRONTEND_URL=http://localhost:3001
NEXT_PUBLIC_API_URL=http://localhost:3000

# WhatsApp
WWEBJS_AUTH_PATH=.wwebjs_auth
PUPPETEER_EXECUTABLE_PATH=   # empty = auto, /usr/bin/chromium in Docker

# Privacy notice (empty = use default Turkish notice)
PRIVACY_NOTICE_TEXT=

# Scheduler
SUMMARY_CRON=0 20 * * 0
TZ=Europe/Istanbul
```

---

## 15. Running the Project

### Development
```bash
# Backend
cd backend
cp ../.env.example .env   # fill in credentials
npm install
npm run dev               # QR code appears in terminal — scan with phone

# Frontend (separate terminal)
cd frontend
npm install
npm run dev               # http://localhost:3001
```

### Docker (full stack)
```bash
cp .env.example .env      # fill in credentials
docker compose up --build # QR appears in backend logs — scan with phone
```

---

## 16. Non-Functional Requirements

- **Latency:** < 5 seconds end-to-end for task creation
- **Security:** HTTPS in production, secrets via env vars, API bearer token
- **Privacy:** messages stored in your own PostgreSQL — no third-party persistence
- **Reliability:** error handling + retries for Claude, Basecamp, WhatsApp APIs
- **Observability:** structured Pino logs for every stage of the pipeline
- **Maintainability:** modular services, clean TypeScript types, Zod validation

---

## 17. Success Criteria

The system is working correctly if:
- WhatsApp connection established via QR
- Group messages are stored in PostgreSQL
- Non-@Maradona messages produce no reply
- @Maradona mention triggers Claude extraction and Basecamp task creation
- Privacy notice sent on first group interaction
- Weekly summary generated and sent every Sunday at 20:00
- Dashboard shows real data from the database
- Docker stack starts and runs stably

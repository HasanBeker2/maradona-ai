# Maradona
## Text-to-Code Specification
### WhatsApp → Basecamp AI Automation

## 1. Project Name

**Maradona**

### Name Rationale
This name combines:
- **Task** → the core business value of the system
- **Maradona** → the trigger identity and internal concept behind the project

The result is memorable, brandable, and directly connected to the system’s main purpose:
**turning WhatsApp conversations into structured Basecamp tasks.**

---

## 2. Project Summary

Maradona is an internal AI automation system that listens to WhatsApp messages, detects commands addressed to the bot through the keyword **“Maradona”**, extracts actionable task information using an LLM, enriches the task with recent chat context, and creates a structured to-do item in Basecamp.

The system is designed as a practical **AI integration laboratory** and a real business productivity tool.

---

## 3. Main Goal

Build a production-minded MVP that can:

1. Receive WhatsApp messages through webhook
2. Detect whether the bot was explicitly triggered
3. Extract task intent and metadata from Turkish/English informal chat
4. Retrieve recent context from the conversation
5. Map people names to Basecamp user IDs
6. Create a to-do in Basecamp
7. Send confirmation or clarification back to WhatsApp

---

## 4. Recommended Stack

- **Language:** TypeScript
- **Runtime:** Node.js
- **Framework:** Fastify
- **Database:** PostgreSQL
- **Cache:** Redis
- **LLM:** Claude API
- **Messaging Channel:** WhatsApp Cloud API
- **Project Management Tool:** Basecamp API
- **Deployment:** Railway / Render / Fly.io
- **Environment Management:** `.env`

---

## 5. Core Workflow

1. A WhatsApp message arrives through webhook
2. The backend validates the webhook payload
3. The system extracts text, sender, chat ID, and timestamp
4. The bot checks whether the message contains the trigger keyword **“Maradona”**
5. If not triggered, it ignores the message
6. If triggered, it fetches the last 5 messages from short-term memory
7. It sends the command + context to Claude
8. Claude returns structured JSON
9. The backend validates the JSON
10. The system maps the assignee name to the Basecamp user ID
11. The system parses due date into ISO format if possible
12. The system creates the task in Basecamp
13. The system optionally appends context as a note/comment
14. The system sends a confirmation message back to WhatsApp

---

## 6. Functional Requirements

### 6.1 Trigger Mechanism
The system must remain passive unless the incoming message includes the keyword:

`Maradona`

Trigger matching must:
- ignore case differences
- tolerate Turkish character variations where reasonable
- avoid accidental triggering from unrelated text when possible

### 6.2 Task Extraction
The AI layer must extract:
- task title
- assignee name
- due date text
- whether previous message context should be used
- whether clarification is required

### 6.3 Clarification Loop
If required information is missing or ambiguous, the bot must not fail silently.

It should reply in WhatsApp with a clarification question such as:
- “I could not find a Basecamp user named Huseyin. Did you mean Hasan?”
- “Do you want me to use only the message above or the last 5 messages as context?”

### 6.4 Context Window
The system should store the last **5 messages** per chat for **10 minutes**.

Rules:
- default context = last 5 messages
- if user says “use the message above,” only the immediately preceding message is used
- context should not be permanently stored

### 6.5 Basecamp Task Creation
The system must create a Basecamp to-do with:
- title
- assignee
- due date
- project/todolist destination
- optional context note/comment

### 6.6 Confirmation
After successful creation, the bot should send a response like:

`Task created for Hasan: [Basecamp Link]`

---

## 7. Non-Functional Requirements

- **Latency target:** less than 5 seconds for end-to-end flow
- **Security:** HTTPS only, secrets via environment variables
- **Privacy:** no chat history persisted beyond the short context window
- **Reliability:** proper retry/error handling for API failures
- **Observability:** structured logs for webhook, parsing, LLM output, Basecamp response
- **Maintainability:** modular codebase with clear service separation

---

## 8. Data Model

### `user_mappings`
| field | type | description |
|---|---|---|
| id | uuid | internal record id |
| nickname | text | informal display name |
| whatsapp_phone | text | phone number |
| basecamp_user_id | text | Basecamp user id |
| active | boolean | whether mapping is active |

### `project_mappings`
| field | type | description |
|---|---|---|
| id | uuid | internal record id |
| project_name | text | logical project name |
| bucket_id | text | Basecamp bucket id |
| todolist_id | text | Basecamp todolist id |
| active | boolean | whether mapping is active |

### `conversation_cache`
| field | type | description |
|---|---|---|
| chat_id | text | WhatsApp chat id |
| sender | text | sender phone or name |
| message_text | text | message body |
| timestamp | datetime | message time |
| expires_at | datetime | TTL limit |

---

## 9. Suggested Project Structure

```txt
/src
  /routes
    webhook.ts
  /services
    whatsapp.ts
    claude.ts
    basecamp.ts
    context.ts
    mapping.ts
    parser.ts
  /prompts
    taskExtraction.ts
  /types
    task.ts
  /utils
    date.ts
    logger.ts
    normalize.ts
  server.ts
```

---

## 10. Claude Extraction Contract

Claude should return **strict JSON only** in this format:

```json
{
  "is_task": true,
  "title": "Prepare Amazon A+ content revision",
  "assignee_name": "Hasan",
  "due_date_text": "Friday",
  "use_previous_message_only": false,
  "needs_clarification": false,
  "clarification_question": null
}
```

---

## 11. Master Text-to-Code Prompt

Use the following prompt with Claude Code or another coding LLM:

```text
Build a production-minded MVP called "Maradona".

Purpose:
This system receives WhatsApp messages from the WhatsApp Cloud API, detects whether the user explicitly triggered the bot with the keyword "Maradona", extracts Basecamp task information using Claude, enriches the task with recent conversation context, creates the task in Basecamp, and replies back on WhatsApp.

Technical stack:
- TypeScript
- Node.js
- Fastify
- PostgreSQL
- Redis
- Claude API
- WhatsApp Cloud API
- Basecamp API

Requirements:
1. Create a Fastify server with:
   - GET /webhook for Meta verification
   - POST /webhook for WhatsApp incoming messages
2. Ignore WhatsApp status events and process only text messages
3. Extract sender phone number, chat ID, message text, and timestamp
4. Implement a trigger function:
   - only continue when message contains "Maradona"
   - normalize casing and Turkish character differences
5. Implement short-term conversation memory:
   - store last 5 messages per chat
   - keep messages for 10 minutes only
   - if Redis is unavailable, fall back to in-memory store
6. Add Claude integration:
   - analyze incoming message in Turkish or English
   - use recent context window
   - return strict JSON only
   - determine task intent, title, assignee, due date, whether clarification is needed
7. Add assignee mapping:
   - map informal names to Basecamp user IDs
   - support nickname matching
8. Add Basecamp integration:
   - create a todo in a configured bucket/todolist
   - assign the task if assignee exists
   - parse due date into ISO format if possible
   - append conversation context as note/comment
9. Add clarification loop:
   - if assignee is unknown or required fields are ambiguous, send a WhatsApp clarification message
10. Add confirmation response:
   - after task creation, send a WhatsApp message with the assignee name and Basecamp task link
11. Add production concerns:
   - environment variables for all secrets
   - structured logging
   - input validation with Zod
   - modular architecture
   - error handling and retries
   - clean TypeScript types
   - unit-testable service functions

Output expectations:
- Provide complete project files
- Include package.json
- Include tsconfig.json
- Include .env.example
- Include README.md
- Include SQL schema or migration files
- Include clear setup instructions
- Write clean, maintainable, production-oriented code
```

---

## 12. Development Roadmap

### Phase 1 — Foundation
- webhook verification
- incoming message parsing
- trigger detection

### Phase 2 — Intelligence
- short-term context memory
- Claude extraction
- strict JSON validation

### Phase 3 — Execution
- Basecamp API integration
- assignee mapping
- due date parsing

### Phase 4 — Reliability
- clarification loop
- logging
- retries
- better error handling

### Phase 5 — Production Readiness
- database migrations
- deployment
- monitoring
- security hardening

---

## 13. MVP Scope

### In Scope
- text messages only
- one task per command
- last 5 message context
- one Basecamp destination list
- Turkish and English command handling

### Out of Scope for MVP
- voice note transcription
- image understanding
- multi-task extraction from one long message
- multi-project intelligent routing
- advanced admin dashboard

---

## 14. Example User Commands

- `Maradona, Basecamp'te görev aç: A+ content düzenlemesini bitir`
- `Maradona bunu Hasan'a task olarak aç`
- `Maradona üstteki mesajı not olarak ekleyip cuma gününe deadline koy`
- `Maradona open a task in Basecamp for Alex and set due date to April 29`
- `Maradona use the message above as context`

---

## 15. Success Criteria

The MVP is successful if:
- WhatsApp message is received reliably
- trigger logic works correctly
- Claude extracts valid task JSON
- Basecamp task is created successfully
- clarification loop handles ambiguity
- confirmation message is returned to WhatsApp
- the whole flow completes in under 5 seconds in normal cases

---

## 16. Final Positioning

**Maradona** is not just an automation bot.
It is an internal AI operations layer that transforms informal communication into structured execution.

It reduces manual admin work, preserves task context, improves team discipline, and serves as a practical internal AI R&D platform.

# PowerNode Roadmap

## ✅ Current — สิ่งที่มีแล้ว

- Authentication (Email / GitHub / Google OAuth) — Better Auth + optional `@better-auth/infra` (dash) เมื่อติดตั้ง dependency ครบ
- Visual Workflow Editor (React Flow)
- **~47 node types** ใน catalog เดียว (Triggers, Logic, Data, Integrations, AI, Utilities)
- Credential Storage (Encrypted API Keys)
- Workflow Execution Engine (Inngest)
- Execution History & Tracking
- Billing & Subscription (Polar)
- **AI Workflow Generator** — composer แบบแถบลอยด้านล่าง (pill); เลือกโมเดล GPT-4o / GPT-4o mini; ตัวอย่าง prompt จากปุ่ม **+**; กรอบแดงขณะกำลัง generate (`src/features/ai-workflow/ai-workflow-dialog.tsx`)

### 📝 Recent updates (Mar 2026)

- **AI Workflow Generator (UI)** — จาก modal กลางจอเป็น **floating composer** ด้านล่าง (rounded pill, shadow); placeholder แบบ “What would you like to change or create?”; **Enter** สร้าง workflow / **Shift+Enter** ขึ้นบรรทัดใหม่; ปุ่ม **+** เปิด Popover “Try an example”; เลือก **GPT-4o** หรือ **GPT-4o mini** ผ่าน `generateWorkflowFromPrompt(..., { modelId })`; ตอนกำลังคิดแสดง **กรอบแดง + ring** และ `aria-busy`
- **Editor UX** — รวมรายการ node ทั้งหมดใน Sheet ขวา *“What triggers this workflow?”* พร้อมค้นหาและหมวดหมู่; แหล่งข้อมูลเดียวที่ `src/features/editor/lib/node-catalog.tsx`; เพิ่ม node จากปุ่ม **+** บน canvas หรือจาก **Initial node**
- **React Flow** — ห่อ `ReactFlowProvider` ให้ `useReactFlow()` / `useNodeDrop()` ทำงานถูก context (แก้ error zustand provider)
- **Inngest Realtime** — subscription token แบบ opt-in ด้วย `NEXT_PUBLIC_INNGEST_REALTIME_ENABLED=true` (ค่าเริ่มต้นปิดเพื่อไม่ให้ dev โดน 401 เมื่อยังไม่ตั้ง signing key); ดู `.env.example`
- **Build / deps** — ต้อง `npm install` ให้ครบเมื่อมี dependency ใหม่ (เช่น `@better-auth/infra`)

---

## ✅ Phase 1 — Core UX

> ทำให้ editor ใช้งานได้จริงและ smooth

- [x] **Unified Add Node Sheet** — เลือก node จาก Sheet (หัวข้อ “What triggers this workflow?”) พร้อม search + หมวดหมู่; แทน sidebar “Nodes” เดิมเพื่อลดความซ้ำ
- [x] **Node Configuration Panel** — คลิก node แล้วเปิด panel ด้านขวาเพื่อ config ค่าต่างๆ
- [x] **Expression Editor** — อ้างอิง output จาก node ก่อนหน้าแบบ `{{node.output}}` พร้อม autocomplete
- [x] **Node Output Preview** — แสดง input/output ของแต่ละ node บน canvas หลัง execute
- [x] **Real-time Execution Log** — ดู log แบบ live ขณะ workflow กำลัง run
- [x] **Undo / Redo** — ย้อน / ทำซ้ำ action ใน editor
- [x] **Copy / Paste Nodes** — copy node แล้ว paste ได้เลย
- [x] **Multi-select Nodes** — เลือกหลาย node พร้อมกัน
- [x] **Sticky Notes** — เพิ่ม note/comment บน canvas เพื่อ documentation
- [x] **Keyboard Shortcuts** — shortcut สำหรับ canvas operations
- [ ] **Data Pinning / Mocking** — test node โดยใช้ fixed data โดยไม่ต้องรัน live
- [ ] **Debug Mode** — re-run workflow จาก node ที่ต้องการได้เลย

---

## ✅ Phase 2 — More Node Types (Logic & Data)

> เพิ่ม node ที่ทำให้ workflow ทำได้หลากหลายขึ้น

**Triggers**
- [x] **SCHEDULE_TRIGGER** — run workflow อัตโนมัติตาม cron schedule
- [x] **WEBHOOK_TRIGGER** — รับ HTTP webhook จาก external service ใดก็ได้
- [x] **GOOGLE_FORM_TRIGGER** — built-in form builder สร้าง form แล้วรับ submission ได้เลย
- [x] **STRIPE_TRIGGER** — trigger เมื่อ Stripe event เกิดขึ้น
- [ ] **EMAIL_TRIGGER** — trigger เมื่อรับ email ใหม่ (IMAP)
- [ ] **ERROR_TRIGGER** — trigger เมื่อ workflow อื่น fail

**Logic & Flow Control**
- [x] **IF / SWITCH** — แตก flow ตาม condition
- [x] **FILTER** — กรอง items ตาม condition
- [x] **LOOP** — วน loop over items
- [x] **MERGE** — รวม output จากหลาย node
- [x] **SPLIT** — แตก array เป็น individual items
- [x] **WAIT / DELAY** — หน่วงเวลาระหว่าง node
- [x] **STOP & ERROR** — หยุด workflow พร้อม custom error message
- [x] **SUB_WORKFLOW** — เรียก workflow อื่นข้างใน workflow ได้

**Data Transformation**
- [x] **CODE (JS)** — รัน custom JavaScript ภายใน node
- [x] **TRANSFORM** — แปลง/ปรับ data structure
- [x] **AGGREGATE** — รวม data หลาย items เป็นก้อนเดียว
- [x] **SORT** — เรียงลำดับ items
- [x] **REMOVE_DUPLICATES** — ลบ duplicate items ออก
- [x] **DATE_TIME** — จัดการ date/time format
- [x] **CRYPTO** — hash, encrypt, decrypt data
- [x] **MARKDOWN / HTML** — แปลง markdown ↔ HTML
- [x] **COMPRESS** — zip/unzip files

---

## ✅ Phase 3 — Integrations

> เพิ่ม third-party integrations ให้ครอบคลุม

**Productivity**
- [x] **NOTION** — อ่าน / เขียน Notion database
- [x] **GOOGLE_SHEETS** — อ่าน / เขียน Google Sheets
- [x] **GOOGLE_CALENDAR** — จัดการ Google Calendar events
- [x] **GOOGLE_DRIVE** — อ่าน / เขียน / upload ไฟล์ใน Google Drive
- [x] **GMAIL** — ส่ง / รับ email ผ่าน Gmail

**Communication**
- [x] **EMAIL (SMTP)** — ส่ง email ผ่าน SMTP
- [x] **TELEGRAM** — ส่ง message ผ่าน Telegram Bot
- [x] **DISCORD** — ส่ง message ผ่าน Discord Webhook
- [x] **SLACK** — ส่ง message ผ่าน Slack Webhook

**Developer Tools**
- [x] **GRAPHQL** — query GraphQL API
- [x] **GITHUB** — manage repos, issues, PRs
- [x] **HTTP_REQUEST** — generic HTTP/REST requests

**Database**
- [x] **MYSQL** — query MySQL database
- [x] **POSTGRESQL** — query PostgreSQL database

---

## ✅ Phase 4 — AI & LLM

> เพิ่ม AI capabilities ให้ครอบคลุม

**AI Models**
- [x] **OPENAI** — GPT-4o, GPT-4o-mini via OpenAI API
- [x] **ANTHROPIC** — Claude models via Anthropic API
- [x] **GEMINI** — Gemini models via Google AI API
- [x] **OLLAMA** — รัน LLM local (Llama, Mistral, ฯลฯ) ด้วย Ollama

**AI Agents**
- [x] **AI_AGENT** — context-aware AI agent พร้อม workflow context
- [x] **CHAT_TRIGGER** — built-in chatbot interface สำหรับ workflow

**AI Utilities**
- [x] **TEXT_CLASSIFIER** — จัดหมวดหมู่ text อัตโนมัติ
- [x] **SENTIMENT_ANALYSIS** — วิเคราะห์ sentiment จาก text
- [x] **INFORMATION_EXTRACTOR** — ดึงข้อมูล structured จาก text
- [x] **AI_TRANSFORM** — transform data ด้วย natural language prompt
- [x] **SUMMARIZATION** — สรุป text อัตโนมัติ (brief, detailed, bullet, executive)

---

## ✅ Phase 5 — AI Workflow Generator

> พิมพ์ prompt แล้วให้ AI สร้าง workflow ให้อัตโนมัติ

- [x] **Prompt → Workflow** — วิเคราะห์ prompt แล้ว generate nodes + connections ให้เลย
- [x] **Example Prompts** — ตัวอย่างใน Popover จากปุ่ม **+** บน composer
- [x] **Floating composer UI** — แถบด้านล่างกลางจอ (Dialog + pill) แทนกล่อง modal เดิม
- [x] **Model picker (generation)** — เลือก `gpt-4o` / `gpt-4o-mini` ตอนเรียก `generateWorkflowFromPrompt`
- [x] **Generating feedback** — กรอบแดง + ring + `aria-busy` ขณะรอ API
- [ ] **AI Suggestions** — แนะนำ node ถัดไปที่ควรเพิ่มจาก context ของ workflow
- [ ] **Workflow Chat** — คุยกับ AI เพื่อแก้ไข / ปรับ workflow ผ่าน natural language
- [ ] **Auto-fix Errors** — AI วิเคราะห์ execution error แล้วเสนอวิธีแก้อัตโนมัติ

---

## ✅ Phase 6 — DevX & Infrastructure

> ทำให้ developer experience ดีขึ้น และ platform แข็งแกร่งขึ้น

- [x] **Export / Import Workflows** — export เป็น JSON แล้ว import ใน instance อื่น (พร้อม validation)
- [x] **API Key Management** — สร้าง / ลบ API key สำหรับ REST API
- [x] **Public REST API** — `POST /api/v1/workflows/:id/execute` ผ่าน Bearer token
- [x] **Webhook URL Generator** — generate + copy webhook URL ของแต่ละ workflow
- [x] **Webhook Trigger Endpoint** — `POST /api/webhooks/trigger/:secret`
- [x] **Workflow Settings** — แก้ไข description, tags, isActive
- [x] **Workflow Tagging** — tag workflow เพื่อจัดหมวดหมู่
- [ ] **Error Retry UI** — retry execution ที่ failed ได้จากหน้า execution detail
- [ ] **Variable System** — global variables ที่ใช้ได้ข้าม workflow
- [ ] **Log Streaming** — ส่ง execution logs ไปยัง external monitoring
- [ ] **Insights Dashboard** — analytics เช่น success rate, time saved, execution trends

---

## ✅ Phase 7 — Advanced Features

> Advanced capabilities สำหรับ power users

- [x] **Workflow Templates** — 5 built-in templates (Webhook→Slack, AI Content, GitHub Tracker, ETL Pipeline, Sentiment Monitor)
- [x] **Workflow Duplication** — duplicate workflow พร้อม nodes และ connections ทั้งหมด
- [x] **Workflow Import** — import จาก JSON export พร้อม ID remapping
- [x] **Execution Summary** — duration, success rate, status tracking
- [ ] **Projects** — จัดกลุ่ม workflows ตาม team / project
- [ ] **RBAC** — roles ระดับ instance และ project
- [ ] **Workflow Versioning** — เก็บ history ย้อนกลับ version เก่าได้
- [ ] **Audit Log** — บันทึกทุก action ว่าใครทำอะไร เมื่อไหร่

---

## ✅ Phase 8 — Validation & Utilities

> Core utilities สำหรับ platform reliability

- [x] **Workflow Validator** — ตรวจสอบ cycle, orphan nodes, missing triggers, duplicate connections
- [x] **Node Data Validator** — required field validation ต่อ node type
- [x] **Template Resolver** — Handlebars `{{variable.path}}` interpolation
- [x] **Cron Utilities** — validate, describe, get next runs, 11 presets
- [x] **Data Utilities** — getNestedValue, setNestedValue, flattenObject, deepMerge
- [x] **Expression Parser** — parse templates, autocomplete, validation
- [x] **Rate Limiter** — sliding window rate limiter พร้อม HTTP headers
- [x] **Node Metadata Registry** — metadata ครบทุก 47 node types (label, color, I/O, category)

---

## ✅ Phase 9–24 — Platform Utilities & Infrastructure

> Comprehensive utilities library สำหรับ production platform

**Execution Engine**
- [x] **Retry Policy** — exponential backoff with jitter, error classification (retryable vs non-retryable)
- [x] **Execution Context** — variable scoping, serialization, validation
- [x] **Event Log** — structured events with levels, filtering, formatting
- [x] **Execution Queue** — priority queue (critical→low), deduplication, overdue detection, retry scheduling

**HTTP & API**
- [x] **HTTP Utilities** — URL parsing/building, method normalization, auth headers, error extraction
- [x] **JSON Utilities** — safe parse/stringify, deepClone, deepEqual, flattenJson, selectPaths

**Data Processing**
- [x] **Array Utilities** — groupBy, removeDuplicates, sortBy, aggregate, chunk, flatten, filterBy, zip
- [x] **String Utilities** — case converters, truncate, slugify, interpolate, escapeHtml, randomString
- [x] **Date/Time Utilities** — addToDate, diffDates, formatDate, startOf/endOf, relativeTime
- [x] **Crypto Utilities** — hash/HMAC (MD5/SHA1/SHA256/SHA512), base64/hex encode/decode, UUID, HMAC verify

**Credentials**
- [x] **Credential Schema** — field definitions, required field validation ครบทุก 11 CredentialType

**Analytics**
- [x] **Workflow Metrics** — success rate, avg/min/max/p50/p95 duration, time series, top failing workflows
- [x] **Execution Summary** — duration formatting, status icons/colors, aggregate stats

**Configuration**
- [x] **Node Defaults** — default data สำหรับทุก node type พร้อม override support
- [x] **Workflow Templates** — 5 production-ready templates

**UI & UX**
- [x] **Pagination Utilities** — calculatePagination, getPageInfo, getPageNumbers with ellipsis
- [x] **Fuzzy Search** — scored matching (prefix > substring > character), threshold filtering

---

## Phase 7 (Roadmap เดิม) — Collaboration & Governance

> ทำงานร่วมกันได้ และควบคุม workflow ใน team ได้

- [ ] **Projects** — จัดกลุ่ม workflows ตาม team / project
- [ ] **RBAC** — roles ระดับ instance และ project (Owner, Admin, Editor, Viewer)
- [ ] **Credential Sharing** — แชร์ credential ระหว่าง users ใน team
- [ ] **Workflow Versioning** — เก็บ history ของแต่ละ workflow ย้อนกลับไป version เก่าได้
- [ ] **Audit Log** — บันทึกทุก action ว่าใครทำอะไร เมื่อไหร่
- [ ] **Multi-step Approval** — workflow หยุดรอ human approval ก่อน proceed ต่อได้
- [ ] **Rate Limiting & Quota** — จำกัด execution per plan พร้อม usage meter
- [ ] **Source Control / Git** — push/pull workflows ผ่าน Git
- [ ] **Multi-environment** — แยก dev / staging / prod environment

---

## Phase 8 (Roadmap เดิม) — Enterprise & Security

> Security และ compliance สำหรับ enterprise

- [ ] **SSO (SAML)** — Single Sign-On ผ่าน Okta, Azure AD ฯลฯ
- [ ] **OIDC / LDAP** — enterprise identity provider integration
- [ ] **2FA** — Two-Factor Authentication
- [ ] **External Secrets** — ดึง credentials จาก Vault, AWS SM, GCP SM, Azure KV
- [ ] **Security Audit Tool** — scan หา misconfiguration ใน workflows
- [ ] **IP Allowlisting** — จำกัด access จาก IP ที่กำหนด
- [ ] **Self-hosted Deployment** — deploy บน Docker / Kubernetes ของตัวเอง

---

## Phase 9 (Roadmap เดิม) — MCP (Model Context Protocol)

> เชื่อมต่อ AI agents กับ tools/data sources ได้ไม่จำกัดผ่าน MCP standard

### PowerNode as MCP Client
> PowerNode เชื่อมกับ MCP servers ภายนอก

- [ ] **MCP Server Node** — เพิ่ม MCP server เป็น node ใน workflow ได้เลย
- [ ] **MCP Client** — PowerNode เชื่อมต่อกับ MCP servers ภายนอกได้
- [ ] **MCP Server Builder** — สร้าง custom MCP server ของตัวเองภายใน PowerNode
- [ ] **MCP Marketplace** — browse และ install MCP servers จาก community registry
- [ ] **Built-in MCP Servers** — MCP servers สำเร็จรูปสำหรับ integrations หลักๆ
- [ ] **AI Agent + MCP** — AI Agent node สามารถใช้ MCP tools ได้โดยตรง
- [ ] **MCP Inspector** — debug และ monitor MCP tool calls ใน workflow

### PowerNode as MCP Server
> ให้ภายนอก (Claude, Cursor, Windsurf ฯลฯ) เข้าถึง PowerNode ผ่าน MCP

- [ ] **MCP Server Endpoint** — PowerNode expose MCP server ให้ AI clients เชื่อมต่อได้
- [ ] **Tool: list_workflows** — AI สามารถดูรายการ workflows ทั้งหมดได้
- [ ] **Tool: create_workflow** — AI สร้าง workflow ใหม่ได้จากภายนอก
- [ ] **Tool: execute_workflow** — AI สั่งรัน workflow ได้เลย
- [ ] **Tool: get_execution_status** — AI ดูสถานะ execution ได้ real-time
- [ ] **Tool: get_execution_result** — AI ดึง output จาก execution ได้
- [ ] **Tool: update_workflow** — AI แก้ไข nodes/connections ใน workflow ได้
- [ ] **Tool: manage_credentials** — AI จัดการ credentials ได้อย่างปลอดภัย
- [ ] **MCP Auth** — ระบบ authentication สำหรับ MCP clients (API key / OAuth)
- [ ] **Per-user MCP Token** — แต่ละ user มี MCP endpoint ของตัวเอง

---

## Phase 10 (Roadmap เดิม) — Ecosystem & Scale

> ขยาย platform ให้เป็น ecosystem เต็มรูปแบบ

- [ ] **Workflow Templates Marketplace** — community publish / share templates ได้
- [ ] **White-labeling** — เปลี่ยน branding สำหรับ reseller / embed ในแอปอื่น
- [ ] **Embed Mode** — embed PowerNode editor ใน application อื่นได้
- [ ] **Mobile App** — ดู execution status และ approve/reject workflow จาก mobile
- [ ] **Custom Node SDK** — developer สร้าง custom node type เองได้

---

## Phase 11 (Roadmap เดิม) — Advanced UX & Operations

> ทำให้การใช้งานและการจัดการ workflow ดีขึ้นในระดับ production

- [ ] **Workflow Scheduling UI** — calendar view ดูว่า workflow ไหนจะรันเมื่อไหร่
- [ ] **Notification Center** — แจ้งเตือน in-app เมื่อ workflow fail / success / ต้องการ approval
- [ ] **Cost Tracking per Workflow** — แสดงว่าแต่ละ workflow ใช้ token/credits เท่าไหร่
- [ ] **Workflow Testing Suite** — เขียน test case สำหรับ workflow รัน regression test อัตโนมัติ
- [ ] **Multi-language Node (Go, Ruby, PHP)** — Code node รองรับภาษาเพิ่มจาก JS
- [ ] **On-premise Data Residency** — เลือก region ที่จะ store ข้อมูล สำหรับ compliance
- [ ] **Workflow Documentation Generator** — AI auto-generate documentation จาก workflow
- [ ] **Dependency Graph** — visualize ว่า workflow ไหน call workflow ไหนบ้าง

---

## 📊 Progress Summary

| Phase | Status | Highlights |
|-------|--------|-----------|
| Phase 1 — Core UX | ✅ Done | Add-node sheet + catalog, undo/redo, copy/paste, shortcuts |
| Phase 2 — Logic & Data | ✅ Done | ~47 node types in catalog, IF/Loop/Code/Transform |
| Phase 3 — Integrations | ✅ Done | Telegram, Gmail, GitHub, PostgreSQL, MySQL, GraphQL |
| Phase 4 — AI & LLM | ✅ Done | OpenAI, Anthropic, Gemini, Ollama, Sentiment, Classifier |
| Phase 5 — AI Generator | ✅ Done | Floating composer, model picker, prompt → workflow |
| Phase 6 — DevX | ✅ Done | Export/Import, API keys, REST API, Webhooks |
| Phase 7 — Advanced | ✅ Done | Templates, Duplication, Execution Summary |
| Phase 8 — Validation | ✅ Done | Workflow validator, node validator, template resolver |
| Phase 9–24 — Utilities | ✅ Done | 661 tests, complete utility library |
| Collaboration & RBAC | ⏳ Next | Projects, roles, versioning, audit log |
| Enterprise & Security | ⏳ Planned | SSO, 2FA, self-hosted |
| MCP Integration | ⏳ Planned | PowerNode as MCP client + server |
| Ecosystem & Scale | ⏳ Planned | Marketplace, mobile app, Custom Node SDK |

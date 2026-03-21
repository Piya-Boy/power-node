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

## ✅ Phase 25 — Collaboration & Governance

> ทำงานร่วมกันได้ และควบคุม workflow ใน team ได้

- [x] **Projects** — จัดกลุ่ม workflows ตาม team / project (utilities + membership)
- [x] **RBAC (Project-level)** — roles: Owner, Admin, Editor, Viewer พร้อม permission matrix
- [x] **RBAC (Instance-level)** — super_admin, admin, member, viewer ครบ 7 resource types
- [x] **Workflow Versioning** — snapshot, diff, next version, trim history
- [x] **Audit Log** — entry creation, filtering, stats, brute-force detection
- [ ] **Credential Sharing** — แชร์ credential ระหว่าง users ใน team
- [ ] **Multi-step Approval** — workflow หยุดรอ human approval ก่อน proceed ต่อได้
- [ ] **Rate Limiting & Quota** — จำกัด execution per plan พร้อม usage meter
- [ ] **Source Control / Git** — push/pull workflows ผ่าน Git
- [ ] **Multi-environment** — แยก dev / staging / prod environment

---

## ✅ Phase 26 — Enterprise & Security

> Security และ compliance สำหรับ enterprise

- [x] **2FA (TOTP)** — secret generation, token verify, backup codes, OTP URI
- [x] **IP Allowlisting** — IPv4 + CIDR matching, private IP detection
- [x] **Security Audit Tool** — 7 security checks, security score (0-100)
- [ ] **SSO (SAML)** — Single Sign-On ผ่าน Okta, Azure AD ฯลฯ
- [ ] **OIDC / LDAP** — enterprise identity provider integration
- [ ] **External Secrets** — ดึง credentials จาก Vault, AWS SM, GCP SM, Azure KV
- [ ] **Self-hosted Deployment** — deploy บน Docker / Kubernetes ของตัวเอง

---

## ✅ Phase 27 — MCP (Model Context Protocol)

> เชื่อมต่อ AI agents กับ tools/data sources ได้ไม่จำกัดผ่าน MCP standard

### PowerNode as MCP Server (Utilities Done)
- [x] **MCP Type Definitions** — tool schema, content types, resource definitions
- [x] **8 MCP Tools** — list/get/create/update workflows, execute, status, result, list executions
- [x] **Tool Validation** — schema-based required field validation
- [x] **MCP Response Helpers** — mcpSuccess, mcpError, mcpText, mcpList
- [x] **MCP Auth** — scope-based access (5 scopes), bearer token parsing, token expiry

### Remaining MCP Work
- [ ] **MCP Server Node** — เพิ่ม MCP server เป็น node ใน workflow ได้เลย
- [ ] **MCP Client** — PowerNode เชื่อมต่อกับ MCP servers ภายนอกได้
- [ ] **MCP Server Endpoint** — PowerNode expose MCP HTTP endpoint จริง
- [ ] **Per-user MCP Token** — แต่ละ user มี MCP endpoint ของตัวเอง

---

## ✅ Phase 28 — Ecosystem & Scale

> ขยาย platform ให้เป็น ecosystem เต็มรูปแบบ

- [x] **Templates Marketplace** — search/filter/sort, trending, featured, related, tags, category stats
- [x] **Notification Center** — create/read/filter/sort/group, unread count, expiry, common builders
- [x] **Custom Node SDK** — node definition schema + validation + search + groupByCategory
- [ ] **White-labeling** — เปลี่ยน branding สำหรับ reseller / embed ในแอปอื่น
- [ ] **Embed Mode** — embed PowerNode editor ใน application อื่นได้
- [ ] **Mobile App** — ดู execution status และ approve/reject workflow จาก mobile

---

## ✅ Phase 29 — Advanced UX & Operations

> ทำให้การใช้งานและการจัดการ workflow ดีขึ้นในระดับ production

- [x] **Workflow Scheduling UI** — cron parser, calendar day/week view, busiest day, total runs
- [x] **Cost Tracking per Workflow** — 8 model pricing tables, token cost, execution cost, workflow summary
- [x] **Dependency Graph** — callers/callees, transitive deps, cycle detection, topological sort, safe-to-delete
- [x] **Workflow Testing Suite** — 11 assertion operators, test runner, suite aggregation, tag filtering
- [x] **Dependency Graph** — callers/callees, cycle detection, topological sort, safe-to-delete
- [ ] **Multi-language Node (Go, Ruby, PHP)** — Code node รองรับภาษาเพิ่มจาก JS
- [ ] **On-premise Data Residency** — เลือก region ที่จะ store ข้อมูล สำหรับ compliance
- [ ] **Workflow Documentation Generator** — AI auto-generate documentation จาก workflow

---

## ✅ Phase 33 — Workflow Documentation Generator

- [x] **describeNodeType** — human-readable descriptions for 40+ node types
- [x] **Trigger Detection** — identifies all trigger node types
- [x] **Execution Path Tracing** — DFS-based flow tracing with branching support
- [x] **Node Categorization** — groups into Triggers/AI/Integrations/Logic/Data
- [x] **Markdown Doc Generation** — full doc with overview, node inventory, execution flow
- [x] **One-liner Summary** — single-line workflow description

---

## ✅ Phase 34 — Multi-Environment Support

- [x] **Tier Validation** — dev → staging → production promotion ordering
- [x] **Environment Diff** — detect added/removed/changed/same variables
- [x] **Promotion Plan Builder** — change list, warnings, canPromote flag
- [x] **Variable Validation** — required keys, empty string detection
- [x] **Environment Name Sanitization** — lowercase slug format

---

## ✅ Phase 35 — Human Approval Workflow

- [x] **Approval Request** — creation, status tracking, expiry
- [x] **Decision Application** — eligibility check, duplicate prevention, status resolution
- [x] **Multi-approver** — configurable requiredApprovals, approval counting
- [x] **Pending Queries** — get pending requests for a specific approver
- [x] **Notification Formatting** — human-readable approval notification

---

## ✅ Phase 31-32 — Testing & Variable System

> ทำให้ workflow มีความน่าเชื่อถือและ configurability สูง

- [x] **Workflow Testing Suite** — 11 assertion operators (equals/contains/greater_than/regex/has_key/array_length/etc), test case runner, suite aggregation, tag filtering
- [x] **Variable System** — scoped variables (global/project/workflow), env filtering (dev/staging/prod), type parsing (string/number/boolean/json/secret), template interpolation `{{VAR_NAME}}`, validation
- [x] **Dependency Graph** — callers, callees, transitive deps, cycle detection (DFS), topological sort (Kahn's), max depth, safe-to-delete

---

## ✅ Phase 36 — SSO / SAML / OIDC

- [x] **SAML Config Validation** — entityId, ACS URL, IdP URL, PEM certificate
- [x] **SAML AuthnRequest Builder** — HTTP-POST and HTTP-Redirect bindings
- [x] **SAML Response Parser** — base64 decode, NameID, attributes, expiry validation
- [x] **SAML Attribute Mapping** — map SAML attributes to SsoUserProfile
- [x] **OIDC Auth Request Builder** — authorization URL, scopes, PKCE, nonce
- [x] **OIDC ID Token Parser** — JWT decode, sub/iss/exp validation
- [x] **OIDC Claims Mapping** — map OIDC claims to SsoUserProfile
- [x] **Connection Routing** — find SSO connection by email domain
- [x] **PKCE** — code verifier generation, S256 challenge, validation
- [x] **State / Nonce** — base64url encode/decode of connection context

---

## ✅ Phase 37 — External Secrets Manager

- [x] **Secret URI Parser** — vault://, aws-sm://, gcp-sm://, azure-kv://, env://
- [x] **Path Builders** — Vault KV v2, AWS SM ARN, GCP SM resource name, Azure KV URL
- [x] **Config Validators** — all 4 providers with URL/region/project validation
- [x] **SecretMetadata** — creation, rotation policy scheduling, status tracking
- [x] **Rotation Status** — overdue detection, due-soon window, days remaining
- [x] **Template Interpolation** — {{secret:uri}} placeholder extraction and substitution
- [x] **Missing Secret Detection** — identify unresolved secrets in templates

---

## ✅ Phase 38 — Rate Limiting & Quota Management

- [x] **4-Tier Plan Quotas** — free/starter/pro/enterprise for 9 resource types
- [x] **Quota Checking** — hard limit, soft limit (configurable %), remaining, percent used
- [x] **canConsume()** — pre-flight check before incrementing usage
- [x] **buildUsageSummary()** — violations, nearing limits, health score 0-100
- [x] **Plan Comparison** — comparePlans, meetsMinimumPlan, getNextPlan
- [x] **Upgrade Impact** — show limit improvements between plan tiers
- [x] **Reset Scheduling** — hourly, daily, monthly, billing_period boundaries

---

## ✅ Phase 39 — Webhook Event Bus & Retry Engine

- [x] **Event Creation** — source, type, payload, idempotency key, method
- [x] **Route Matching** — glob patterns (payment.*, push, *), source filtering
- [x] **Filter Evaluation** — equals, not_equals, contains, starts_with, exists, in
- [x] **Deduplication** — idempotency key lookup, fallback key generation
- [x] **4 Retry Strategies** — fixed, exponential, linear, fibonacci
- [x] **Dead Letter Queue** — after maxRetries exceeded, retryHistory tracking
- [x] **Header Normalization** — signature extraction for GitHub/Stripe/Slack
- [x] **Event Statistics** — delivery rate, avg retries, groupBySource/Type

---

## ✅ Phase 40 — Multi-language Code Node Runtime

- [x] **6 Languages** — JavaScript, Python, Go, Ruby, PHP, Shell
- [x] **Language Detection** — heuristic code pattern analysis
- [x] **Security Validation** — per-language checks (eval, exec, subprocess, rm -rf)
- [x] **Boilerplate Wrapping** — user code in language-appropriate template
- [x] **Docker Runtime Spec** — --network=none, --memory, --cpus, stop-timeout
- [x] **Package Validation** — blocks path traversal and suspicious names
- [x] **Install Commands** — npm/pip/gem/composer/go mod builders

---

## ✅ Phase 41 — White-labeling & Embed Mode

- [x] **Brand Config** — hex colors, typography, logo (light/dark), color scheme
- [x] **Config Validation** — hex format, URL validity, domain allowlist, no scripts
- [x] **CSS Theme Generation** — CSS custom properties from brand config
- [x] **Dark Mode Overrides** — [data-theme=dark] CSS block
- [x] **Embed URL Builder** — tenant isolation, readOnly, hideToolbar flags
- [x] **iframe Snippet** — ready-to-paste HTML with custom dimensions
- [x] **Origin Allowlist** — wildcard subdomain matching (*.acme.com)

---

## ✅ Phase 42 — Live Collaboration & Presence

- [x] **Session Management** — join/leave with color assignment, rejoin support
- [x] **User Presence** — cursor position, selected nodes, status tracking
- [x] **Idle Detection** — auto-idle after configurable threshold
- [x] **Node Locking** — TTL-based locks, acquire/release, expired lock cleanup
- [x] **Edit History** — bounded operation log (trim to maxHistorySize)
- [x] **Conflict Detection** — concurrent config changes, delete-while-editing
- [x] **Session Summary** — active users, idle count, active locks, recent ops

---

## ✅ Phase 43 — Data Residency & Compliance

- [x] **Data Inventory** — 8 categories with classification, PII flag, retention days
- [x] **Region Metadata** — 8 regions with country, GDPR flag
- [x] **Residency Policy** — allowed/restricted categories, cross-border transfer
- [x] **Retention Policy** — expiry check, days remaining, onExpiry actions
- [x] **Data Subject Requests** — GDPR Art. 15-20: access/deletion/portability/etc.
- [x] **Consent Management** — grant, revoke, expiry, version tracking
- [x] **GDPR Compliance Check** — EU region, PII consent, restricted categories

---

## ✅ Phase 44 — Workflow Scanner (Security)

- [x] **Pattern Detection** — scans workflow nodes for hardcoded secrets, credentials, SQL injection risks
- [x] **Severity Classification** — critical/high/medium/low per finding
- [x] **Node-level Findings** — pinpoints exact nodeId and field
- [x] **Summary Report** — total findings, by severity, safe-to-deploy flag

---

## ✅ Phase 45 — Self-hosted Deployment Configuration

- [x] **validateDeploymentConfig** — validates Docker/K8s config: port, URLs, secret length, SSL, scaling
- [x] **getRequiredEnvVars** — returns required/optional/secret env vars based on providers/storage/queue
- [x] **getMissingEnvVars** — diff between required and provided env vars
- [x] **estimateResourceRequirements** — CPU/memory estimation from concurrency + memory params
- [x] **generateDockerComposeSpec** — minimal docker-compose spec with app/postgres/redis services
- [x] **validateHealthCheck** — validates path, interval, timeout, failure threshold
- [x] **getDefaultHealthCheck** — returns `/api/health` with sensible defaults (57 tests)

---

## ✅ Phase 46 — Node Template Library

- [x] **createNodeTemplate** — create reusable node template with defaults
- [x] **validateNodeTemplate** — semver version, 0-5 rating, valid category, required fields
- [x] **instantiateTemplate** — create WorkflowNode from template with data/position overrides
- [x] **searchTemplates** — case-insensitive search across name/description/tags/integration
- [x] **filterTemplatesByCategory / filterTemplatesByIntegration** — axis filters
- [x] **sortTemplates** — name/popularity/recent/rating sort orders
- [x] **buildTemplateIndex** — Map-based multi-axis index (id/category/integration/tag/nameTokens)
- [x] **getRelatedTemplates** — scored related templates (category+integration+shared tags)
- [x] **computeTemplateStats** — totals, avg rating, most popular, highest rated
- [x] **exportTemplate / importTemplate** — JSON roundtrip with validation
- [x] **mergeTemplateDefaults** — merge node defaults with template precedence (68 tests)

---

## ✅ Phase 47 — Audit Log Formatter

- [x] **createAuditEvent** — structured audit event with auto id/timestamp
- [x] **formatAuditEvent** — human-readable single-line format
- [x] **formatAuditEventJson** — pretty JSON output
- [x] **formatAuditEventCef** — ArcSight CEF format for SIEM (severity 3/5/8/10)
- [x] **formatAuditEventLeef** — IBM QRadar LEEF format (tab-delimited attributes)
- [x] **maskSensitiveFields** — mask password/token/secret/apiKey in metadata
- [x] **redactPii** — redact actor email/IP + regex-based metadata redaction
- [x] **filterAuditEvents** — filter by date range/userId/action/resource/outcome/severity/IP
- [x] **groupAuditEvents** — group by action/actor.id/resource.type/severity/outcome/date
- [x] **computeAuditStats** — byOutcome/bySeverity/byAction/byActor + success rate
- [x] **detectAnomalies** — brute-force logins, action flood, IP scatter detection
- [x] **generateAuditReport** — full report with stats, anomalies, top actions/actors
- [x] **exportAuditLog** — export as JSON/CSV/CEF (75 tests)

---

## ✅ Phase 48 — Rate Limiter Engine

- [x] **createRule** — create a rate limit rule with sensible defaults
- [x] **buildRateLimitKey** — unique key from scope + context (rl:per-user:userId:rule-id)
- [x] **checkFixedWindow** — fixed window check with window reset logic
- [x] **checkSlidingWindow** — sliding window check using request timestamp array
- [x] **checkTokenBucket** — token bucket with time-based refill and burst limit
- [x] **consumeTokens** — consume tokens from bucket state with refill
- [x] **shouldSkip** — bypass rate limiting for disabled rules or matching conditions
- [x] **getRetryAfter** — seconds until retry from result
- [x] **formatRateLimitHeaders** — X-RateLimit-* / Retry-After HTTP headers
- [x] **mergeRules** — merge two rules with deduped skipConditions
- [x] **validateRule** — validate algorithm/scope/limit/burst/cost fields
- [x] **computeRateLimitStats** — totalAllowed/totalBlocked/blockRate/avgRemaining
- [x] **getRateLimitSummary** — human-readable per-rule descriptions (70 tests)

---

## ✅ Phase 49 — Workflow Diff & Version Compare

- [x] **diffNodes** — detect added/removed/moved/updated nodes with config field diffs
- [x] **diffEdges** — detect added/removed/updated edges (connection + label changes)
- [x] **diffSettings** — deep diff flattened settings key-value pairs
- [x] **diffSnapshots** — full diff between two WorkflowVersionSnapshot instances
- [x] **isBreakingChange** — remove node/edge or change node type = breaking
- [x] **summarizeDiffEntries** — count by add/remove/update/move
- [x] **applyDiff** — apply diff forward (add/remove nodes, edges, settings)
- [x] **invertDiff** — swap add↔remove, swap old↔new values for rollback
- [x] **mergeDiffs** — combine two sequential diffs into one
- [x] **formatDiffEntry** — human-readable single entry with [+/-/~/→] prefix
- [x] **formatDiff** — full formatted diff with summary and breaking change note
- [x] **filterDiff** — filter diff to specific DiffTarget types
- [x] **isDiffEmpty** — check if diff has no entries (78 tests, includes 14 legacy tests)

---

## ✅ Phase 50 — AI Node Prompt Templates

- [x] **createTemplate** — create PromptTemplate with defaults and auto-detected variables
- [x] **detectVariables** — find all {{variableName}} placeholders via regex
- [x] **validateTemplate** — check id/name/role/variables consistency/version/temperature
- [x] **renderTemplate** — substitute variables, use defaults, track used/missing
- [x] **renderTemplateStrict** — fail fast if any required variable is missing
- [x] **estimateTokens** — rough token estimate (wordCount * 1.3, rounded up)
- [x] **buildConversation** — render multiple templates as a conversation array
- [x] **mergeVariables** — merge default + override variable maps
- [x] **extractVariableSchema** — build name→TemplateVariable schema map
- [x] **validateVariableValue** — type check + regex pattern validation per variable
- [x] **searchTemplates** — case-insensitive search by name/description/tags
- [x] **cloneTemplate** — deep clone with new id and timestamps
- [x] **computeTemplateStats** — totalTemplates/byRole/byModel/avgVariables/withDefaults (71 tests)

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
| Phase 25 — Collaboration | ✅ Done | Projects, RBAC (4 roles), versioning, audit log, brute-force |
| Phase 26 — Enterprise | ✅ Done | TOTP 2FA, IP allowlist, security scanner (7 checks) |
| Phase 27 — MCP | ✅ Done | 8 MCP tools, scope auth, response helpers |
| Phase 28 — Ecosystem | ✅ Done | Marketplace, notifications, custom node SDK |
| Phase 29 — Advanced UX | ✅ Done | Schedule calendar, cost tracking, dependency graph |
| Phase 30 — Custom Node SDK | ✅ Done | Node definition, validation, field types, search |
| Phase 31 — Workflow Testing | ✅ Done | 11 assertion operators, test runner, suite aggregation |
| Phase 32 — Variable System | ✅ Done | Scoped variables, env filtering, template interpolation |
| Phase 33 — Doc Generator | ✅ Done | Markdown docs, execution path tracing, one-liners |
| Phase 34 — Multi-Environment | ✅ Done | Tier promotion, diff, validation, sanitization |
| Phase 35 — Human Approval | ✅ Done | Multi-approver, decisions, expiry, pending queries |
| Phase 36 — SSO / SAML / OIDC | ✅ Done | SAML parser, OIDC flow, PKCE, connection routing (54 tests) |
| Phase 37 — External Secrets | ✅ Done | Vault/AWS/GCP/Azure, URI parsing, rotation, interpolation (60 tests) |
| Phase 38 — Quota Manager | ✅ Done | 4-tier plans, 9 resources, soft/hard limits, health score (47 tests) |
| Phase 39 — Webhook Event Bus | ✅ Done | Route matching, deduplication, 4 retry strategies, DLQ (48 tests) |
| Phase 40 — Multi-lang Runtime | ✅ Done | 6 languages, Docker spec, security validation (46 tests) |
| Phase 41 — White-labeling | ✅ Done | Brand colors, CSS themes, embed URL, iframe snippet (38 tests) |
| Phase 42 — Live Collaboration | ✅ Done | Presence, node locks, edit history, conflict detection (38 tests) |
| Phase 43 — Data Residency | ✅ Done | GDPR compliance, retention, DSR, consent management (42 tests) |
| Phase 44 — Workflow Scanner | ✅ Done | Security pattern detection, severity classification (tests) |
| Phase 45 — Deployment Config | ✅ Done | Docker/K8s validation, env vars, health check, resource estimation (57 tests) |
| Phase 46 — Node Template Library | ✅ Done | Create/validate/search/sort/index/export templates (68 tests) |
| Phase 47 — Audit Log Formatter | ✅ Done | CEF/LEEF/JSON/CSV export, PII redaction, anomaly detection (75 tests) |
| Phase 48 — Rate Limiter Engine | ✅ Done | Fixed/sliding/token-bucket algorithms, 5 scopes, headers (70 tests) |
| Phase 49 — Workflow Diff & Version Compare | ✅ Done | diffNodes/edges/settings/snapshots, invert/merge/apply/format (78 tests) |
| Phase 50 — AI Prompt Templates | ✅ Done | Create/render/validate templates, variables, token estimate (71 tests) |
| **Total Tests** | **2046** | **76 test files** |
| MCP HTTP Endpoint | ⏳ Planned | Live MCP server for Claude/Cursor |

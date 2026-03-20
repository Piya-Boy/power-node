# PowerNode Roadmap

## ✅ Current — สิ่งที่มีแล้ว

- Authentication (Email / GitHub / Google OAuth)
- Visual Workflow Editor (React Flow)
- 10 Node Types (Triggers, AI, HTTP, Messaging)
- Credential Storage (Encrypted API Keys)
- Workflow Execution Engine (Inngest)
- Execution History & Tracking
- Billing & Subscription (Polar)

---

## Phase 1 — Core UX

> ทำให้ editor ใช้งานได้จริงและ smooth

- [ ] **Node Library Sidebar** — เลือก node type แล้ว drag & drop ลง canvas ได้
- [ ] **Node Configuration Panel** — คลิก node แล้วเปิด panel ด้านขวาเพื่อ config ค่าต่างๆ
- [ ] **Expression Editor** — อ้างอิง output จาก node ก่อนหน้าแบบ `{{node.output}}` พร้อม autocomplete
- [ ] **Node Output Preview** — แสดง input/output ของแต่ละ node บน canvas หลัง execute
- [ ] **Real-time Execution Log** — ดู log แบบ live ขณะ workflow กำลัง run
- [ ] **Data Pinning / Mocking** — test node โดยใช้ fixed data โดยไม่ต้องรัน live
- [ ] **Debug Mode** — re-run workflow จาก node ที่ต้องการได้เลย
- [ ] **Undo / Redo** — ย้อน / ทำซ้ำ action ใน editor
- [ ] **Copy / Paste Nodes** — copy node แล้ว paste ได้เลย
- [ ] **Multi-select Nodes** — เลือกหลาย node พร้อมกัน
- [ ] **Sticky Notes** — เพิ่ม note/comment บน canvas เพื่อ documentation
- [ ] **Keyboard Shortcuts** — shortcut สำหรับ canvas operations

---

## Phase 2 — More Node Types (Logic & Data)

> เพิ่ม node ที่ทำให้ workflow ทำได้หลากหลายขึ้น

**Triggers**
- [ ] **SCHEDULE_TRIGGER** — run workflow อัตโนมัติตาม cron schedule
- [ ] **WEBHOOK_TRIGGER** — รับ HTTP webhook จาก external service ใดก็ได้
- [ ] **FORM_TRIGGER** — built-in form builder สร้าง form แล้วรับ submission ได้เลย
- [ ] **EMAIL_TRIGGER** — trigger เมื่อรับ email ใหม่ (IMAP)
- [ ] **ERROR_TRIGGER** — trigger เมื่อ workflow อื่น fail

**Logic & Flow Control**
- [ ] **IF / SWITCH** — แตก flow ตาม condition
- [ ] **FILTER** — กรอง items ตาม condition
- [ ] **LOOP** — วน loop over items
- [ ] **MERGE** — รวม output จากหลาย node
- [ ] **SPLIT** — แตก array เป็น individual items
- [ ] **WAIT / DELAY** — หน่วงเวลาระหว่าง node
- [ ] **STOP & ERROR** — หยุด workflow พร้อม custom error message
- [ ] **SUB_WORKFLOW** — เรียก workflow อื่นข้างใน workflow ได้

**Data Transformation**
- [ ] **CODE (JS/Python)** — รัน custom JavaScript หรือ Python ภายใน node
- [ ] **TRANSFORM** — แปลง/ปรับ data structure (rename keys, edit fields)
- [ ] **AGGREGATE** — รวม data หลาย items เป็นก้อนเดียว
- [ ] **SORT** — เรียงลำดับ items
- [ ] **REMOVE_DUPLICATES** — ลบ duplicate items ออก
- [ ] **DATE_TIME** — จัดการ date/time format
- [ ] **CRYPTO** — hash, encrypt, decrypt data
- [ ] **MARKDOWN / HTML** — แปลง markdown ↔ HTML
- [ ] **COMPRESS** — zip/unzip files

---

## Phase 3 — Integrations

> เพิ่ม third-party integrations ให้ครอบคลุม

**Productivity & Project Management**
- [ ] **NOTION** — อ่าน / เขียน Notion database
- [ ] **GOOGLE_SHEETS** — อ่าน / เขียน Google Sheets
- [ ] **GOOGLE_CALENDAR** — จัดการ Google Calendar events
- [ ] **GOOGLE_DRIVE** — อ่าน / เขียน / upload ไฟล์ใน Google Drive
- [ ] **GMAIL** — ส่ง / รับ email ผ่าน Gmail
- [ ] **OUTLOOK** — ส่ง / รับ email / calendar ผ่าน Outlook
- [ ] **AIRTABLE** — อ่าน / เขียน Airtable database
- [ ] **JIRA** — สร้าง / อัพเดท Jira issues
- [ ] **TRELLO** — จัดการ Trello cards & boards
- [ ] **LINEAR** — สร้าง / อัพเดท Linear issues

**Communication**
- [ ] **EMAIL (SMTP)** — ส่ง email ผ่าน Resend / SendGrid / SMTP
- [ ] **TELEGRAM** — ส่ง message ผ่าน Telegram Bot
- [ ] **WHATSAPP** — ส่ง message ผ่าน WhatsApp Business API
- [ ] **MICROSOFT_TEAMS** — ส่ง message ใน Teams channel
- [ ] **TWILIO** — ส่ง SMS / voice call

**CRM & Sales**
- [ ] **HUBSPOT** — จัดการ contacts, deals, tickets
- [ ] **SALESFORCE** — จัดการ leads, opportunities
- [ ] **PIPEDRIVE** — จัดการ deals & pipeline
- [ ] **ZENDESK** — จัดการ support tickets

**Cloud & Storage**
- [ ] **AWS_S3** — อ่าน / เขียน / upload ไฟล์ใน S3
- [ ] **DROPBOX** — จัดการไฟล์ใน Dropbox
- [ ] **ONEDRIVE** — จัดการไฟล์ใน OneDrive

**Database**
- [ ] **MYSQL** — query MySQL database
- [ ] **POSTGRESQL** — query PostgreSQL database
- [ ] **MONGODB** — query MongoDB collection
- [ ] **REDIS** — get/set Redis keys
- [ ] **SNOWFLAKE** — query Snowflake data warehouse

**E-commerce & Payment**
- [ ] **SHOPIFY** — จัดการ orders, products, customers
- [ ] **STRIPE** — จัดการ payments, subscriptions (เพิ่มจาก trigger เป็น action ด้วย)
- [ ] **PAYPAL** — จัดการ transactions

**Social Media**
- [ ] **TWITTER_X** — post tweet, read mentions, search tweets
- [ ] **LINKEDIN** — post content, read profile & company data
- [ ] **YOUTUBE** — อ่าน video data, manage channel, upload video
- [ ] **INSTAGRAM** — post รูป/วิดีโอ, read insights (ผ่าน Meta API)
- [ ] **FACEBOOK** — post content, manage pages, read insights
- [ ] **TIKTOK** — post วิดีโอ, read analytics
- [ ] **PINTEREST** — create pins, manage boards
- [ ] **REDDIT** — post, comment, read subreddits
- [ ] **THREADS** — post content (Meta Threads API)
- [ ] **BLUESKY** — post content (AT Protocol)
- [ ] **MASTODON** — post content, read timeline

**Developer Tools**
- [ ] **GRAPHQL** — query GraphQL API
- [ ] **SSH** — execute commands บน remote server
- [ ] **FTP** — อ่าน / เขียนไฟล์ผ่าน FTP
- [ ] **EXECUTE_COMMAND** — รัน shell command บน server
- [ ] **GITHUB** — manage repos, issues, PRs, Actions
- [ ] **GITLAB** — manage repos, pipelines, merge requests
- [ ] **BITBUCKET** — manage repos, pipelines
- [ ] **VERCEL** — manage deployments, projects
- [ ] **NETLIFY** — manage deployments, sites
- [ ] **SENTRY** — รับ error alerts, manage issues
- [ ] **DATADOG** — ส่ง metrics, read alerts
- [ ] **NEW_RELIC** — monitor performance, read alerts
- [ ] **PAGERDUTY** — manage incidents, on-call schedules
- [ ] **CIRCLECI** — trigger builds, read pipeline status

**Analytics & Marketing**
- [ ] **GOOGLE_ANALYTICS** — read traffic, events, conversion data
- [ ] **MIXPANEL** — track events, read analytics
- [ ] **SEGMENT** — send/receive customer events
- [ ] **AMPLITUDE** — read product analytics
- [ ] **HOTJAR** — read heatmaps & session data
- [ ] **MAILCHIMP** — manage email campaigns & audiences
- [ ] **KLAVIYO** — manage email/SMS marketing flows
- [ ] **ACTIVECAMPAIGN** — manage email automation & CRM

**Finance & Accounting**
- [ ] **QUICKBOOKS** — manage invoices, expenses, accounting
- [ ] **XERO** — manage accounting, invoices, payments
- [ ] **FRESHBOOKS** — manage invoices & time tracking
- [ ] **WISE** — manage international transfers
- [ ] **PLAID** — read bank account & transaction data

**HR & Recruiting**
- [ ] **BAMBOOHR** — manage employees, time-off, onboarding
- [ ] **WORKDAY** — manage HR, payroll, recruiting
- [ ] **GREENHOUSE** — manage job postings & candidates
- [ ] **LEVER** — manage recruiting pipeline
- [ ] **GUSTO** — manage payroll & benefits
- [ ] **RIPPLING** — manage HR, IT, finance

**E-learning & Content**
- [ ] **WORDPRESS** — create/update posts, manage content
- [ ] **GHOST** — publish posts, manage members
- [ ] **WEBFLOW** — manage CMS content, trigger builds
- [ ] **CONTENTFUL** — manage content entries
- [ ] **SANITY** — manage content via GROQ/API
- [ ] **TEACHABLE** — manage courses & students
- [ ] **THINKIFIC** — manage courses & enrollments

**Customer Support**
- [ ] **INTERCOM** — manage conversations, users, messages
- [ ] **HELP_SCOUT** — manage support conversations
- [ ] **CRISP** — manage live chat & support tickets
- [ ] **DRIFT** — manage conversations & leads
- [ ] **TYPEFORM** — รับ form responses
- [ ] **SURVEYMONKEY** — รับ survey responses
- [ ] **FRESHDESK** — manage support tickets

**Video & Media**
- [ ] **ZOOM** — schedule meetings, manage recordings
- [ ] **GOOGLE_MEET** — schedule meetings via Google Calendar
- [ ] **LOOM** — manage video recordings
- [ ] **VIMEO** — upload & manage videos
- [ ] **CLOUDINARY** — upload & transform images/videos
- [ ] **MUX** — manage video streaming & encoding

**AI / ML Platforms**
- [ ] **HUGGING_FACE** — run inference on open-source models
- [ ] **REPLICATE** — run AI models via API
- [ ] **GROQ** — fast LLM inference (Llama, Mixtral)
- [ ] **TOGETHER_AI** — run open-source LLMs
- [ ] **PERPLEXITY** — AI search & answer engine
- [ ] **ELEVENLABS** — text-to-speech generation
- [ ] **WHISPER** — speech-to-text transcription
- [ ] **STABLE_DIFFUSION** — image generation

**Location & Maps**
- [ ] **GOOGLE_MAPS** — geocoding, places, directions
- [ ] **MAPBOX** — maps, geocoding, routing
- [ ] **OPENSTREETMAP** — open-source maps & geocoding

**Blockchain & Web3**
- [ ] **ETHEREUM** — read on-chain data, trigger on events
- [ ] **SOLANA** — read on-chain data, manage transactions
- [ ] **POLYGON** — read on-chain data, interact with contracts

---

## Phase 4 — AI & LLM

> เพิ่ม AI capabilities ให้ครอบคลุม

**AI Agents**
- [ ] **AI_AGENT (ReAct)** — agent ที่ใช้ tools เพื่อแก้ปัญหาแบบ step-by-step
- [ ] **AI_AGENT (OpenAI Functions)** — agent ที่ใช้ OpenAI function calling
- [ ] **AI_AGENT (SQL)** — agent ที่ query database ด้วย natural language
- [ ] **CHAT_TRIGGER** — built-in chatbot interface สำหรับ workflow

**Vector & RAG**
- [ ] **VECTOR_STORE** — integrations: Pinecone, Weaviate, PGVector, Chroma, Qdrant
- [ ] **DOCUMENT_LOADER** — โหลด PDF, Web, CSV, GitHub, Notion เป็น documents
- [ ] **EMBEDDINGS** — สร้าง embeddings จาก text
- [ ] **QA_CHAIN** — RAG pipeline ถาม-ตอบจาก documents
- [ ] **SUMMARIZATION_CHAIN** — สรุป documents อัตโนมัติ

**Local LLM**
- [ ] **OLLAMA** — รัน LLM local (Llama, Mistral, ฯลฯ) ด้วย Ollama

**AI Utilities**
- [ ] **TEXT_CLASSIFIER** — จัดหมวดหมู่ text อัตโนมัติ
- [ ] **SENTIMENT_ANALYSIS** — วิเคราะห์ sentiment จาก text
- [ ] **INFORMATION_EXTRACTOR** — ดึงข้อมูล structured จาก text
- [ ] **AI_TRANSFORM** — transform data ด้วย natural language prompt
- [ ] **MEMORY** — เก็บ conversation history (Buffer, Window, Summary)

---

## Phase 5 — AI Workflow Generator

> พิมพ์ prompt แล้วให้ AI สร้าง workflow ให้อัตโนมัติ

- [ ] **Prompt → Workflow** — วิเคราะห์ prompt แล้ว generate nodes + connections ให้เลย
- [ ] **AI Suggestions** — แนะนำ node ถัดไปที่ควรเพิ่มจาก context ของ workflow
- [ ] **Workflow Chat** — คุยกับ AI เพื่อแก้ไข / ปรับ workflow ผ่าน natural language
- [ ] **Auto-fix Errors** — AI วิเคราะห์ execution error แล้วเสนอวิธีแก้อัตโนมัติ

---

## Phase 6 — DevX & Infrastructure

> ทำให้ developer experience ดีขึ้น และ platform แข็งแกร่งขึ้น

- [ ] **Error Retry UI** — retry execution ที่ failed ได้จากหน้า execution detail
- [ ] **Webhook URL Generator** — copy webhook URL ของแต่ละ workflow ได้ง่ายๆ
- [ ] **Variable System** — global variables ที่ใช้ได้ข้าม workflow
- [ ] **Public REST API** — จัดการ workflow / execution ผ่าน REST API โดยตรง
- [ ] **Execution Queue** — Queue Mode สำหรับ scale execution แบบ distributed
- [ ] **Log Streaming** — ส่ง execution logs ไปยัง Datadog / Splunk / external monitoring
- [ ] **Insights Dashboard** — analytics เช่น success rate, time saved, execution trends
- [ ] **Workflow Tagging** — tag workflow เพื่อจัดหมวดหมู่
- [ ] **Export / Import Workflows** — export เป็น JSON แล้ว import ใน instance อื่น

---

## Phase 7 — Collaboration & Governance

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

## Phase 8 — Enterprise & Security

> Security และ compliance สำหรับ enterprise

- [ ] **SSO (SAML)** — Single Sign-On ผ่าน Okta, Azure AD ฯลฯ
- [ ] **OIDC / LDAP** — enterprise identity provider integration
- [ ] **2FA** — Two-Factor Authentication
- [ ] **External Secrets** — ดึง credentials จาก Vault, AWS SM, GCP SM, Azure KV
- [ ] **Security Audit Tool** — scan หา misconfiguration ใน workflows
- [ ] **IP Allowlisting** — จำกัด access จาก IP ที่กำหนด
- [ ] **Self-hosted Deployment** — deploy บน Docker / Kubernetes ของตัวเอง

---

## Phase 9 — MCP (Model Context Protocol)

> เชื่อมต่อ AI agents กับ tools/data sources ได้ไม่จำกัดผ่าน MCP standard

### PowerNode as MCP Client
> PowerNode เชื่อมกับ MCP servers ภายนอก

- [ ] **MCP Server Node** — เพิ่ม MCP server เป็น node ใน workflow ได้เลย
- [ ] **MCP Client** — PowerNode เชื่อมต่อกับ MCP servers ภายนอกได้
- [ ] **MCP Server Builder** — สร้าง custom MCP server ของตัวเองภายใน PowerNode
- [ ] **MCP Marketplace** — browse และ install MCP servers จาก community registry
- [ ] **Built-in MCP Servers** — MCP servers สำเร็จรูปสำหรับ integrations หลักๆ (GitHub, Notion, Postgres, Filesystem ฯลฯ)
- [ ] **AI Agent + MCP** — AI Agent node สามารถใช้ MCP tools ได้โดยตรง
- [ ] **MCP Inspector** — debug และ monitor MCP tool calls ใน workflow

### PowerNode as MCP Server
> ให้ภายนอก (Claude, Cursor, Windsurf ฯลฯ) เข้าถึง PowerNode ผ่าน MCP

- [ ] **MCP Server Endpoint** — PowerNode expose MCP server ให้ AI clients เชื่อมต่อได้
- [ ] **Tool: list_workflows** — AI สามารถดูรายการ workflows ทั้งหมดได้
- [ ] **Tool: create_workflow** — AI สร้าง workflow ใหม่ได้จากภายนอก (เช่น พิมพ์ใน Claude Desktop ว่า "สร้าง workflow 'Send Weekly Report'" แล้ว Claude จะสร้างให้เลย)
- [ ] **Tool: execute_workflow** — AI สั่งรัน workflow ได้เลย
- [ ] **Tool: get_execution_status** — AI ดูสถานะ execution ได้ real-time
- [ ] **Tool: get_execution_result** — AI ดึง output จาก execution ได้
- [ ] **Tool: update_workflow** — AI แก้ไข nodes/connections ใน workflow ได้
- [ ] **Tool: manage_credentials** — AI จัดการ credentials ได้อย่างปลอดภัย
- [ ] **MCP Auth** — ระบบ authentication สำหรับ MCP clients (API key / OAuth)
- [ ] **Per-user MCP Token** — แต่ละ user มี MCP endpoint ของตัวเอง

---

## Phase 10 — Ecosystem & Scale

> ขยาย platform ให้เป็น ecosystem เต็มรูปแบบ

- [ ] **Workflow Templates Marketplace** — community publish / share templates ได้
- [ ] **White-labeling** — เปลี่ยน branding สำหรับ reseller / embed ในแอปอื่น
- [ ] **Embed Mode** — embed PowerNode editor ใน application อื่นได้
- [ ] **Mobile App** — ดู execution status และ approve/reject workflow จาก mobile
- [ ] **Custom Node SDK** — developer สร้าง custom node type เองได้

---

## Phase 11 — Advanced UX & Operations

> ทำให้การใช้งานและการจัดการ workflow ดีขึ้นในระดับ production

- [ ] **Workflow Scheduling UI** — calendar view ดูว่า workflow ไหนจะรันเมื่อไหร่ ปรับ schedule ได้จาก UI โดยตรง
- [ ] **Notification Center** — แจ้งเตือน in-app เมื่อ workflow fail / success / ต้องการ approval พร้อม push notification mobile
- [ ] **Cost Tracking per Workflow** — แสดงว่าแต่ละ workflow ใช้ token/credits เท่าไหร่ estimate ค่าใช้จ่ายก่อนรัน
- [ ] **Workflow Testing Suite** — เขียน test case สำหรับ workflow รัน regression test อัตโนมัติก่อน deploy
- [ ] **Multi-language Node (Go, Ruby, PHP)** — Code node รองรับภาษาเพิ่มจาก JS/Python
- [ ] **On-premise Data Residency** — เลือก region ที่จะ store ข้อมูล สำหรับ compliance (GDPR, PDPA)
- [ ] **Workflow Documentation Generator** — AI auto-generate documentation จาก workflow export เป็น Markdown / PDF
- [ ] **Dependency Graph** — visualize ว่า workflow ไหน call workflow ไหนบ้าง เห็น impact ก่อน edit

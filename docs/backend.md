# Backend NOVA: implemented local contract

SQLite: `.data/nova.sqlite`, `PRAGMA user_version=1`. All mutations use prepared SQL statements. Multi-record administrative changes run in transactions. `version` is checked before updates. A failed transaction creates no notifications or audit records.

Authentication: POST `/api/login`, POST `/api/logout`, GET `/api/session`. HttpOnly/SameSite=Strict session cookie; no credentials in model prompts. Server is loopback-only and checks Host and Origin. Test accounts have a shared documented seed password and must not be used for public deployment.

Read routes: `/api/workspace`, `/api/students`, `/api/lessons`, `/api/requests`, `/api/grades`, `/api/appeals`, `/api/announcements`, `/api/notifications`, `/api/messages`, `/api/stats`, `/api/audit`.

Write routes: POST `/api/requests`, `/api/requests/:id`, `/api/lessons/:id`, `/api/grades/:id`, `/api/appeals`, `/api/appeals/:id`, `/api/announcements`, `/api/messages`, `/api/notifications/read`. Administrative decisions require `confirm:true`; edits require the last read `version`.

Students see their own documents and grades and their group schedule. Teachers see their assigned groups, lessons and grades. Dean employees share one faculty scope in this test dataset; fine-grained dean permissions and multi-faculty boundaries remain future work.

LLM: GET `/api/llm/status`, GET/POST `/api/chat`. Ollama is loopback-only, non-streaming, time-limited and has no action tools or database credentials. Server-generated data context enforces access before prompting. Conversation history is isolated by account. Prompt instructions cannot grant permissions. Model prose is not authoritative evidence of an action.

Limitations: no production auth, enrollment, password recovery, passkeys, real documents, push delivery, migrations beyond v1, large-scale performance guarantee or load test with 109 simultaneous users. Tested: all 109 sequential logins and concurrent schedule reads, not full multi-user browser sessions.

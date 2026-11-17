# Backend NOVA: implemented local contract

SQLite: `.data/nova.sqlite`, `PRAGMA user_version=2`. All mutations use prepared SQL statements. Multi-record administrative changes run in transactions. `version` is checked before updates. A failed transaction creates no notifications or audit records.

Authentication: POST `/api/login`, POST `/api/logout`, GET `/api/session`. HttpOnly/SameSite=Strict session cookie; no credentials in model prompts. Server is loopback-only and checks Host and Origin. Test accounts have a shared documented seed password and must not be used for public deployment.

Read routes: `/api/workspace`, `/api/students`, `/api/lessons`, `/api/requests`, `/api/grades`, `/api/appeals`, `/api/announcements`, `/api/notifications`, `/api/messages`, `/api/stats`, `/api/audit`.

Write routes: POST `/api/requests`, `/api/requests/:id`, `/api/lessons/:id`, `/api/grades/:id`, `/api/appeals`, `/api/appeals/:id`, `/api/announcements`, `/api/messages`, `/api/notifications/read`. Administrative decisions require `confirm:true`; edits require the last read `version`.

Students see their own documents and grades and their group schedule. Teachers see their assigned groups, lessons and grades. Dean employees share one faculty scope in this test dataset; fine-grained dean permissions and multi-faculty boundaries remain future work.

LLM: GET `/api/llm/status`, GET/POST `/api/chat`. Ollama is loopback-only, non-streaming, time-limited and has no action tools or database credentials. Server-generated data context enforces access before prompting. Conversation history is isolated by account. Prompt instructions cannot grant permissions. Model prose is not authoritative evidence of an action.

Limitations: no production auth, enrollment, password recovery, passkeys, real documents, push delivery, migrations beyond v2, large-scale performance guarantee or load test with 109 simultaneous users. Tested: all 109 sequential logins and concurrent schedule reads, not full multi-user browser sessions.


V2 routes: GET `/api/students/:login`, GET `/api/requests/:id`, GET `/api/lessons/:id/availability?day=YYYY-MM-DD&room=...`, GET/POST `/api/lesson-changes`, POST `/api/lesson-changes/:id/decision`, GET `/api/staff`, GET/POST `/api/staff-requests`, POST `/api/staff-requests/:id/reply`, GET `/api/dean/analytics?group=...&course=...`.

The UI sends schedule proposals instead of direct changes. Only the assigned teacher can accept/reject. Acceptance rechecks version and all conflicts transactionally. A partial unique index prevents duplicate pending proposals. The legacy direct lesson edit API remains dean-only for compatibility; it can invalidate pending proposals, which will then require rejection and a fresh proposal.

Known workflows return structured chat actions with a fixed client allowlist. They do not execute mutations. Student/request details enforce ownership or assigned group scope. Analytics filters affect student-related metrics; pending transfer count is explicitly faculty-wide.


### Диалоговое обращение
В кабинете деканата запрос «Создать обращение» предлагает диалог или обычную форму. Диалог уточняет получателя из базы, тему (120 символов) и сообщение (2000 символов), показывает предпросмотр и отправляет только по кнопке подтверждения. Черновик можно изменить или отменить; он хранится в памяти вкладки и не переживает обновление страницы. Ответы показываются постепенно после получения результата API (это визуальный эффект, не потоковая генерация Ollama). Переписка прокручивается отдельно от поля ввода; автозапуск экскурсии прекращается при обращении к чату.


### Реестр действий деканата
`backend/agent.mjs` содержит 13 групп возможностей. Запрос «Что ты умеешь?» выводит их кнопками в переписке. Чтение выполняется через те же серверные обработчики и права, что и ручные разделы. LLM не получает произвольного доступа к SQL или записи в базу.

- В чате: расписание, поиск студентов, оценки/задолженности, аналитика, заявления, обращения, объявления, уведомления, общий чат, статусы переносов и журнал изменений. Длинные выборки ограничены 30 строками; указано общее количество, когда применимо.
- Диалоговые черновики: служебное обращение, объявление (аудитория, тема, текст), сообщение в общий чат, ответ на обычное или адресованное сотруднику служебное обращение. Предпросмотр, изменение, отмена и отдельное подтверждение отправки.
- Карточки из переписки: дело студента, решение по заявлению, календарь переноса события с согласованием преподавателя. Переход между страницами только по явной кнопке.
- Недоступно: создание/отмена событий, отчисление/зачисление, выдача официальных документов, экспорт, оплата, интеграции с почтой и мессенджерами. Изменение оценок не разрешено роли деканата. Для распознанных неподдерживаемых операций сервер возвращает `unsupported_action`, для запрещённого изменения оценок — `permission_denied`, без вызова LLM и без записи данных.
- Свободные консультации обрабатывает Ollama, которой передаётся реальный каталог возможностей и запрет обещать отсутствующие операции. Это не универсальное распознавание любых формулировок: известные сценарии маршрутизируются явно, произвольный текст консультирует LLM без инструментов записи.
- Ошибки: валидация, отсутствие данных, истечение сессии, недостаток прав, конфликты версий, недоступность сервера/модели. Потеря подтверждения записи помечается как неизвестный результат; повторная отправка такого черновика блокируется до проверки списка. Черновики остаются в памяти вкладки, перезагрузка их сбрасывает.

Проверка: `tests/agent.test.mjs` проверяет весь каталог, фильтры, неподдерживаемые действия и отсутствие побочных записей; `tests/backend-ui.test.mjs` — диалог, предпросмотр, отправку, отмену, ответы и сетевые ошибки на отдельной базе.

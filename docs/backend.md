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


### Кабинеты студента и преподавателя
`backend/role-agent.mjs` содержит по 12 групп возможностей для этих ролей. Все выборки ограничены сервером: студент видит собственные заявления, оценки и расписание группы; преподаватель — свои ведомости, связанные группы и адресованные ему запросы переноса. Общий чат намеренно доступен всем.

Студент может в диалоге заказать справку/подать заявление, получить статус, открыть историю, отправить уточнение по запросу деканата, написать обращение, прочитать ответ и уведомления. Уточнение хранится отдельно от исходного текста, возвращает статус «На рассмотрении» и уведомляет деканат. Добавлена таблица `request_clarifications`, версия базы 3; существующие записи сохраняются.

Преподаватель может в диалоге исправить оценку своей дисциплины с указанием причины, согласовать/отклонить перенос, написать обращение в деканат и ответить на адресованное служебное обращение. Исправление через ручную ведомость открывается в отдельном окне. Сохранение оценки уведомляет студента; перенос обновляет расписание участников после согласования. Все операции проверяют права, допустимые состояния и версии на сервере. При конфликте черновик нельзя повторно отправить без загрузки актуальных данных.

Сквозные проверки: `tests/role-agent.test.mjs` и `tests/backend-ui.test.mjs` покрывают каталоги обеих ролей, подачу/уточнение/решение по заявлению, переписку с деканатом, оценку и уведомление студенту, перенос события, аудитории объявлений, отрицательные проверки прав и конфликтов.

### Локальная модель: резервный режим
При ответе Ollama с ошибкой CUDA/GPU NOVA один раз повторяет запрос с `options.num_gpu=0` и сохраняет CPU-режим до перезапуска сервера. На текущем компьютере он включён сразу через игнорируемый `.env`: `NOVA_OLLAMA_CPU=1`. На других машинах значение 0 оставляет автоматический выбор. Параметр относится только к запросам NOVA и не меняет драйверы или системные настройки. История консультации ограничена четырьмя сообщениями по 1000 символов; CPU-контекст — 4096 токенов. Время ожидания свободного ответа — до 150 секунд с возможностью отмены. Встроенные сценарии не ждут генерацию модели.

Параметры сверены с официальным описанием типов Ollama: https://github.com/ollama/ollama/blob/main/api/types.go .


Для текущего стенда выбран `qwen2.5:1.5b` (instruct, CPU), устанавливается через `ollama pull qwen2.5:1.5b`. Он заменяет Qwen3 в настройке NOVA, исходные локальные модели сохранены. Лицензия Apache 2.0 указана на [официальной странице модели](https://ollama.com/library/qwen2.5:1.5b). Модель консультирует, но не выполняет записи в базу. Выполнение действий обеспечивает серверный реестр и подтверждения пользователя.

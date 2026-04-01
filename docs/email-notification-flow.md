# Email notification flow

Transactional emails mirror rows in `public.notifications`. They are sent when Supabase **Database Webhooks** deliver each **INSERT** to the Next.js API, which calls **Resend**.

## Requirements

- Webhook URL must be **public HTTPS** (e.g. production domain). Supabase Cloud cannot POST to `http://localhost`.
- Env on the Next server: `SUPABASE_NOTIFICATIONS_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL`, `RESEND_API_KEY`, `RESEND_FROM`.

## Flowchart

```mermaid
flowchart TD
  subgraph triggers [What creates in-app notifications]
    T1[DB triggers and RPCs]
    T2["lineup-notify.ts bulk insert"]
    T1 --> N[(public.notifications INSERT)]
    T2 --> N
  end

  N --> WH[Supabase Database Webhook]
  WH -->|"HTTPS POST + Authorization Bearer"| API["Next.js POST /api/webhooks/notifications-email"]

  API --> AUTH{Bearer matches secret?}
  AUTH -->|no| R401[401 Unauthorized]
  AUTH -->|yes| PARSE{Valid JSON and record?}
  PARSE -->|no| R400[400 Bad payload]
  PARSE -->|yes| SEND[sendNotificationEmail]

  SEND --> A1{Type in EMAIL_NOTIFICATION_TYPES allowlist?}
  A1 -->|filtered| SKIP1[Skip: ok 200]
  A1 -->|ok| A2{NEXT_PUBLIC_APP_URL set?}
  A2 -->|no| SKIP2[Skip: ok 200]
  A2 -->|yes| A3{RESEND_API_KEY and RESEND_FROM?}
  A3 -->|no| SKIP3[Skip: ok 200]
  A3 -->|yes| AUTHAPI[Auth admin getUserById]
  AUTHAPI --> A4{User email exists?}
  A4 -->|no| SKIP4[Skip: ok 200]
  A4 -->|yes| RND[renderNotificationEmail templates]
  RND --> RS[Resend emails.send + Idempotency-Key]
  RS -->|error| R500[500 retry webhook]
  RS -->|success| R200[200 ok]
```

## Sequence (compact)

```mermaid
sequenceDiagram
  participant PG as Postgres
  participant SB as SupabaseWebhook
  participant NX as NextAPI
  participant SA as SupabaseAuthAdmin
  participant RE as Resend
  participant U as UserInbox

  PG->>PG: INSERT into notifications
  SB->>NX: POST webhook payload record
  NX->>NX: verify secret parse row
  NX->>SA: getUserById(user_id)
  SA-->>NX: email
  NX->>NX: HTML or text from template
  NX->>RE: send email idempotent
  RE-->>U: delivery
```

## Code map

| Step | Location |
|------|----------|
| Webhook handler | `src/app/api/webhooks/notifications-email/route.ts` |
| Send + Resend | `src/lib/email/send-notification-email.ts` |
| Payload parsing | `src/lib/email/notification-record.ts` |
| Templates | `src/lib/email/templates/render.ts` + `src/lib/email/layout.ts` |
| Auth header check | `src/lib/email/webhook-auth.ts` |

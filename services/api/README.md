# Emergency API Service

Modular Node.js + Express + TypeScript backend for the Real-Time Emergency Response System.

## Stack

- Runtime: `express`, `pg`, `socket.io`, `zod`, `dotenv`
- Security/Auth: `helmet`, `cors`, `compression`, `express-rate-limit`, `bcryptjs`, `jsonwebtoken`
- Tooling: `typescript`, `tsx`

## Folder Structure

```text
services/api/
  db/
    schema.sql
  src/
    app.ts
    server.ts
    config/
    database/
      migrate.ts
      migrations/
        001_init.sql
        002_full_system.sql
    middlewares/
    modules/
      auth/
      users/
      volunteers/
      emergencies/
      dispatcher/
      messages/
      locations/
      responders/
    sockets/
    shared/
```

## Environment Variables

Create `.env` from `.env.example`:

```bash
cp .env.example .env
```

Required keys:

- `PORT`
- `NODE_ENV`
- `DATABASE_URL`
- `CLIENT_ORIGINS`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `ACCESS_TOKEN_TTL`
- `REFRESH_TOKEN_TTL`
- `OPENAI_API_KEY` (optional, assistant uses safe fallback if missing)
- `OPENAI_MODEL` (default: `gpt-4.1-mini`)

## Run Locally

1. Install dependencies from repository root:

```bash
npm install
```

2. Create database:

```sql
CREATE DATABASE emergency_response;
```

3. Run migrations:

```bash
npm --workspace @ers/api run migrate
```

4. Start API:

```bash
npm --workspace @ers/api run dev
```

## REST API

Base URL: `/api/v1`

### Auth

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /auth/me`

### Users

- `GET /users/me/profile`
- `PATCH /users/me/profile`
- `GET /users/me/medical-profile`
- `PUT /users/me/medical-profile`
- `GET /users/me/history`

### Volunteers

- `GET /volunteers/me/profile`
- `PATCH /volunteers/me/profile`
- `PATCH /volunteers/me/availability`
- `GET /volunteers/me/incidents`
- `GET /volunteers/nearby`

### Emergencies

- `POST /emergencies`
- `GET /emergencies`
- `GET /emergencies/:caseId`
- `PATCH /emergencies/:caseId/status`
- `POST /emergencies/:caseId/assign-ambulance`
- `POST /emergencies/:caseId/assign-volunteer`
- `POST /emergencies/:caseId/volunteer-response`
- `POST /emergencies/:caseId/updates`
- `GET /emergencies/:caseId/updates`
- `GET /emergencies/:caseId/nearby-volunteers`
- `POST /emergencies/:caseId/close`

### Dispatcher

- `GET /dispatcher/overview`
- `GET /dispatcher/active-cases`
- `GET /dispatcher/cases/:caseId`
- `POST /dispatcher/cases/:caseId/assign-ambulance`
- `POST /dispatcher/cases/:caseId/assign-volunteer`
- `POST /dispatcher/cases/:caseId/close`
- `GET /dispatcher/reports/summary`

### Messages

- `POST /messages`
- `GET /messages/case/:caseId`

### Locations

- `POST /locations`
- `GET /locations/case/:caseId`
- `GET /locations/nearby-volunteers`
- `GET /locations/nearest-ambulances`

### Responders

- `GET /responders`

## Socket.IO

### Client Emits

- `dashboard:join`
- `case:join`
- `case:leave`
- `location:update`

### Server Emits

- `connection:ready`
- `server:error`
- `emergency:created`
- `emergency:update`
- `emergency:status-changed`
- `emergency:ambulance-assigned`
- `emergency:volunteer-assigned`
- `emergency:volunteer-responded`
- `emergency:closed`
- `emergency:location-changed`
- `message:created`

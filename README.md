# Real-Time Emergency Response System

Full-stack graduation project with:

- `Citizen Mobile App` (React Native)
- `Volunteer Mobile App` (React Native)
- `Dispatcher Web Dashboard` (React + Vite)
- `Backend API` (Node.js + Express + Socket.IO)
- `PostgreSQL` schema and migrations

## Monorepo Structure

```text
emergency-response-system/
  apps/
    citizen-mobile/
    volunteer-mobile/
    dispatcher-dashboard/
  services/
    api/
      db/schema.sql
      src/database/migrations/
      src/modules/
        auth/
        users/
        volunteers/
        emergencies/
        dispatcher/
        messages/
        locations/
        responders/
      src/sockets/
  packages/
    shared/
```

### Detailed App Structure

```text
apps/
  citizen-mobile/
    App.tsx
    src/
      components/
        BottomNav.tsx
        Ui.tsx
      data/
        mockCitizen.ts
      screens/
        HomeScreen.tsx
        DispatchScreen.tsx
        FirstAidScreen.tsx
        HistoryScreen.tsx
        ProfileScreen.tsx
      services/
        api.ts
      theme/
        tokens.ts
      types/
        index.ts
  volunteer-mobile/
    App.tsx
    src/
      components/
        BottomNav.tsx
        Ui.tsx
      data/
        mockVolunteer.ts
      screens/
        AlertsScreen.tsx
        AcceptedScreen.tsx
        InProgressScreen.tsx
        HistoryScreen.tsx
        ProfileScreen.tsx
      services/
        api.ts
      theme/
        tokens.ts
      types/
        index.ts
  dispatcher-dashboard/
    src/
      App.tsx
      components/
        common/MetricCard.tsx
        layout/Sidebar.tsx
        layout/TopBar.tsx
      pages/
        OverviewPage.tsx
        CaseDetailsPage.tsx
        AmbulanceAssignmentPage.tsx
        VolunteerCoordinationPage.tsx
        LiveTrackingPage.tsx
        ReportsPage.tsx
      services/
        api.ts
```

## Technology Stack

- Mobile: React Native (Expo)
- Web: React + Vite
- Backend: Express + TypeScript
- Database: PostgreSQL
- Realtime: Socket.IO
- Maps: integrated UI placeholders + API-ready structure for Google Maps

## Backend API Highlights

Base path: `/api/v1`

- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`
- `GET/PATCH /users/me/profile`
- `GET/PUT /users/me/medical-profile`
- `GET /users/me/history`
- `GET/PATCH /volunteers/me/profile`
- `PATCH /volunteers/me/availability`
- `GET /volunteers/me/incidents`
- `GET /volunteers/nearby`
- `POST /emergencies`
- `GET /emergencies`
- `GET /emergencies/:caseId`
- `PATCH /emergencies/:caseId/status`
- `POST /emergencies/:caseId/assign-ambulance`
- `POST /emergencies/:caseId/assign-volunteer`
- `POST /emergencies/:caseId/volunteer-response`
- `POST /emergencies/:caseId/updates`
- `GET /emergencies/:caseId/updates`
- `POST /emergencies/:caseId/close`
- `GET /dispatcher/overview`
- `GET /dispatcher/active-cases`
- `GET /dispatcher/cases/:caseId`
- `POST /dispatcher/cases/:caseId/assign-ambulance`
- `POST /dispatcher/cases/:caseId/assign-volunteer`
- `POST /dispatcher/cases/:caseId/close`
- `GET /dispatcher/reports/summary`
- `POST /messages`
- `GET /messages/case/:caseId`
- `POST /locations`
- `GET /locations/case/:caseId`
- `GET /locations/nearby-volunteers`
- `GET /locations/nearest-ambulances`

## Realtime Events

- `emergency:created`
- `emergency:update`
- `emergency:status-changed`
- `emergency:ambulance-assigned`
- `emergency:volunteer-assigned`
- `emergency:volunteer-responded`
- `emergency:closed`
- `emergency:location-changed`
- `message:created`

## Setup

1. Install Node.js 20+ and pnpm.
2. Install dependencies at project root:

```bash
pnpm install
```

3. Configure backend env:

```bash
cp services/api/.env.example services/api/.env
```

4. Create PostgreSQL database:

```sql
CREATE DATABASE emergency_response;
```

5. Run migrations:

```bash
pnpm run migrate:api
```

6. Start services:

```bash
pnpm run dev:api
pnpm run dev:dispatcher
pnpm run dev:citizen
pnpm run dev:volunteer
```

### Cross-network (Public Internet) Mobile Mode

Use public mode when phone and laptop are on different networks:

```bash
pnpm run dev:citizen:public
# or
pnpm run dev:volunteer:public
```

## Current Development Status

- Phase 1 complete: architecture, schema, auth, RBAC, modular APIs.
- Phase 2 complete: citizen app screens and emergency flow UI.
- Phase 3 complete: volunteer app alert/response/history/profile UI.
- Phase 4 complete: dispatcher dashboard multi-screen operations UI.
- Phase 5 foundation complete: realtime events, messaging, incident closure reports.

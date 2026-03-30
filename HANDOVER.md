# Handover for Claude

## Kurzfassung
- App läuft auf Unraid unter `http://192.168.178.112:8085`
- Docker Compose nicht verfügbar ? manueller Docker-Start (Backend/Frontend/Postgres)
- Wichtige Fixes: CORS JSON, CRLF in `.env`, Backend Alias `backend`, bcrypt Version
- Neue UI-Seiten + Dependency Builder + Fritz-Integration (noch ohne Mesh-Daten)
- Topology-UI verbessert

## Deployment (Unraid)
- Root: `/mnt/user/appdata/discovery-cmdb`
- Container:
  - `cmdb-db` (postgres:16-alpine)
  - `cmdb-backend` (FastAPI)
  - `cmdb-frontend` (Nginx/Vite)
- Backend braucht Network Alias `backend` (Nginx upstream)
- `.env` muss LF sein, nicht CRLF (sonst DB-User hat \r)
- `CORS_ORIGINS` muss JSON sein: `["*"]`

## Backend Änderungen
- bcrypt fix: `backend/requirements.txt` ? `bcrypt==4.0.1` vor `passlib[bcrypt]`
- FRITZ!Box Integration:
  - `backend/app/services/fritzbox.py`
  - `backend/app/api/v1/endpoints/fritz.py`
  - `backend/app/api/v1/router.py` ? fritz router include
  - `backend/app/api/v1/endpoints/setup.py` ? fritz settings defs
  - `backend/app/schemas/user.py` ? setup wizard fields
  - `backend/app/services/discovery.py` ? `FritzBoxService.from_settings().sync_mesh()` nach Scan
- FRITZ Diagnose: `/api/v1/fritz/diagnose` (admin) gibt Mesh-Path + Status + Node Count

## Frontend Änderungen
- Neue Seiten:
  - `frontend/src/pages/FritzBox.tsx`
  - `frontend/src/pages/CIDetail.tsx` (Dependency Builder + View)
  - `frontend/src/pages/Discovery.tsx`
  - `frontend/src/pages/ServiceNow.tsx`
  - `frontend/src/pages/AuditLog.tsx`
  - `frontend/src/pages/Settings.tsx`
  - `frontend/src/pages/Users.tsx`
- Routen:
  - `frontend/src/App.tsx` + Sidebar erweitert um `/fritz`
- Setup Wizard:
  - `frontend/src/pages/Setup.tsx` fragt FRITZ Daten ab
- Types:
  - `frontend/src/types/index.ts` ? `DependencyTree`, `DependencyNode`
- Topology:
  - `frontend/src/pages/Topology.tsx` ? Suche, Filter, Auto-Arrange, Toggle Labels/IP, cleaner UI

## Current Status / TODO
- FRITZ Mesh liefert `nodes: 0` (Sync Result). Beziehungen werden nicht erstellt.
  - Diagnose-Endpoint existiert, muss in UI angezeigt oder manuell aufgerufen werden.
  - Wahrscheinlich andere Mesh-Struktur oder Endpoint.
- Git Push fehlgeschlagen: Repo `https://github.com/simonex3/discovery-cmdb.git` not found.
  - Temp Git-Worktree: `C:\Users\RDPUser\Desktop\discovery-cmdb-git`
  - Git dir: `C:\Users\RDPUser\Desktop\gitdata`
  - 2 Commits vorhanden:
    1. "Complete frontend pages and wire UI"
    2. "Fix topology types for build"

## Manuelle Docker Start Kommandos (Unraid)
```bash
cd /mnt/user/appdata/discovery-cmdb

docker build -t discovery-cmdb-backend ./backend

docker build -t discovery-cmdb-frontend ./frontend

docker run -d --name cmdb-backend \
  --network cmdb-net --network-alias backend \
  --restart unless-stopped \
  --cap-add NET_ADMIN --cap-add NET_RAW \
  --env-file /mnt/user/appdata/discovery-cmdb/.env \
  -e DATABASE_URL=postgresql://cmdb:cmdb_secret_change_me@db:5432/cmdb \
  -v /mnt/user/appdata/discovery-cmdb/backend/data:/app/data \
  discovery-cmdb-backend

docker run -d --name cmdb-frontend \
  --network cmdb-net --restart unless-stopped \
  -p 8085:80 discovery-cmdb-frontend
```

## Files to check
- Backend:
  - `backend/app/services/fritzbox.py`
  - `backend/app/api/v1/endpoints/fritz.py`
  - `backend/app/api/v1/router.py`
  - `backend/app/api/v1/endpoints/setup.py`
  - `backend/app/schemas/user.py`
  - `backend/app/services/discovery.py`
  - `backend/requirements.txt`
- Frontend:
  - `frontend/src/pages/FritzBox.tsx`
  - `frontend/src/pages/CIDetail.tsx`
  - `frontend/src/pages/Topology.tsx`
  - `frontend/src/pages/Setup.tsx`
  - `frontend/src/App.tsx`
  - `frontend/src/components/layout/Sidebar.tsx`
  - `frontend/src/types/index.ts`

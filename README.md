# 🖧 Discovery CMDB

> A self-hosted Configuration Management Database with automatic network discovery, interactive topology visualization, dependency mapping, and ServiceNow integration — built for home networks.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Docker](https://img.shields.io/badge/docker-ready-blue)

---

## ✨ Features

| Feature | Description |
|---|---|
| 🔍 **Auto-Discovery** | nmap-based network scanning — finds all devices in your subnet automatically |
| 💓 **Health Monitoring** | Scheduled ping & port checks with real-time status |
| 🗺️ **Network Topology** | Interactive graph view of all CIs and their connections |
| 🔗 **Dependency Mapping** | Upstream/downstream dependency trees per CI |
| 📋 **CI Inventory** | Full CRUD for Configuration Items: servers, VMs, containers, IoT, services... |
| 🔄 **ServiceNow Sync** | Bidirectional sync + Table API compatibility (`/api/now/table/cmdb_ci`) |
| 📜 **Audit Log** | Every change tracked with actor, timestamp, and diff |
| 👥 **User Management** | Role-based access: Admin / Operator / Viewer |
| 🧙 **Setup Wizard** | First-run wizard to configure everything |
| 📊 **Dashboard** | Live stats, charts, and recent activity |
| 🔑 **API Keys** | Per-user API keys for automation |
| 📤 **Import / Export** | Bulk operations in JSON and CSV |
| 📖 **Swagger Docs** | Full interactive API documentation at `/docs` |

---

## 🚀 Quick Start

### Prerequisites
- Docker + Docker Compose
- SSH access to your Unraid server

### 1. Clone the repository
```bash
git clone https://github.com/simonex3/discovery-cmdb.git
cd discovery-cmdb
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env with your settings (change passwords!)
nano .env
```

### 3. Deploy to Unraid
```bash
chmod +x deploy.sh
./deploy.sh
```

Or manually:
```bash
docker compose up -d --build
```

### 4. Open in browser
```
http://192.168.178.112:8085
```

The **Setup Wizard** launches automatically on first run.

---

## 🐳 Docker Services

| Service | Port | Description |
|---|---|---|
| `frontend` | `8085` | React UI (Nginx) |
| `backend` | internal | FastAPI (only accessible via frontend proxy) |
| `db` | internal | PostgreSQL 16 |

> Ports can be changed in `.env` → `FRONTEND_PORT`.

---

## 📡 API Documentation

| URL | Description |
|---|---|
| `http://host:8085/docs` | Swagger UI (interactive) |
| `http://host:8085/redoc` | ReDoc (reference) |
| `http://host:8085/api/v1/` | Native CMDB REST API |
| `http://host:8085/api/now/table/` | ServiceNow Table API compatibility |

### Authentication

```bash
# Login
curl -X POST http://host:8085/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "yourpassword"}'

# Use token
curl http://host:8085/api/v1/cis \
  -H "Authorization: Bearer <token>"

# Or use API key
curl http://host:8085/api/v1/cis \
  -H "Authorization: Bearer cmdb_<api_key>"
```

### ServiceNow Integration

```bash
# Query CIs in ServiceNow format
GET /api/now/table/cmdb_ci?sysparm_limit=10&sysparm_query=status=active

# Create CI via ServiceNow format
POST /api/now/table/cmdb_ci_server
```

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────┐
│               Unraid Host               │
│                                         │
│  ┌──────────────┐  ┌─────────────────┐  │
│  │   Frontend   │  │    Backend      │  │
│  │  React+Vite  │  │   FastAPI       │  │
│  │  Nginx:80    │──│   Uvicorn:8000  │  │
│  └──────────────┘  └────────┬────────┘  │
│         │                   │           │
│    Port 8085           ┌────▼────┐      │
│                        │Postgres │      │
│                        │   16    │      │
│                        └─────────┘      │
└─────────────────────────────────────────┘
```

---

## 🔧 Configuration

| Variable | Default | Description |
|---|---|---|
| `POSTGRES_PASSWORD` | `cmdb_secret_change_me` | **Change this!** |
| `SECRET_KEY` | *(random)* | JWT signing key — change this! |
| `NETWORK_RANGE` | `192.168.178.0/24` | CIDR range for auto-discovery |
| `DISCOVERY_INTERVAL_MINUTES` | `60` | How often to scan the network |
| `HEALTH_CHECK_INTERVAL_MINUTES` | `5` | How often to ping devices |
| `AUTO_DISCOVERY_ENABLED` | `true` | Enable scheduled discovery |
| `FRONTEND_PORT` | `8085` | External port for the UI |

---

## 🔍 Auto-Discovery

Discovery uses **nmap** to scan your network range and:
- Detects all active hosts (IPs, hostnames, MACs)
- Identifies OS via OS fingerprinting
- Scans common ports (22, 80, 443, 8080, 3000, etc.)
- Identifies vendor from MAC OUI
- Infers CI type (router, server, IoT, etc.)
- Creates/updates CIs automatically
- Logs all changes to the audit trail

> **Note:** nmap requires `NET_RAW` + `NET_ADMIN` capabilities in Docker, which are granted in `docker-compose.yml`.

---

## 👥 User Roles

| Role | Permissions |
|---|---|
| **Admin** | Full access: manage users, settings, all CIs |
| **Operator** | Create/edit/delete CIs, run discovery |
| **Viewer** | Read-only access to all data |

---

## 🗺️ CI Types

`server` · `router` · `switch` · `access_point` · `firewall` · `nas` · `vm` · `container` · `service` · `database` · `desktop` · `laptop` · `mobile` · `iot` · `printer` · `other`

## 🔗 Relationship Types

`depends_on` · `connects_to` · `hosted_on` · `runs_on` · `part_of` · `backs_up_to` · `replicates_to` · `monitors`

---

## 📜 License

MIT — see [LICENSE](LICENSE)

---

<p align="center">Built with ❤️ for home lab enthusiasts</p>

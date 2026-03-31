"""Discovery CMDB - FastAPI Backend."""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_swagger_ui_html, get_redoc_html
from fastapi.openapi.utils import get_openapi
from fastapi.responses import HTMLResponse

from app.config import settings
from app.database import engine, Base, SessionLocal

logger = logging.getLogger(__name__)

# ---- Lifespan (startup / shutdown) ----

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: create DB tables, start background scheduler."""
    logger.info("Starting Discovery CMDB backend...")

    # Create all tables
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables ready")

    # Start APScheduler
    from apscheduler.schedulers.background import BackgroundScheduler
    from app.services.monitoring import MonitoringService
    from app.services.discovery import DiscoveryService

    scheduler = BackgroundScheduler()

    def run_health_checks():
        db = SessionLocal()
        try:
            MonitoringService.run_health_checks(db)
        finally:
            db.close()

    def run_auto_discovery():
        db = SessionLocal()
        try:
            from app.api.v1.endpoints.setup import get_setting, is_setup_completed
            if not is_setup_completed(db):
                return
            auto = get_setting(db, "auto_discovery_enabled", "false") == "true"
            if not auto:
                return
            network_range = get_setting(db, "network_range", settings.NETWORK_RANGE)
            DiscoveryService.scan_network(network_range, db)
        finally:
            db.close()

    def run_fritz_netdev_sync():
        db = SessionLocal()
        try:
            from app.services.fritzbox import FritzBoxService
            fritz = FritzBoxService.from_settings(db)
            if not fritz.enabled or not fritz.host:
                return
            result = fritz.sync_netdev(db)
            logger.info(f"Scheduled Fritz!Box netdev sync: {result}")
        except Exception as exc:
            logger.error(f"Scheduled Fritz!Box netdev sync failed: {exc}")
        finally:
            db.close()

    scheduler.add_job(
        run_health_checks,
        "interval",
        minutes=settings.HEALTH_CHECK_INTERVAL_MINUTES,
        id="health_checks",
        replace_existing=True,
    )
    scheduler.add_job(
        run_auto_discovery,
        "interval",
        minutes=settings.DISCOVERY_INTERVAL_MINUTES,
        id="auto_discovery",
        replace_existing=True,
    )
    scheduler.add_job(
        run_fritz_netdev_sync,
        "interval",
        minutes=15,
        id="fritz_netdev_sync",
        replace_existing=True,
    )
    scheduler.start()
    app.state.scheduler = scheduler
    logger.info(
        f"Scheduler started: health checks every {settings.HEALTH_CHECK_INTERVAL_MINUTES}m, "
        f"discovery every {settings.DISCOVERY_INTERVAL_MINUTES}m, "
        f"fritz netdev sync every 15m"
    )

    yield

    scheduler.shutdown()
    logger.info("Scheduler stopped")


# ---- App ----

app = FastAPI(
    title="Discovery CMDB",
    description="""
## Discovery CMDB API

A **Configuration Management Database** for home networks with automatic discovery,
dependency mapping, network topology visualization, and ServiceNow integration.

### Features
- **CI Management** — Full CRUD for Configuration Items with flexible properties
- **Auto-Discovery** — nmap-based network scanning with scheduled and on-demand scans
- **Health Monitoring** — Scheduled ping & port checks for all networked CIs
- **Network Topology** — Graph data for interactive topology visualization
- **Dependency Mapping** — Upstream/downstream dependency trees
- **Audit Logging** — Every change is tracked with actor, timestamp, and diff
- **ServiceNow Integration** — Bidirectional sync + Table API compatibility layer
- **User Management** — Role-based access control (admin / operator / viewer)

### Authentication
Use **Bearer token** (JWT) or **API Key** in the `Authorization` header:
```
Authorization: Bearer <token>
Authorization: Bearer cmdb_<api_key>
```

### ServiceNow Compatibility
A ServiceNow Table API-compatible endpoint is available at `/api/now/table/{table_name}`.
Supported tables: `cmdb_ci`, `cmdb_ci_server`, `cmdb_ci_hardware`, `cmdb_ci_network_adapter`, `cmdb_rel_ci`
    """,
    version="1.0.0",
    contact={"name": "Discovery CMDB", "url": "https://github.com/simonex3/discovery-cmdb"},
    license_info={"name": "MIT"},
    lifespan=lifespan,
    docs_url=None,   # Custom docs below
    redoc_url=None,
    openapi_tags=[
        {"name": "Setup Wizard", "description": "First-run setup and configuration wizard"},
        {"name": "Authentication", "description": "Login, token management, user profile"},
        {"name": "User Management", "description": "Admin: CRUD for users and roles"},
        {"name": "Application Settings", "description": "Admin: App-wide settings management"},
        {"name": "Configuration Items", "description": "Core CMDB: manage all CIs (servers, devices, services, ...)"},
        {"name": "Relationships", "description": "CI relationships and dependency mapping"},
        {"name": "Topology", "description": "Network topology data for graph visualization"},
        {"name": "Discovery", "description": "Automated network scanning and host discovery"},
        {"name": "Health Monitoring", "description": "Ping and port-check health status for CIs"},
        {"name": "Audit Log", "description": "Full audit trail of all CMDB changes"},
        {"name": "Dashboard Statistics", "description": "Aggregated stats for the dashboard"},
        {"name": "Import / Export", "description": "Bulk import/export in JSON and CSV formats"},
        {"name": "ServiceNow Integration", "description": "Sync configuration and status with ServiceNow"},
        {"name": "ServiceNow Table API", "description": "ServiceNow-compatible Table API (cmdb_ci, cmdb_rel_ci, ...)"},
        {"name": "System", "description": "Health check and system info"},
    ],
)

# ---- CORS ----
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if settings.CORS_ORIGINS == ["*"] else settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---- Routers ----
from app.api.v1.router import router as v1_router
app.include_router(v1_router, prefix="/api/v1")

try:
    from app.api.servicenow_compat import router as sn_router
    app.include_router(sn_router)
except ImportError:
    pass

# ---- Custom Swagger UI (dark themed) ----

@app.get("/docs", include_in_schema=False)
async def custom_swagger():
    return get_swagger_ui_html(
        openapi_url="/openapi.json",
        title="Discovery CMDB — API Docs",
        swagger_css_url="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.17.14/swagger-ui.min.css",
        swagger_js_url="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.17.14/swagger-ui-bundle.min.js",
        swagger_favicon_url="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🖧</text></svg>",
        init_oauth={},
        oauth2_redirect_url=None,
        swagger_ui_parameters={
            "deepLinking": True,
            "persistAuthorization": True,
            "displayRequestDuration": True,
            "filter": True,
            "syntaxHighlight.theme": "monokai",
            "tryItOutEnabled": True,
        },
    )


@app.get("/redoc", include_in_schema=False)
async def redoc():
    return get_redoc_html(
        openapi_url="/openapi.json",
        title="Discovery CMDB — API Reference",
    )


# ---- System endpoints ----

@app.get("/api/health", tags=["System"], summary="Health check")
async def health():
    """Returns backend health status and version."""
    return {"status": "ok", "version": "1.0.0", "service": "discovery-cmdb-backend"}


@app.get("/", include_in_schema=False)
async def root():
    return {"message": "Discovery CMDB API", "docs": "/docs", "redoc": "/redoc"}

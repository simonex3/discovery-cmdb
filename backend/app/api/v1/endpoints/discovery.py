"""Network discovery endpoints."""
import asyncio
import threading
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from app.database import get_db, SessionLocal
from app.services.discovery import DiscoveryService, DISCOVERY_STATE
from app.services.auth import require_user, require_operator
from app.models.user import User

router = APIRouter(prefix="/discovery", tags=["Discovery"])


def _run_scan_in_thread(cidr: str, actor: str):
    db = SessionLocal()
    try:
        DiscoveryService.scan_network(cidr, db, actor=actor)
    finally:
        db.close()


@router.post(
    "/scan",
    summary="Trigger network scan",
    description="Start an nmap-based network discovery scan for the given CIDR range. Runs in background.",
)
def trigger_scan(
    cidr: str = "192.168.178.0/24",
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_operator),
):
    if DISCOVERY_STATE.get("running"):
        raise HTTPException(status_code=409, detail="A discovery scan is already running")

    DISCOVERY_STATE["running"] = True
    DISCOVERY_STATE["cidr"] = cidr
    DISCOVERY_STATE["actor"] = user.username

    t = threading.Thread(target=_run_scan_in_thread, args=(cidr, user.username), daemon=True)
    t.start()

    return {"message": f"Discovery scan started for {cidr}", "status": "running"}


@router.get(
    "/status",
    summary="Get discovery status",
    description="Returns the current state of the network discovery scan.",
)
def get_discovery_status(_: User = Depends(require_user)):
    return DISCOVERY_STATE


@router.get(
    "/settings",
    summary="Get discovery settings",
    description="Returns current discovery configuration from app settings.",
)
def get_discovery_settings(db: Session = Depends(get_db), _: User = Depends(require_user)):
    from app.api.v1.endpoints.setup import get_setting
    return {
        "network_range": get_setting(db, "network_range", "192.168.178.0/24"),
        "auto_discovery_enabled": get_setting(db, "auto_discovery_enabled", "false") == "true",
        "discovery_interval_minutes": int(get_setting(db, "discovery_interval_minutes", "60") or 60),
        "health_check_interval_minutes": int(get_setting(db, "health_check_interval_minutes", "5") or 5),
    }


@router.put(
    "/settings",
    summary="Update discovery settings",
)
def update_discovery_settings(
    network_range: Optional[str] = None,
    auto_discovery_enabled: Optional[bool] = None,
    discovery_interval_minutes: Optional[int] = None,
    health_check_interval_minutes: Optional[int] = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_operator),
):
    from app.api.v1.endpoints.setup import set_setting
    if network_range:
        set_setting(db, "network_range", network_range)
    if auto_discovery_enabled is not None:
        set_setting(db, "auto_discovery_enabled", str(auto_discovery_enabled).lower())
    if discovery_interval_minutes:
        set_setting(db, "discovery_interval_minutes", str(discovery_interval_minutes))
    if health_check_interval_minutes:
        set_setting(db, "health_check_interval_minutes", str(health_check_interval_minutes))
    return {"message": "Settings updated"}

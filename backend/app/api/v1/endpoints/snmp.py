"""SNMP Discovery endpoint."""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.ci import ConfigurationItem
from app.models.audit import AuditLog
from app.models.user import User
from app.services.auth import require_operator, require_user

router = APIRouter(prefix="/snmp", tags=["SNMP Discovery"])

# Global state for SNMP scan
SNMP_STATE: dict = {
    "running": False,
    "result": None,
    "error": None,
    "found": 0,
}


def _run_snmp_scan(cidr: str, community: str, db: Session):
    from app.services.snmp import scan_subnet_snmp
    from app.database import SessionLocal
    SNMP_STATE["running"] = True
    SNMP_STATE["error"] = None
    SNMP_STATE["result"] = None
    SNMP_STATE["found"] = 0

    # Use a new DB session since this runs in a background thread
    db2 = SessionLocal()
    try:
        devices = scan_subnet_snmp(cidr, community=community)
        created = 0
        updated = 0
        for dev in devices:
            ip = dev.get("ip_address", "")
            if not ip:
                continue
            existing = db2.query(ConfigurationItem).filter(ConfigurationItem.ip_address == ip).first()
            if existing:
                # Update SNMP-discovered fields
                if dev.get("hostname") and not existing.hostname:
                    existing.hostname = dev["hostname"]
                if dev.get("description") and not existing.description:
                    existing.description = dev["description"]
                db2.add(AuditLog(
                    ci_id=existing.id,
                    action="updated",
                    actor="snmp",
                    description=f"SNMP update: {dev.get('description', '')[:100]}",
                ))
                updated += 1
            else:
                ci = ConfigurationItem(
                    name=dev.get("name") or ip,
                    hostname=dev.get("hostname"),
                    ip_address=ip,
                    ci_type=dev.get("ci_type", "network_device"),
                    status="active",
                    description=dev.get("description", ""),
                    location=dev.get("location", ""),
                    owner=dev.get("contact", ""),
                    properties={"snmp_community": community, "snmp_discovered": True},
                )
                db2.add(ci)
                db2.flush()
                db2.add(AuditLog(
                    ci_id=ci.id,
                    action="discovered",
                    actor="snmp",
                    description=f"Discovered via SNMP: {dev.get('description', '')[:100]}",
                ))
                created += 1

        db2.commit()
        SNMP_STATE["found"] = len(devices)
        SNMP_STATE["result"] = {
            "devices_found": len(devices),
            "created": created,
            "updated": updated,
        }
    except Exception as e:
        SNMP_STATE["error"] = str(e)
        db2.rollback()
    finally:
        SNMP_STATE["running"] = False
        db2.close()


@router.post("/scan", summary="Start SNMP scan")
def start_snmp_scan(
    cidr: str,
    community: str = "public",
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_operator),
):
    if SNMP_STATE["running"]:
        raise HTTPException(status_code=409, detail="SNMP scan already running")
    background_tasks.add_task(_run_snmp_scan, cidr, community, db)
    return {"message": f"SNMP scan started for {cidr}", "community": community}


@router.get("/scan/status", summary="SNMP scan status")
def snmp_scan_status(_: User = Depends(require_user)):
    return SNMP_STATE


@router.get("/probe/{ip}", summary="SNMP probe a single host")
def snmp_probe_host(
    ip: str,
    community: str = "public",
    _: User = Depends(require_user),
):
    from app.services.snmp import snmp_probe
    result = snmp_probe(ip, community=community)
    if not result:
        raise HTTPException(status_code=404, detail="Host not reachable via SNMP")
    return result

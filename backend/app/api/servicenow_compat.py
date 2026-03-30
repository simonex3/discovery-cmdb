"""ServiceNow Table API compatibility layer.

Implements: GET/POST/PUT/DELETE /api/now/table/{table_name}[/{sys_id}]
Tables: cmdb_ci, cmdb_ci_server, cmdb_ci_hardware, cmdb_ci_network_adapter, cmdb_rel_ci
"""
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.ci import ConfigurationItem
from app.models.relationship import Relationship
from app.models.audit import AuditLog

router = APIRouter(prefix="/api/now", tags=["ServiceNow Table API"])

CI_TABLES = {"cmdb_ci", "cmdb_ci_server", "cmdb_ci_hardware", "cmdb_ci_network_adapter",
             "cmdb_ci_computer", "cmdb_ci_linux_server", "cmdb_ci_win_server"}

TABLE_TYPE_MAP = {
    "cmdb_ci_server": "server", "cmdb_ci_linux_server": "server", "cmdb_ci_win_server": "server",
    "cmdb_ci_hardware": "server", "cmdb_ci_network_adapter": "router", "cmdb_ci_computer": "desktop",
}


def _ci_to_sn(ci: ConfigurationItem) -> dict:
    return {
        "sys_id": ci.servicenow_sys_id or str(ci.id),
        "name": ci.name,
        "ip_address": ci.ip_address or "",
        "mac_address": ci.mac_address or "",
        "fqdn": ci.fqdn or "",
        "manufacturer": ci.manufacturer or "",
        "model_id": {"value": ci.model_name or ""},
        "os": ci.os or "",
        "short_description": ci.description or "",
        "operational_status": "1" if ci.status == "active" else "2",
        "sys_class_name": "cmdb_ci_server" if ci.ci_type == "server" else "cmdb_ci",
        "u_environment": ci.environment,
        "u_health_status": ci.health_status,
        "sys_created_on": ci.created_at.isoformat() if ci.created_at else "",
        "sys_updated_on": ci.updated_at.isoformat() if ci.updated_at else "",
    }


def _apply_sn_query(q, sysparm_query: Optional[str]):
    """Very basic sysparm_query parser: field=value^field2=value2."""
    if not sysparm_query:
        return q
    for clause in sysparm_query.split("^"):
        if "=" in clause:
            field, value = clause.split("=", 1)
            field = field.strip()
            value = value.strip()
            if field == "ip_address":
                q = q.filter(ConfigurationItem.ip_address == value)
            elif field == "name":
                q = q.filter(ConfigurationItem.name == value)
            elif field == "operational_status":
                status = "active" if value == "1" else "inactive"
                q = q.filter(ConfigurationItem.status == status)
    return q


@router.get("/table/{table_name}", summary="ServiceNow Table API — Query records")
def sn_query(
    table_name: str,
    sysparm_query: Optional[str] = Query(None),
    sysparm_limit: int = Query(100, le=10000),
    sysparm_offset: int = Query(0),
    sysparm_fields: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    if table_name == "cmdb_rel_ci":
        rels = db.query(Relationship).offset(sysparm_offset).limit(sysparm_limit).all()
        result = [
            {
                "sys_id": str(r.id),
                "parent": {"value": str(r.source_id)},
                "child": {"value": str(r.target_id)},
                "type": {"display_value": r.relationship_type},
            }
            for r in rels
        ]
        return {"result": result}

    if table_name not in CI_TABLES and table_name != "cmdb_ci":
        return {"result": [], "x_warning": f"Table {table_name} not supported"}

    ci_type_filter = TABLE_TYPE_MAP.get(table_name)
    q = db.query(ConfigurationItem)
    if ci_type_filter:
        q = q.filter(ConfigurationItem.ci_type == ci_type_filter)
    q = _apply_sn_query(q, sysparm_query)
    total = q.count()
    items = q.offset(sysparm_offset).limit(sysparm_limit).all()

    return {
        "result": [_ci_to_sn(ci) for ci in items],
        "x-total-count": total,
    }


@router.post("/table/{table_name}", summary="ServiceNow Table API — Create record", status_code=201)
async def sn_create(table_name: str, request: Request, db: Session = Depends(get_db)):
    body = await request.json()
    ci_type = TABLE_TYPE_MAP.get(table_name, "other")
    ci = ConfigurationItem(
        name=body.get("name", "Unnamed"),
        ci_type=ci_type,
        ip_address=body.get("ip_address") or None,
        mac_address=body.get("mac_address") or None,
        manufacturer=body.get("manufacturer") or None,
        os=body.get("os") or None,
        description=body.get("short_description") or None,
        status="active" if body.get("operational_status", "1") == "1" else "inactive",
    )
    db.add(ci)
    db.flush()
    ci.servicenow_sys_id = body.get("sys_id") or str(ci.id)
    db.add(AuditLog(ci_id=ci.id, action="imported", actor="servicenow", description="Created via ServiceNow Table API"))
    db.commit()
    db.refresh(ci)
    return {"result": _ci_to_sn(ci)}


@router.get("/table/{table_name}/{sys_id}", summary="ServiceNow Table API — Get record")
def sn_get(table_name: str, sys_id: str, db: Session = Depends(get_db)):
    ci = db.query(ConfigurationItem).filter(
        (ConfigurationItem.servicenow_sys_id == sys_id) |
        (ConfigurationItem.id == _safe_uuid(sys_id))
    ).first()
    if not ci:
        raise HTTPException(status_code=404, detail={"error": {"message": "No record found", "detail": "GlideRecord is empty"}})
    return {"result": _ci_to_sn(ci)}


@router.put("/table/{table_name}/{sys_id}", summary="ServiceNow Table API — Update record")
async def sn_update(table_name: str, sys_id: str, request: Request, db: Session = Depends(get_db)):
    ci = db.query(ConfigurationItem).filter(
        (ConfigurationItem.servicenow_sys_id == sys_id) |
        (ConfigurationItem.id == _safe_uuid(sys_id))
    ).first()
    if not ci:
        raise HTTPException(status_code=404, detail={"error": {"message": "Record not found"}})
    body = await request.json()
    if "name" in body:
        ci.name = body["name"]
    if "ip_address" in body:
        ci.ip_address = body["ip_address"] or None
    if "os" in body:
        ci.os = body["os"] or None
    db.add(AuditLog(ci_id=ci.id, action="synced", actor="servicenow", description="Updated via ServiceNow Table API"))
    db.commit()
    db.refresh(ci)
    return {"result": _ci_to_sn(ci)}


@router.delete("/table/{table_name}/{sys_id}", summary="ServiceNow Table API — Delete record", status_code=204)
def sn_delete(table_name: str, sys_id: str, db: Session = Depends(get_db)):
    ci = db.query(ConfigurationItem).filter(
        (ConfigurationItem.servicenow_sys_id == sys_id) |
        (ConfigurationItem.id == _safe_uuid(sys_id))
    ).first()
    if not ci:
        raise HTTPException(status_code=404, detail={"error": {"message": "Record not found"}})
    db.delete(ci)
    db.commit()


def _safe_uuid(val: str):
    try:
        return uuid.UUID(val)
    except Exception:
        return None

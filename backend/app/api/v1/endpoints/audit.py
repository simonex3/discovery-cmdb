"""Audit log endpoint."""
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import desc
from app.database import get_db
from app.models.audit import AuditLog
from app.models.ci import ConfigurationItem
from app.services.auth import require_user
from app.models.user import User

router = APIRouter(prefix="/audit", tags=["Audit Log"])


@router.get("", summary="Get audit log", description="Returns paginated audit log with optional filters.")
def get_audit_log(
    ci_id: Optional[uuid.UUID] = Query(None, description="Filter by CI"),
    action: Optional[str] = Query(None, description="Filter by action type"),
    actor: Optional[str] = Query(None, description="Filter by actor"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
    _: User = Depends(require_user),
):
    q = db.query(AuditLog).options(joinedload(AuditLog.ci))
    if ci_id:
        q = q.filter(AuditLog.ci_id == ci_id)
    if action:
        q = q.filter(AuditLog.action == action)
    if actor:
        q = q.filter(AuditLog.actor.ilike(f"%{actor}%"))

    total = q.count()
    logs = q.order_by(desc(AuditLog.timestamp)).offset((page - 1) * page_size).limit(page_size).all()

    items = []
    for log in logs:
        items.append({
            "id": str(log.id),
            "ci_id": str(log.ci_id) if log.ci_id else None,
            "ci_name": log.ci.name if log.ci else None,
            "action": log.action,
            "actor": log.actor,
            "description": log.description,
            "changes": log.changes,
            "timestamp": log.timestamp.isoformat() if log.timestamp else None,
        })

    return {"items": items, "total": total, "page": page, "page_size": page_size}

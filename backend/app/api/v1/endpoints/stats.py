"""Dashboard statistics endpoint."""
from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.ci import ConfigurationItem
from app.models.audit import AuditLog
from app.services.auth import require_user
from app.models.user import User

router = APIRouter(prefix="/stats", tags=["Dashboard Statistics"])


@router.get("", summary="Dashboard statistics", description="Returns aggregated statistics for the CMDB dashboard.")
def get_stats(db: Session = Depends(get_db), _: User = Depends(require_user)):
    total = db.query(func.count(ConfigurationItem.id)).scalar()

    by_type = {}
    for row in db.query(ConfigurationItem.ci_type, func.count(ConfigurationItem.id)).group_by(ConfigurationItem.ci_type).all():
        by_type[row[0] or "other"] = row[1]

    by_status = {}
    for row in db.query(ConfigurationItem.status, func.count(ConfigurationItem.id)).group_by(ConfigurationItem.status).all():
        by_status[row[0] or "unknown"] = row[1]

    by_health = {}
    for row in db.query(ConfigurationItem.health_status, func.count(ConfigurationItem.id)).group_by(ConfigurationItem.health_status).all():
        by_health[row[0] or "unknown"] = row[1]

    by_environment = {}
    for row in db.query(ConfigurationItem.environment, func.count(ConfigurationItem.id)).group_by(ConfigurationItem.environment).all():
        by_environment[row[0] or "unknown"] = row[1]

    recent_logs = (
        db.query(AuditLog)
        .order_by(AuditLog.timestamp.desc())
        .limit(20)
        .all()
    )
    recent_changes = [
        {
            "id": str(log.id),
            "ci_id": str(log.ci_id) if log.ci_id else None,
            "action": log.action,
            "actor": log.actor,
            "description": log.description,
            "timestamp": log.timestamp.isoformat() if log.timestamp else None,
        }
        for log in recent_logs
    ]

    # Down / degraded CIs for alert list
    issues = db.query(ConfigurationItem).filter(
        ConfigurationItem.health_status.in_(["down", "degraded"])
    ).limit(10).all()
    issue_list = [
        {"id": str(ci.id), "name": ci.name, "ip_address": ci.ip_address, "health_status": ci.health_status, "ci_type": ci.ci_type}
        for ci in issues
    ]

    return {
        "total_cis": total,
        "by_type": by_type,
        "by_status": by_status,
        "by_health": by_health,
        "by_environment": by_environment,
        "recent_changes": recent_changes,
        "issues": issue_list,
    }

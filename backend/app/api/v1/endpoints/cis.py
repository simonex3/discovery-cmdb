"""Configuration Items CRUD + dependency tree + import/export."""
import csv
import io
import json
import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_, and_, func

from app.database import get_db
from app.models.ci import ConfigurationItem
from app.models.audit import AuditLog
from app.models.relationship import Relationship
from app.schemas.ci import CICreate, CIUpdate, CIResponse, CIPaginatedResponse, DependencyTree, DependencyNode
from app.services.auth import require_user, require_operator
from app.models.user import User

router = APIRouter(prefix="/cis", tags=["Configuration Items"])


def _log(db: Session, ci_id, action: str, description: str, changes=None, actor: str = "system"):
    db.add(AuditLog(ci_id=ci_id, action=action, actor=actor, description=description, changes=changes))


@router.get(
    "",
    response_model=CIPaginatedResponse,
    summary="List all CIs",
    description="Returns paginated CIs with optional search and filters.",
)
def list_cis(
    search: Optional[str] = Query(None, description="Search by name, hostname, IP or description"),
    ci_type: Optional[str] = Query(None, description="Filter by CI type"),
    status: Optional[str] = Query(None, description="Filter by status"),
    health_status: Optional[str] = Query(None, description="Filter by health status"),
    environment: Optional[str] = Query(None, description="Filter by environment"),
    tag: Optional[str] = Query(None, description="Filter by tag"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    db: Session = Depends(get_db),
    _: User = Depends(require_user),
):
    q = db.query(ConfigurationItem)
    if search:
        q = q.filter(or_(
            ConfigurationItem.name.ilike(f"%{search}%"),
            ConfigurationItem.hostname.ilike(f"%{search}%"),
            ConfigurationItem.ip_address.ilike(f"%{search}%"),
            ConfigurationItem.description.ilike(f"%{search}%"),
        ))
    if ci_type:
        q = q.filter(ConfigurationItem.ci_type == ci_type)
    if status:
        q = q.filter(ConfigurationItem.status == status)
    if health_status:
        q = q.filter(ConfigurationItem.health_status == health_status)
    if environment:
        q = q.filter(ConfigurationItem.environment == environment)
    if tag:
        q = q.filter(ConfigurationItem.tags.contains([tag]))

    total = q.count()
    items = q.order_by(ConfigurationItem.name).offset((page - 1) * page_size).limit(page_size).all()
    return CIPaginatedResponse(
        items=[CIResponse.model_validate(ci) for ci in items],
        total=total,
        page=page,
        page_size=page_size,
        pages=max(1, (total + page_size - 1) // page_size),
    )


@router.post(
    "",
    response_model=CIResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create CI",
)
def create_ci(data: CICreate, db: Session = Depends(get_db), user: User = Depends(require_operator)):
    ci = ConfigurationItem(**data.model_dump())
    db.add(ci)
    db.flush()
    _log(db, ci.id, "created", f"CI '{ci.name}' created", actor=user.username)
    db.commit()
    db.refresh(ci)
    return ci


@router.get(
    "/export",
    summary="Export CIs",
    description="Export all CIs as JSON or CSV.",
    tags=["Import / Export"],
)
def export_cis(
    format: str = Query("json", description="Export format: json or csv"),
    db: Session = Depends(get_db),
    _: User = Depends(require_user),
):
    items = db.query(ConfigurationItem).all()
    _log(db, None, "exported", f"Exported {len(items)} CIs as {format}")
    db.commit()

    if format == "csv":
        output = io.StringIO()
        fields = ["id", "name", "ci_type", "category", "status", "ip_address", "mac_address",
                  "hostname", "os", "environment", "location", "owner", "health_status", "created_at"]
        writer = csv.DictWriter(output, fieldnames=fields)
        writer.writeheader()
        for ci in items:
            writer.writerow({f: str(getattr(ci, f, "")) for f in fields})
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=cmdb_export.csv"},
        )

    data = [CIResponse.model_validate(ci).model_dump(mode="json") for ci in items]
    return StreamingResponse(
        iter([json.dumps(data, indent=2, default=str)]),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=cmdb_export.json"},
    )


@router.post(
    "/import",
    summary="Import CIs from JSON or CSV",
    tags=["Import / Export"],
)
def import_cis(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_operator),
):
    content = file.file.read().decode("utf-8")
    created = 0
    updated = 0
    errors = []

    if file.filename.endswith(".json"):
        try:
            records = json.loads(content)
        except json.JSONDecodeError as e:
            raise HTTPException(status_code=400, detail=f"Invalid JSON: {e}")
    else:
        reader = csv.DictReader(io.StringIO(content))
        records = list(reader)

    for rec in records:
        try:
            ci_id = rec.get("id")
            existing = None
            if ci_id:
                try:
                    existing = db.query(ConfigurationItem).filter(ConfigurationItem.id == uuid.UUID(str(ci_id))).first()
                except Exception:
                    pass

            if not rec.get("name"):
                errors.append(f"Skipping record without name: {rec}")
                continue

            if existing:
                for k, v in rec.items():
                    if k not in ("id", "created_at", "updated_at") and hasattr(existing, k) and v is not None and v != "":
                        setattr(existing, k, v)
                updated += 1
            else:
                ci = ConfigurationItem(
                    name=rec["name"],
                    ci_type=rec.get("ci_type", "other"),
                    status=rec.get("status", "active"),
                    ip_address=rec.get("ip_address"),
                    hostname=rec.get("hostname"),
                    environment=rec.get("environment", "production"),
                )
                db.add(ci)
                created += 1
        except Exception as e:
            errors.append(str(e))

    _log(db, None, "imported", f"Import: {created} created, {updated} updated, {len(errors)} errors", actor=user.username)
    db.commit()
    return {"created": created, "updated": updated, "errors": errors}


@router.post(
    "/reclassify",
    summary="Reclassify all CIs",
    description="Re-infers ci_type for all non-retired CIs based on current host data and updates changed ones.",
    tags=["Configuration Items"],
)
def reclassify_cis(db: Session = Depends(get_db), user: User = Depends(require_operator)):
    from app.services.discovery import _infer_ci_type
    cis = db.query(ConfigurationItem).filter(ConfigurationItem.status != "retired").all()
    total = len(cis)
    reclassified = 0
    for ci in cis:
        host = {
            "ip": ci.ip_address,
            "hostname": ci.hostname,
            "vendor": ci.manufacturer if hasattr(ci, "manufacturer") else None,
            "osmatch": [{"name": ci.os}] if ci.os else [],
            "ports": [{"portid": str(p["port"])} for p in (ci.open_ports or [])] if ci.open_ports else [],
        }
        inferred = _infer_ci_type(host)
        if inferred != ci.ci_type:
            old_type = ci.ci_type
            ci.ci_type = inferred
            _log(
                db, ci.id, "reclassified",
                f"CI '{ci.name}' reclassified from '{old_type}' to '{inferred}'",
                changes={"ci_type": {"old": old_type, "new": inferred}},
                actor=user.username,
            )
            reclassified += 1
    db.commit()
    return {"reclassified": reclassified, "total": total}


@router.get(
    "/{ci_id}",
    response_model=CIResponse,
    summary="Get CI by ID",
)
def get_ci(ci_id: uuid.UUID, db: Session = Depends(get_db), _: User = Depends(require_user)):
    ci = db.query(ConfigurationItem).filter(ConfigurationItem.id == ci_id).first()
    if not ci:
        raise HTTPException(status_code=404, detail="CI not found")
    return ci


@router.put(
    "/{ci_id}",
    response_model=CIResponse,
    summary="Update CI",
)
def update_ci(
    ci_id: uuid.UUID,
    data: CIUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_operator),
):
    ci = db.query(ConfigurationItem).filter(ConfigurationItem.id == ci_id).first()
    if not ci:
        raise HTTPException(status_code=404, detail="CI not found")

    changes = {}
    update_data = data.model_dump(exclude_unset=True)
    for field, new_val in update_data.items():
        old_val = getattr(ci, field)
        if old_val != new_val:
            changes[field] = {"old": old_val, "new": new_val}
            setattr(ci, field, new_val)

    if changes:
        _log(db, ci.id, "updated", f"CI '{ci.name}' updated", changes=changes, actor=user.username)

    db.commit()
    db.refresh(ci)
    return ci


@router.delete(
    "/{ci_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete CI",
)
def delete_ci(ci_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(require_operator)):
    ci = db.query(ConfigurationItem).filter(ConfigurationItem.id == ci_id).first()
    if not ci:
        raise HTTPException(status_code=404, detail="CI not found")
    name = ci.name
    db.delete(ci)
    db.add(AuditLog(ci_id=None, action="deleted", actor=user.username, description=f"CI '{name}' deleted"))
    db.commit()


@router.get(
    "/{ci_id}/relationships",
    summary="Get CI relationships",
    description="Returns all relationships where this CI is source or target.",
)
def get_ci_relationships(ci_id: uuid.UUID, db: Session = Depends(get_db), _: User = Depends(require_user)):
    ci = db.query(ConfigurationItem).filter(ConfigurationItem.id == ci_id).first()
    if not ci:
        raise HTTPException(status_code=404, detail="CI not found")
    from app.schemas.relationship import RelationshipResponse
    rels = (
        db.query(Relationship)
        .options(joinedload(Relationship.source), joinedload(Relationship.target))
        .filter(or_(Relationship.source_id == ci_id, Relationship.target_id == ci_id))
        .all()
    )
    return [RelationshipResponse.model_validate(r) for r in rels]


@router.get(
    "/{ci_id}/dependencies",
    response_model=DependencyTree,
    summary="Get dependency tree",
    description="Returns upstream and downstream dependencies for a CI.",
)
def get_dependencies(ci_id: uuid.UUID, db: Session = Depends(get_db), _: User = Depends(require_user)):
    ci = db.query(ConfigurationItem).filter(ConfigurationItem.id == ci_id).first()
    if not ci:
        raise HTTPException(status_code=404, detail="CI not found")

    rels = (
        db.query(Relationship)
        .options(joinedload(Relationship.source), joinedload(Relationship.target))
        .filter(or_(Relationship.source_id == ci_id, Relationship.target_id == ci_id))
        .all()
    )

    upstream = []
    downstream = []
    for r in rels:
        if r.source_id == ci_id:
            # ci → target: ci depends on / connects to target (downstream from ci perspective)
            downstream.append(DependencyNode(
                ci=CIResponse.model_validate(r.target),
                relationship_type=r.relationship_type,
                direction="downstream",
            ))
        else:
            # source → ci: source depends on ci (upstream)
            upstream.append(DependencyNode(
                ci=CIResponse.model_validate(r.source),
                relationship_type=r.relationship_type,
                direction="upstream",
            ))

    return DependencyTree(ci=CIResponse.model_validate(ci), upstream=upstream, downstream=downstream)

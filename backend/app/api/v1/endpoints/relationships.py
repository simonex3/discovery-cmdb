"""Relationship CRUD endpoints."""
import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from app.database import get_db
from app.models.relationship import Relationship
from app.models.ci import ConfigurationItem
from app.schemas.relationship import RelationshipCreate, RelationshipUpdate, RelationshipResponse
from app.services.auth import require_user, require_operator
from app.models.user import User

router = APIRouter(prefix="/relationships", tags=["Relationships"])


@router.get("", response_model=List[RelationshipResponse], summary="List relationships")
def list_relationships(
    ci_id: uuid.UUID = Query(None, description="Filter by CI (source or target)"),
    relationship_type: str = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_user),
):
    from sqlalchemy import or_
    q = db.query(Relationship).options(joinedload(Relationship.source), joinedload(Relationship.target))
    if ci_id:
        q = q.filter(or_(Relationship.source_id == ci_id, Relationship.target_id == ci_id))
    if relationship_type:
        q = q.filter(Relationship.relationship_type == relationship_type)
    return q.all()


@router.post("", response_model=RelationshipResponse, status_code=status.HTTP_201_CREATED, summary="Create relationship")
def create_relationship(data: RelationshipCreate, db: Session = Depends(get_db), _: User = Depends(require_operator)):
    # Validate CIs exist
    if not db.query(ConfigurationItem).filter(ConfigurationItem.id == data.source_id).first():
        raise HTTPException(status_code=404, detail="Source CI not found")
    if not db.query(ConfigurationItem).filter(ConfigurationItem.id == data.target_id).first():
        raise HTTPException(status_code=404, detail="Target CI not found")
    # Prevent duplicate
    existing = db.query(Relationship).filter(
        Relationship.source_id == data.source_id,
        Relationship.target_id == data.target_id,
        Relationship.relationship_type == data.relationship_type,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Relationship already exists")

    rel = Relationship(**data.model_dump())
    db.add(rel)
    db.commit()
    db.refresh(rel)
    return db.query(Relationship).options(joinedload(Relationship.source), joinedload(Relationship.target)).filter(Relationship.id == rel.id).first()


@router.get("/{rel_id}", response_model=RelationshipResponse, summary="Get relationship")
def get_relationship(rel_id: uuid.UUID, db: Session = Depends(get_db), _: User = Depends(require_user)):
    rel = db.query(Relationship).options(joinedload(Relationship.source), joinedload(Relationship.target)).filter(Relationship.id == rel_id).first()
    if not rel:
        raise HTTPException(status_code=404, detail="Relationship not found")
    return rel


@router.put("/{rel_id}", response_model=RelationshipResponse, summary="Update relationship")
def update_relationship(rel_id: uuid.UUID, data: RelationshipUpdate, db: Session = Depends(get_db), _: User = Depends(require_operator)):
    rel = db.query(Relationship).filter(Relationship.id == rel_id).first()
    if not rel:
        raise HTTPException(status_code=404, detail="Relationship not found")
    for field, val in data.model_dump(exclude_unset=True).items():
        setattr(rel, field, val)
    db.commit()
    return db.query(Relationship).options(joinedload(Relationship.source), joinedload(Relationship.target)).filter(Relationship.id == rel_id).first()


@router.delete("/{rel_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete relationship")
def delete_relationship(rel_id: uuid.UUID, db: Session = Depends(get_db), _: User = Depends(require_operator)):
    rel = db.query(Relationship).filter(Relationship.id == rel_id).first()
    if not rel:
        raise HTTPException(status_code=404, detail="Relationship not found")
    db.delete(rel)
    db.commit()


@router.post("/cleanup", summary="Delete all relationships except runs_on")
def cleanup_relationships(db: Session = Depends(get_db), _: User = Depends(require_operator)):
    """Delete all relationships except runs_on type."""
    q = db.query(Relationship).filter(Relationship.relationship_type != "runs_on")
    deleted = q.count()
    q.delete(synchronize_session=False)
    db.commit()
    return {"deleted": deleted, "kept": "runs_on relationships preserved"}

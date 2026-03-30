from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
import uuid


class RelationshipBase(BaseModel):
    source_id: uuid.UUID = Field(..., description="Source CI ID")
    target_id: uuid.UUID = Field(..., description="Target CI ID")
    relationship_type: str = Field(..., description="Type: depends_on|connects_to|hosted_on|runs_on|part_of|backs_up_to|replicates_to|monitors")
    description: Optional[str] = None


class RelationshipCreate(RelationshipBase):
    pass


class RelationshipUpdate(BaseModel):
    relationship_type: Optional[str] = None
    description: Optional[str] = None


class CIRef(BaseModel):
    id: uuid.UUID
    name: str
    ci_type: str
    ip_address: Optional[str]
    model_config = {"from_attributes": True}


class RelationshipResponse(RelationshipBase):
    id: uuid.UUID
    created_at: datetime
    source: Optional[CIRef] = None
    target: Optional[CIRef] = None
    model_config = {"from_attributes": True}

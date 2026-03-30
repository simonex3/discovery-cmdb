from pydantic import BaseModel
from typing import Optional, Dict, Any


class TopologyNodeData(BaseModel):
    label: str
    ci_type: str
    status: str
    health_status: str
    ip_address: Optional[str]
    environment: str
    ci_id: str


class TopologyNode(BaseModel):
    id: str
    type: str = "ciNode"
    data: TopologyNodeData
    position: Dict[str, float]


class TopologyEdgeStyle(BaseModel):
    stroke: str = "#64748b"
    strokeWidth: int = 2


class TopologyEdge(BaseModel):
    id: str
    source: str
    target: str
    label: Optional[str] = None
    animated: bool = False
    style: Optional[TopologyEdgeStyle] = None


class TopologyResponse(BaseModel):
    nodes: list[TopologyNode]
    edges: list[TopologyEdge]

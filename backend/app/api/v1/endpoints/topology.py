"""Topology endpoints — graph data for React Flow visualization."""
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.ci import ConfigurationItem
from app.models.relationship import Relationship
from app.schemas.topology import TopologyResponse, TopologyNode, TopologyEdge, TopologyNodeData, TopologyEdgeStyle
from app.services.auth import require_user
from app.models.user import User

router = APIRouter(prefix="/topology", tags=["Topology"])

EDGE_COLORS = {
    "depends_on": "#f59e0b",
    "connects_to": "#3b82f6",
    "hosted_on": "#8b5cf6",
    "runs_on": "#10b981",
    "part_of": "#6b7280",
    "backs_up_to": "#ec4899",
    "replicates_to": "#06b6d4",
    "monitors": "#f97316",
}


LAYER_ORDER = {
    "firewall": 0, "router": 0,
    "switch": 1, "access_point": 1,
    "server": 2, "nas": 2, "vm": 2, "container": 2, "database": 2, "service": 2,
    "desktop": 3, "laptop": 3, "mobile": 3, "iot": 3, "printer": 3, "other": 3,
}

NODE_W = 180
NODE_H = 80
LAYER_GAP_Y = 160
X_PADDING = 40


def _hierarchical_layout(nodes: list) -> dict:
    """Hierarchical top-down layout grouped by CI type layer."""
    layers: dict = {}
    for n in nodes:
        layer = LAYER_ORDER.get(n.ci_type, 3)
        layers.setdefault(layer, []).append(n)

    positions = {}
    # Find the widest layer to center all others
    max_count = max((len(v) for v in layers.values()), default=1)
    total_canvas_width = max_count * (NODE_W + X_PADDING)

    for layer_idx, layer_nodes in sorted(layers.items()):
        count = len(layer_nodes)
        spacing = (NODE_W + X_PADDING)
        row_width = count * spacing
        start_x = (total_canvas_width - row_width) / 2 + spacing / 2
        y = layer_idx * LAYER_GAP_Y + 50
        for i, n in enumerate(layer_nodes):
            positions[str(n.id)] = {"x": start_x + i * spacing, "y": y}

    return positions


@router.get("", response_model=TopologyResponse, summary="Get full topology", description="Returns all CIs as nodes and all relationships as edges, ready for React Flow.")
def get_topology(
    environment: Optional[str] = Query(None),
    ci_type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_user),
):
    ci_query = db.query(ConfigurationItem).filter(ConfigurationItem.status != "retired")
    if environment:
        ci_query = ci_query.filter(ConfigurationItem.environment == environment)
    if ci_type:
        ci_query = ci_query.filter(ConfigurationItem.ci_type == ci_type)
    cis = ci_query.all()

    ci_ids = {str(ci.id) for ci in cis}
    positions = _hierarchical_layout(cis)

    nodes = []
    for ci in cis:
        pos = positions.get(str(ci.id), {"x": 0, "y": 0})
        nodes.append(TopologyNode(
            id=str(ci.id),
            type="ciNode",
            data=TopologyNodeData(
                label=ci.name,
                ci_type=ci.ci_type,
                status=ci.status,
                health_status=ci.health_status,
                ip_address=ci.ip_address,
                environment=ci.environment,
                ci_id=str(ci.id),
            ),
            position=pos,
        ))

    rels = db.query(Relationship).all()
    edges = []
    for r in rels:
        src, tgt = str(r.source_id), str(r.target_id)
        if src in ci_ids and tgt in ci_ids:
            color = EDGE_COLORS.get(r.relationship_type, "#64748b")
            edges.append(TopologyEdge(
                id=str(r.id),
                source=src,
                target=tgt,
                label=r.relationship_type.replace("_", " "),
                animated=r.relationship_type in ("depends_on", "monitors"),
                style=TopologyEdgeStyle(stroke=color, strokeWidth=2),
            ))

    return TopologyResponse(nodes=nodes, edges=edges)

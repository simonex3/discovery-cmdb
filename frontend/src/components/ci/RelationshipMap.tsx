import { useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ReactFlow, Background, BackgroundVariant, MarkerType,
  useNodesState, useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import clsx from 'clsx';
import type { CI, Relationship } from '../../types';

const EDGE_COLORS: Record<string, string> = {
  depends_on:    '#f59e0b',
  connects_to:   '#3b82f6',
  hosted_on:     '#8b5cf6',
  runs_on:       '#10b981',
  part_of:       '#6b7280',
  backs_up_to:   '#ec4899',
  replicates_to: '#06b6d4',
  monitors:      '#f97316',
};

const TYPE_COLOR: Record<string, string> = {
  server: '#2563eb', router: '#059669', switch: '#0d9488', access_point: '#0891b2',
  firewall: '#dc2626', nas: '#7c3aed', vm: '#ca8a04', container: '#ea580c',
  service: '#4f46e5', database: '#db2777', desktop: '#475569', laptop: '#475569',
  mobile: '#0284c7', iot: '#4d7c0f', printer: '#57534e', other: '#475569',
};

function MapNode({ data }: any) {
  const color = TYPE_COLOR[data.ci_type] ?? '#475569';
  return (
    <div className={clsx(
      'px-3 py-2 rounded-xl border text-center transition-all cursor-pointer hover:scale-105',
      data.isCurrent
        ? 'border-blue-500/60 shadow-lg shadow-blue-500/20 ring-2 ring-blue-500/30'
        : 'border-slate-700/60 hover:border-slate-500/60',
    )}
      style={{
        background: data.isCurrent
          ? 'linear-gradient(145deg, rgba(37,99,235,0.2), rgba(15,23,42,0.95))'
          : 'linear-gradient(145deg, #0f172a, #0a0f1e)',
        minWidth: 130,
        maxWidth: 170,
      }}
    >
      {/* color bar */}
      <div className="h-0.5 rounded-full mb-2 mx-2" style={{ background: color }} />
      <div className="text-[11px] font-semibold text-slate-100 truncate">{data.label}</div>
      {data.ip && <div className="text-[9px] font-mono text-slate-500 mt-0.5">{data.ip}</div>}
      <div className="text-[9px] text-slate-600 mt-0.5 capitalize">{data.ci_type}</div>
      {data.isCurrent && (
        <div className="mt-1.5 text-[8px] font-bold text-blue-400 uppercase tracking-widest">Current</div>
      )}
    </div>
  );
}

const nodeTypes = { mapNode: MapNode };

interface Props {
  ci: CI;
  relationships: Relationship[];
}

export default function RelationshipMap({ ci, relationships }: Props) {
  const navigate = useNavigate();

  const { nodes: initNodes, edges: initEdges } = useMemo(() => {
    if (!relationships.length) return { nodes: [], edges: [] };

    const centerX = 350;
    const centerY = 180;
    const COL_W = 280;
    const ROW_H = 90;

    // Separate upstream (source → ci) and downstream (ci → target)
    const upstream = relationships.filter(r => r.target_id === ci.id);
    const downstream = relationships.filter(r => r.source_id === ci.id);

    const nodes: any[] = [
      {
        id: ci.id,
        type: 'mapNode',
        position: { x: centerX, y: centerY },
        data: { label: ci.name, ci_type: ci.ci_type, ip: ci.ip_address, isCurrent: true, ciId: ci.id },
        draggable: false,
      },
    ];
    const edges: any[] = [];

    const totalUp = upstream.length;
    const totalDown = downstream.length;
    const maxSide = Math.max(totalUp, totalDown, 1);
    const totalHeight = maxSide * ROW_H;
    const startY = centerY - totalHeight / 2 + ROW_H / 2;

    upstream.forEach((rel, i) => {
      const peer = rel.source;
      if (!peer) return;
      const y = startY + i * ROW_H;
      nodes.push({
        id: peer.id,
        type: 'mapNode',
        position: { x: centerX - COL_W, y },
        data: { label: peer.name, ci_type: peer.ci_type, ip: peer.ip_address, isCurrent: false, ciId: peer.id },
        draggable: false,
      });
      const color = EDGE_COLORS[rel.relationship_type] ?? '#64748b';
      edges.push({
        id: rel.id,
        source: peer.id,
        target: ci.id,
        label: rel.relationship_type.replace(/_/g, ' '),
        animated: rel.relationship_type === 'depends_on',
        style: { stroke: color, strokeWidth: 1.5 },
        labelStyle: { fill: '#94a3b8', fontSize: 9 },
        labelBgStyle: { fill: '#0f172a', fillOpacity: 0.8 },
        markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color },
      });
    });

    downstream.forEach((rel, i) => {
      const peer = rel.target;
      if (!peer) return;
      const y = startY + i * ROW_H;
      nodes.push({
        id: peer.id,
        type: 'mapNode',
        position: { x: centerX + COL_W, y },
        data: { label: peer.name, ci_type: peer.ci_type, ip: peer.ip_address, isCurrent: false, ciId: peer.id },
        draggable: false,
      });
      const color = EDGE_COLORS[rel.relationship_type] ?? '#64748b';
      edges.push({
        id: rel.id,
        source: ci.id,
        target: peer.id,
        label: rel.relationship_type.replace(/_/g, ' '),
        animated: rel.relationship_type === 'monitors',
        style: { stroke: color, strokeWidth: 1.5 },
        labelStyle: { fill: '#94a3b8', fontSize: 9 },
        labelBgStyle: { fill: '#0f172a', fillOpacity: 0.8 },
        markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color },
      });
    });

    return { nodes, edges };
  }, [ci, relationships]);

  const [nodes, , onNodesChange] = useNodesState(initNodes);
  const [edges, , onEdgesChange] = useEdgesState(initEdges);

  const onNodeClick = useCallback((_: any, node: any) => {
    if (!node.data.isCurrent) {
      navigate(`/inventory/${node.data.ciId}`);
    }
  }, [navigate]);

  if (!relationships.length) {
    return (
      <div className="flex items-center justify-center h-32 text-slate-600 text-sm">
        Keine Relationships vorhanden
      </div>
    );
  }

  return (
    <div className="rounded-xl overflow-hidden border border-slate-800/60" style={{ height: 320 }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable={false}
        nodesConnectable={false}
        panOnScroll={false}
        zoomOnScroll={false}
        minZoom={0.3}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} color="#1e293b" gap={20} size={1} />
      </ReactFlow>
    </div>
  );
}

import { useQuery } from '@tanstack/react-query';
import {
  ReactFlow, Background, BackgroundVariant, Controls, MiniMap,
  useNodesState, useEdgesState, Panel, MarkerType, useReactFlow,
} from '@xyflow/react';
import type { Node, Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, Search, LayoutGrid, Eye, EyeOff, Filter } from 'lucide-react';
import client from '../api/client';
import type { TopologyNodeData } from '../types';
import CINode from '../components/topology/CINode';

const nodeTypes = { ciNode: CINode };

interface TopologySearchPanelProps {
  nodes: Node<TopologyNodeData>[];
  setNodes: (value: Node<TopologyNodeData>[] | ((nds: Node<TopologyNodeData>[]) => Node<TopologyNodeData>[])) => void;
}

function TopologySearchPanel({ nodes, setNodes }: TopologySearchPanelProps) {
  const { fitView } = useReactFlow();
  const [nodeSearch, setNodeSearch] = useState('');

  useEffect(() => {
    const q = nodeSearch.trim().toLowerCase();
    if (!q) {
      // Clear highlights
      setNodes(nds => nds.map(n => ({ ...n, data: { ...n.data, highlighted: false } })));
      return;
    }
    const matched: Node<TopologyNodeData>[] = [];
    const updated = nodes.map(n => {
      const d = n.data as TopologyNodeData;
      const isMatch =
        d.label?.toLowerCase().includes(q) ||
        d.ip_address?.toLowerCase().includes(q);
      if (isMatch) matched.push(n);
      return { ...n, data: { ...n.data, highlighted: isMatch } };
    });
    setNodes(() => updated);
    if (matched.length === 1) {
      setTimeout(() => {
        fitView({ nodes: [matched[0]], padding: 0.5, duration: 400 });
      }, 50);
    }
  }, [nodeSearch, nodes.length]);

  return (
    <Panel position="top-right" className="bg-slate-900/95 backdrop-blur border border-slate-700/50 rounded-xl p-3 space-y-2 min-w-[200px]" style={{ top: '0px' }}>
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Find Node</p>
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-500" />
        <input
          className="bg-slate-800 border border-slate-700 rounded-lg px-7 py-1.5 text-xs text-slate-200 w-full focus:outline-none focus:border-yellow-500/60"
          placeholder="Name or IP..."
          value={nodeSearch}
          onChange={e => setNodeSearch(e.target.value)}
        />
      </div>
      {nodeSearch.trim() && (
        <p className="text-[10px] text-slate-500">
          {nodes.filter(n => {
            const d = n.data as TopologyNodeData;
            const q = nodeSearch.trim().toLowerCase();
            return d.label?.toLowerCase().includes(q) || d.ip_address?.toLowerCase().includes(q);
          }).length} match(es)
        </p>
      )}
    </Panel>
  );
}

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

const CI_TYPES = ['server','router','switch','access_point','firewall','nas','vm','container','service','database','desktop','laptop','mobile','iot','printer','other'];
const ENVIRONMENTS = ['production','development','test','home_automation','media','security'];

export default function Topology() {
  const navigate = useNavigate();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<TopologyNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [healthFilter, setHealthFilter] = useState('');
  const [envFilter, setEnvFilter] = useState('');
  const [showLabels, setShowLabels] = useState(true);
  const [showIp, setShowIp] = useState(true);
  const [hiddenRelTypes, setHiddenRelTypes] = useState<Set<string>>(new Set());

  const { data, refetch, isLoading } = useQuery<{ nodes: Node<TopologyNodeData>[]; edges: Edge[] }>({
    queryKey: ['topology'],
    queryFn: () => client.get('/topology').then(r => r.data),
  });

  useEffect(() => {
    if (data) {
      // Enrich edges with arrows and better styling
      const enrichedEdges = (data.edges || []).map(e => ({
        ...e,
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: (e.style as any)?.stroke ?? '#64748b' },
        style: { ...(e.style ?? {}), strokeWidth: 1.5 },
      }));
      setNodes(data.nodes || []);
      setEdges(enrichedEdges);
    }
  }, [data]);

  const filteredNodes = useMemo(() => {
    const q = search.trim().toLowerCase();
    return nodes.filter(n => {
      const d = n.data as TopologyNodeData;
      if (typeFilter && d.ci_type !== typeFilter) return false;
      if (healthFilter && d.health_status !== healthFilter) return false;
      if (envFilter && d.environment !== envFilter) return false;
      if (!q) return true;
      return (
        d.label?.toLowerCase().includes(q) ||
        d.ci_type?.toLowerCase().includes(q) ||
        d.ip_address?.toLowerCase().includes(q)
      );
    });
  }, [nodes, search, typeFilter, healthFilter, envFilter]);

  const filteredEdges = useMemo(() => {
    const nodeIds = new Set(filteredNodes.map(n => n.id));
    return edges.filter(e => {
      if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) return false;
      // Check hidden rel types based on edge label
      const label = typeof e.label === 'string' ? e.label.replace(/ /g, '_') : '';
      return !hiddenRelTypes.has(label);
    });
  }, [edges, filteredNodes, hiddenRelTypes]);

  const displayNodes = useMemo(() => {
    return filteredNodes.map(n => ({
      ...n,
      data: {
        ...n.data,
        label: showLabels ? (n.data as TopologyNodeData).label : '',
        ip_address: showIp ? (n.data as TopologyNodeData).ip_address : '',
      },
    }));
  }, [filteredNodes, showLabels, showIp]);

  const toggleRelType = (relType: string) => {
    setHiddenRelTypes(prev => {
      const next = new Set(prev);
      if (next.has(relType)) next.delete(relType);
      else next.add(relType);
      return next;
    });
  };

  const handleAutoArrange = () => {
    const LAYER_ORDER: Record<string, number> = {
      firewall: 0, router: 0,
      switch: 1, access_point: 1,
      server: 2, nas: 2, vm: 2, container: 2, database: 2, service: 2,
      desktop: 3, laptop: 3, mobile: 3, iot: 3, printer: 3, other: 3,
    };
    const layers: Record<number, Node<TopologyNodeData>[]> = {};
    filteredNodes.forEach(n => {
      const l = LAYER_ORDER[(n.data as TopologyNodeData).ci_type] ?? 3;
      (layers[l] = layers[l] || []).push(n);
    });
    const maxCount = Math.max(...Object.values(layers).map(a => a.length), 1);
    const nodeW = 200, nodeH = 160, xPad = 40;
    const totalW = maxCount * (nodeW + xPad);
    const arranged: Node<TopologyNodeData>[] = [];
    Object.entries(layers).sort(([a], [b]) => +a - +b).forEach(([li, lnodes]) => {
      const spacing = nodeW + xPad;
      const rowW = lnodes.length * spacing;
      const startX = (totalW - rowW) / 2 + spacing / 2;
      lnodes.forEach((n, i) => {
        arranged.push({ ...n, position: { x: startX + i * spacing, y: +li * nodeH + 50 } });
      });
    });
    setNodes(arranged);
  };

  const usedRelTypes = useMemo(() => {
    const types = new Set<string>();
    edges.forEach(e => {
      if (typeof e.label === 'string') types.add(e.label.replace(/ /g, '_'));
    });
    return [...types];
  }, [edges]);

  return (
    <div className="h-[calc(100vh-3rem)] -m-6 rounded-xl overflow-hidden border border-slate-700/50">
      {isLoading && (
        <div className="absolute inset-0 bg-slate-950/80 flex items-center justify-center z-10">
          <RefreshCw className="w-6 h-6 text-blue-400 animate-spin" />
        </div>
      )}
      <ReactFlow
        nodes={displayNodes}
        edges={filteredEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        onNodeClick={(_, node) => navigate(`/inventory/${node.data.ci_id}`)}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.1}
        maxZoom={2.5}
      >
        <Background variant={BackgroundVariant.Dots} color="#1e293b" gap={24} size={1.5} />
        <Controls className="!bg-slate-900 !border-slate-700" />
        <MiniMap
          nodeColor={n => {
            const h = (n.data as any)?.health_status;
            return h === 'healthy' ? '#22c55e' : h === 'down' ? '#ef4444' : h === 'degraded' ? '#f59e0b' : '#64748b';
          }}
          maskColor="rgba(2,6,23,0.85)"
          className="!bg-slate-900 !border-slate-700"
        />

        {/* Left panel: filters */}
        <Panel position="top-left" className="bg-slate-900/95 backdrop-blur border border-slate-700/50 rounded-xl p-3 space-y-2 min-w-[240px]">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-200">Topology</p>
            <span className="text-[10px] text-slate-500">{filteredNodes.length}n / {filteredEdges.length}e</span>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-500" />
            <input
              className="bg-slate-800 border border-slate-700 rounded-lg px-7 py-1.5 text-xs text-slate-200 w-full focus:outline-none focus:border-blue-500"
              placeholder="Name, IP, type..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            <div className="flex items-center gap-1.5">
              <Filter className="w-3 h-3 text-slate-500 flex-shrink-0" />
              <select className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300 w-full" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
                <option value="">All types</option>
                {CI_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <select className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300 w-full" value={healthFilter} onChange={e => setHealthFilter(e.target.value)}>
              <option value="">All health</option>
              {['healthy','degraded','down','unknown'].map(h => <option key={h} value={h}>{h}</option>)}
            </select>
            <select className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300 w-full" value={envFilter} onChange={e => setEnvFilter(e.target.value)}>
              <option value="">All environments</option>
              {ENVIRONMENTS.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
          <div className="flex flex-wrap gap-1.5 pt-1 border-t border-slate-800">
            <button onClick={() => setShowLabels(v => !v)} className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] border transition-colors ${showLabels ? 'border-blue-500/50 bg-blue-500/10 text-blue-300' : 'border-slate-700 text-slate-500'}`}>
              {showLabels ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />} Labels
            </button>
            <button onClick={() => setShowIp(v => !v)} className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] border transition-colors ${showIp ? 'border-blue-500/50 bg-blue-500/10 text-blue-300' : 'border-slate-700 text-slate-500'}`}>
              IP
            </button>
            <button onClick={handleAutoArrange} className="flex items-center gap-1 px-2 py-1 rounded text-[10px] border border-slate-700 text-slate-400 hover:border-slate-500">
              <LayoutGrid className="w-3 h-3" /> Arrange
            </button>
            <button onClick={() => refetch()} className="flex items-center gap-1 px-2 py-1 rounded text-[10px] border border-slate-700 text-slate-400 hover:border-slate-500">
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>
        </Panel>

        {/* Top-right: node search */}
        <TopologySearchPanel nodes={nodes} setNodes={setNodes} />

        {/* Right panel: legend */}
        <Panel position="top-right" className="bg-slate-900/95 backdrop-blur border border-slate-700/50 rounded-xl p-3 space-y-2 min-w-[160px]" style={{ top: '120px' }}>
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Health</p>
          {[['healthy','#22c55e'],['degraded','#f59e0b'],['down','#ef4444'],['unknown','#64748b']].map(([l,c]) => (
            <div key={l} className="flex items-center gap-2 text-xs">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{background:c}} />
              <span className="text-slate-400 capitalize">{l}</span>
            </div>
          ))}
          {usedRelTypes.length > 0 && (
            <>
              <div className="h-px bg-slate-800 my-1" />
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Relations</p>
              {usedRelTypes.map(rt => {
                const color = EDGE_COLORS[rt] ?? '#64748b';
                const hidden = hiddenRelTypes.has(rt);
                return (
                  <button key={rt} onClick={() => toggleRelType(rt)} className={`flex items-center gap-2 text-xs w-full text-left transition-opacity ${hidden ? 'opacity-30' : ''}`}>
                    <span className="w-4 h-0.5 flex-shrink-0 rounded" style={{background:color}} />
                    <span className="text-slate-400">{rt.replace(/_/g,' ')}</span>
                  </button>
                );
              })}
            </>
          )}
        </Panel>
      </ReactFlow>
    </div>
  );
}

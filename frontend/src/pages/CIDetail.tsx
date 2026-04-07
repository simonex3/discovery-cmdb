import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Save, Trash2, Plus, RefreshCw, Link2, GitFork, X, History, ShieldAlert, AlertCircle, ExternalLink } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import client from '../api/client';
import type { CI, Relationship, DependencyTree } from '../types';
import { healthBadge, statusBadge } from '../components/ui/Badge';
import StatusDot from '../components/ui/StatusDot';
import RelationshipMap from '../components/ci/RelationshipMap';

const SEV_COLOR: Record<string, string> = {
  CRITICAL: 'bg-red-600/20 text-red-400 border-red-500/40',
  HIGH:     'bg-orange-500/20 text-orange-400 border-orange-500/40',
  MEDIUM:   'bg-amber-500/20 text-amber-400 border-amber-500/40',
  LOW:      'bg-blue-500/20 text-blue-400 border-blue-500/40',
  NONE:     'bg-slate-600/20 text-slate-400 border-slate-500/40',
  UNKNOWN:  'bg-slate-600/20 text-slate-400 border-slate-500/40',
};

function VulnSection({ ciId }: { ciId: string }) {
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const runScan = async () => {
    setScanning(true);
    setError(null);
    setResult(null);
    try {
      const r = await client.get(`/vulns/${ciId}`);
      setResult(r.data);
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Scan fehlgeschlagen');
    } finally {
      setScanning(false);
    }
  };

  const allVulns = result
    ? [
        ...Object.entries(result.vulnerabilities?.by_port ?? {}).flatMap(([port, vulns]: any) =>
          (vulns as any[]).map(v => ({ ...v, source: `Port ${port}` }))
        ),
        ...(result.vulnerabilities?.by_os ?? []).map((v: any) => ({ ...v, source: 'OS' })),
      ]
    : [];

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="section-title flex items-center gap-2">
          <ShieldAlert className="w-3.5 h-3.5 text-amber-400" /> Vulnerability Scan
        </h3>
        <button
          onClick={runScan}
          disabled={scanning}
          className="btn-secondary text-xs flex items-center gap-1.5"
        >
          <ShieldAlert className="w-3.5 h-3.5" />
          {scanning ? 'Scanning... (kann 30-60s dauern)' : 'CVE Scan starten'}
        </button>
      </div>

      {error && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2.5 flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {error}
        </div>
      )}

      {result && (
        <div className="space-y-2">
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span>Ports geprüft: {result.open_ports?.join(', ') || '—'}</span>
            <span>·</span>
            <span>CVEs gefunden: <strong className="text-slate-200">{result.vulnerabilities?.summary?.total ?? 0}</strong></span>
            {result.vulnerabilities?.summary?.highest_severity && result.vulnerabilities.summary.highest_severity !== 'NONE' && (
              <>
                <span>·</span>
                <span className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold ${SEV_COLOR[result.vulnerabilities.summary.highest_severity]}`}>
                  {result.vulnerabilities.summary.highest_severity}
                </span>
              </>
            )}
          </div>

          {allVulns.length === 0 ? (
            <p className="text-slate-500 text-sm py-2">Keine relevanten CVEs gefunden.</p>
          ) : (
            <div className="max-h-72 overflow-y-auto space-y-2">
              {allVulns.map((v: any, i: number) => (
                <div key={i} className="p-2.5 rounded-lg bg-slate-800/50 border border-slate-700/40 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${SEV_COLOR[v.severity] ?? SEV_COLOR.UNKNOWN}`}>
                      {v.severity}
                    </span>
                    <span className="text-xs font-mono text-slate-300">{v.cve_id}</span>
                    {v.score && <span className="text-[10px] text-slate-500">Score: {v.score}</span>}
                    <span className="text-[10px] text-slate-600 ml-auto">{v.source} · {v.published}</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">{v.description}</p>
                  {v.references?.[0] && (
                    <a href={v.references[0]} target="_blank" rel="noreferrer" className="text-[10px] text-blue-400 hover:underline truncate block">
                      {v.references[0]}
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!result && !scanning && !error && (
        <p className="text-xs text-slate-500">Klicke "CVE Scan starten" um offene Ports gegen die NVD-Datenbank zu prüfen.</p>
      )}
    </div>
  );
}

const TYPES = ['server','router','switch','access_point','firewall','nas','vm','container','service','database','desktop','laptop','mobile','iot','printer','other'];
const STATUSES = ['active','inactive','maintenance','retired'];
const ENVIRONMENTS = ['production','development','test','home_automation','media','security'];
const REL_TYPES = ['depends_on','connects_to','hosted_on','runs_on','part_of','backs_up_to','replicates_to','monitors'];

interface CIFormState {
  name: string;
  ci_type: string;
  status: string;
  environment: string;
  ip_address: string;
  hostname: string;
  os: string;
  description: string;
  tags: string;
  open_ports: string;
  properties: string;
}

const EMPTY_FORM: CIFormState = {
  name: '',
  ci_type: 'server',
  status: 'active',
  environment: 'production',
  ip_address: '',
  hostname: '',
  os: '',
  description: '',
  tags: '',
  open_ports: '',
  properties: '',
};

const ACTION_STYLE: Record<string, string> = {
  discovered:     'bg-blue-500/15 text-blue-400 border-blue-500/30',
  created:        'bg-green-500/15 text-green-400 border-green-500/30',
  updated:        'bg-amber-500/15 text-amber-400 border-amber-500/30',
  deleted:        'bg-red-500/15 text-red-400 border-red-500/30',
  health_changed: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  rel_created:    'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
};

export default function CIDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const [form, setForm] = useState<CIFormState>(EMPTY_FORM);
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [relTarget, setRelTarget] = useState('');
  const [relType, setRelType] = useState(REL_TYPES[0]);
  const [relDesc, setRelDesc] = useState('');
  const [relDirection, setRelDirection] = useState<'downstream' | 'upstream'>('downstream');

  const { data: ci, isLoading, refetch } = useQuery<CI>({
    queryKey: ['ci', id],
    queryFn: () => client.get(`/cis/${id}`).then(r => r.data),
    enabled: !isNew,
  });

  const { data: relationships, refetch: refetchRels } = useQuery<Relationship[]>({
    queryKey: ['ci-rels', id],
    queryFn: () => client.get(`/cis/${id}/relationships`).then(r => r.data),
    enabled: !isNew,
  });

  const { data: deps, refetch: refetchDeps } = useQuery<DependencyTree>({
    queryKey: ['ci-deps', id],
    queryFn: () => client.get(`/cis/${id}/dependencies`).then(r => r.data),
    enabled: !isNew,
  });

  const { data: ciOptions } = useQuery({
    queryKey: ['ci-options'],
    queryFn: () => client.get('/cis', { params: { page: 1, page_size: 200 } }).then(r => r.data.items as CI[]),
  });

  const { data: auditData } = useQuery({
    queryKey: ['ci-audit', id],
    queryFn: () => client.get('/audit', { params: { ci_id: id, page_size: 20 } }).then(r => r.data),
    enabled: !isNew,
  });

  const { data: snConfig } = useQuery({
    queryKey: ['sn-config'],
    queryFn: () => client.get('/servicenow/config').then(r => r.data),
  });
  const snInstanceUrl: string | null = snConfig?.instance_url || null;

  useEffect(() => {
    if (!ci) return;
    setForm({
      name: ci.name || '',
      ci_type: ci.ci_type || 'server',
      status: ci.status || 'active',
      environment: ci.environment || 'production',
      ip_address: ci.ip_address || '',
      hostname: ci.hostname || '',
      os: ci.os || '',
      description: ci.description || '',
      tags: (ci.tags || []).join(', '),
      open_ports: ci.open_ports ? JSON.stringify(ci.open_ports, null, 2) : '',
      properties: ci.properties ? JSON.stringify(ci.properties, null, 2) : '',
    });
  }, [ci]);

  const filteredOptions = useMemo(() => {
    return (ciOptions || []).filter(o => o.id !== id);
  }, [ciOptions, id]);

  const set = (field: keyof CIFormState, value: string) => setForm(prev => ({ ...prev, [field]: value }));

  const buildPayload = () => {
    const tags = form.tags
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);

    let openPorts: any[] | undefined;
    let properties: Record<string, unknown> | undefined;
    if (form.open_ports.trim()) {
      openPorts = JSON.parse(form.open_ports);
    }
    if (form.properties.trim()) {
      properties = JSON.parse(form.properties);
    }

    return {
      name: form.name,
      ci_type: form.ci_type,
      status: form.status,
      environment: form.environment,
      ip_address: form.ip_address || undefined,
      hostname: form.hostname || undefined,
      os: form.os || undefined,
      description: form.description || undefined,
      tags,
      open_ports: openPorts,
      properties,
    };
  };

  const handleSave = async () => {
    setError(null);
    if (!form.name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    try {
      const payload = buildPayload();
      if (isNew) {
        const res = await client.post('/cis', payload);
        navigate(`/inventory/${res.data.id}`);
      } else {
        await client.put(`/cis/${id}`, payload);
        await refetch();
      }
    } catch (err: any) {
      if (err instanceof SyntaxError) {
        setError('Invalid JSON in Open Ports or Properties');
      } else {
        setError(err.response?.data?.detail || 'Failed to save CI');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!id || isNew) return;
    if (!confirm('Delete this CI? This cannot be undone.')) return;
    try {
      await client.delete(`/cis/${id}`);
      navigate('/inventory');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Delete failed');
    }
  };

  const handleAddRelationship = async () => {
    if (!id || !relTarget) return;
    try {
      const sourceId = relDirection === 'downstream' ? id : relTarget;
      const targetId = relDirection === 'downstream' ? relTarget : id;
      await client.post('/relationships', {
        source_id: sourceId,
        target_id: targetId,
        relationship_type: relType,
        description: relDesc || undefined,
      });
      setRelTarget('');
      setRelDesc('');
      await refetchRels();
      await refetchDeps();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to add relationship');
    }
  };

  const handleDeleteRelationship = async (relId: string) => {
    try {
      await client.delete(`/relationships/${relId}`);
      await refetchRels();
      await refetchDeps();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete relationship');
    }
  };

  if (!isNew && isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading CI...
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/inventory')} className="btn-secondary text-sm flex items-center gap-1.5">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white">{isNew ? 'New CI' : ci?.name}</h1>
            {!isNew && (
              <p className="text-slate-400 text-sm">ID: <span className="font-mono text-xs">{ci?.id}</span></p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isNew && (
            <button onClick={() => refetch()} className="btn-secondary text-sm flex items-center gap-2">
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
          )}
          <button onClick={handleSave} disabled={saving} className="btn-primary text-sm flex items-center gap-2">
            <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save'}
          </button>
          {!isNew && (
            <button onClick={handleDelete} className="btn-danger text-sm flex items-center gap-2">
              <Trash2 className="w-4 h-4" /> Delete
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {!isNew && ci && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="card">
            <p className="text-xs text-slate-500">Status</p>
            <div className="mt-2 flex items-center gap-2">
              {statusBadge(ci.status)}
              <div className="flex items-center gap-2">
                <StatusDot status={ci.health_status} />
                {healthBadge(ci.health_status)}
              </div>
            </div>
          </div>
          <div className="card">
            <p className="text-xs text-slate-500">Last Seen</p>
            <p className="text-sm text-slate-200 mt-1">{ci.last_seen ? new Date(ci.last_seen).toLocaleString() : 'Never'}</p>
          </div>
          <div className="card">
            <p className="text-xs text-slate-500">ServiceNow</p>
            {snInstanceUrl && ci.servicenow_sys_id ? (
              <div className="mt-1 space-y-1">
                <a
                  href={`${snInstanceUrl}/nav_to.do?uri=cmdb_ci.do?sys_id=${ci.servicenow_sys_id}`}
                  target="_blank" rel="noreferrer"
                  className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> CI in ServiceNow
                </a>
                {(ci.properties as any)?.sn_change_sys_id && (
                  <a
                    href={`${snInstanceUrl}/nav_to.do?uri=change_request.do?sys_id=${(ci.properties as any).sn_change_sys_id}`}
                    target="_blank" rel="noreferrer"
                    className="text-sm text-amber-400 hover:text-amber-300 flex items-center gap-1"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Change Request
                  </a>
                )}
                {(ci.properties as any)?.sn_incident_sys_id && (
                  <a
                    href={`${snInstanceUrl}/nav_to.do?uri=incident.do?sys_id=${(ci.properties as any).sn_incident_sys_id}`}
                    target="_blank" rel="noreferrer"
                    className="text-sm text-red-400 hover:text-red-300 flex items-center gap-1"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Incident
                  </a>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-500 mt-1">{ci.servicenow_sys_id ? 'Linked' : 'Not linked'}</p>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card lg:col-span-2 space-y-4">
          <h3 className="text-sm font-semibold text-slate-300">Details</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Name *</label>
              <input className="input" value={form.name} onChange={e => set('name', e.target.value)} />
            </div>
            <div>
              <label className="label">Type</label>
              <select className="select" value={form.ci_type} onChange={e => set('ci_type', e.target.value)}>
                {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select className="select" value={form.status} onChange={e => set('status', e.target.value)}>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Environment</label>
              <select className="select" value={form.environment} onChange={e => set('environment', e.target.value)}>
                {ENVIRONMENTS.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <div>
              <label className="label">IP Address</label>
              <input className="input font-mono" value={form.ip_address} onChange={e => set('ip_address', e.target.value)} />
            </div>
            <div>
              <label className="label">Hostname</label>
              <input className="input" value={form.hostname} onChange={e => set('hostname', e.target.value)} />
            </div>
            <div>
              <label className="label">OS</label>
              <input className="input" value={form.os} onChange={e => set('os', e.target.value)} />
            </div>
            <div>
              <label className="label">Tags</label>
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1.5 min-h-[2rem]">
                  {form.tags.split(',').map(t => t.trim()).filter(Boolean).map(tag => (
                    <span key={tag} className="inline-flex items-center gap-1 bg-blue-500/15 border border-blue-500/30 text-blue-300 text-xs px-2 py-0.5 rounded-full">
                      {tag}
                      <button type="button" onClick={() => {
                        const updated = form.tags.split(',').map(t => t.trim()).filter(t => t && t !== tag);
                        set('tags', updated.join(', '));
                      }} className="text-blue-400 hover:text-white ml-0.5">
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  ))}
                  {!form.tags.split(',').filter(t => t.trim()).length && (
                    <span className="text-xs text-slate-600 self-center">No tags</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <input className="input text-sm flex-1" placeholder="Add tag..." value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && tagInput.trim()) {
                        e.preventDefault();
                        const current = form.tags.split(',').map(t => t.trim()).filter(Boolean);
                        if (!current.includes(tagInput.trim())) {
                          set('tags', [...current, tagInput.trim()].join(', '));
                        }
                        setTagInput('');
                      }
                    }} />
                  <button type="button" className="btn-secondary text-sm px-3"
                    onClick={() => {
                      if (!tagInput.trim()) return;
                      const current = form.tags.split(',').map(t => t.trim()).filter(Boolean);
                      if (!current.includes(tagInput.trim())) {
                        set('tags', [...current, tagInput.trim()].join(', '));
                      }
                      setTagInput('');
                    }}>
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div>
            <label className="label">Description</label>
            <textarea className="input h-24 resize-none" value={form.description} onChange={e => set('description', e.target.value)} />
          </div>
          <div>
            <label className="label">Open Ports (JSON)</label>
            <textarea className="input font-mono text-xs h-24" placeholder='[{"port":22,"protocol":"tcp","service":"ssh"}]' value={form.open_ports} onChange={e => set('open_ports', e.target.value)} />
          </div>
          <div>
            <label className="label">Properties (JSON)</label>
            <textarea className="input font-mono text-xs h-24" placeholder='{"cluster":"lab"}' value={form.properties} onChange={e => set('properties', e.target.value)} />
          </div>
        </div>

        <div className="card space-y-4">
          <h3 className="text-sm font-semibold text-slate-300">Dependency Builder</h3>
          {isNew && (
            <p className="text-slate-500 text-sm">Save this CI to add relationships.</p>
          )}
          {!isNew && (
            <>
              <div className="space-y-2">
                <label className="label">Add Dependency</label>
                <select className="select" value={relTarget} onChange={e => setRelTarget(e.target.value)}>
                  <option value="">Select target CI</option>
                  {filteredOptions.map(o => (
                    <option key={o.id} value={o.id}>{o.name} ({o.ip_address || o.ci_type})</option>
                  ))}
                </select>
                <select className="select" value={relDirection} onChange={e => setRelDirection(e.target.value as any)}>
                  <option value="downstream">This CI depends on target</option>
                  <option value="upstream">Target depends on this CI</option>
                </select>
                <select className="select" value={relType} onChange={e => setRelType(e.target.value)}>
                  {REL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <input className="input" placeholder="Description (optional)" value={relDesc} onChange={e => setRelDesc(e.target.value)} />
                <button onClick={handleAddRelationship} className="btn-primary text-sm w-full flex items-center justify-center gap-2">
                  <Plus className="w-4 h-4" /> Add
                </button>
              </div>
              <div className="h-px bg-slate-800 my-2" />
              <div className="space-y-2">
                {(relationships || []).length === 0 && (
                  <p className="text-slate-500 text-sm">No relationships</p>
                )}
                {(relationships || []).map(rel => (
                  <div key={rel.id} className="p-2 rounded-lg bg-slate-800/50 border border-slate-700/50">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs text-slate-400 flex items-center gap-1.5">
                          <Link2 className="w-3 h-3" /> {rel.relationship_type}
                        </div>
                        <div className="text-sm text-slate-200 truncate">
                          {(rel.source?.id === id ? rel.target?.name : rel.source?.name) || 'Unknown'}
                        </div>
                        {rel.description && <div className="text-xs text-slate-500 truncate">{rel.description}</div>}
                      </div>
                      <button onClick={() => handleDeleteRelationship(rel.id)} className="text-xs text-red-400 hover:text-red-300">
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {!isNew && relationships && relationships.length > 0 && (
        <div className="card space-y-3">
          <h3 className="section-title flex items-center gap-2">
            <GitFork className="w-3.5 h-3.5" /> Relationship Map
            <span className="ml-auto text-slate-600 normal-case font-normal text-xs">
              {relationships.length} connection{relationships.length !== 1 ? 's' : ''} — click to navigate
            </span>
          </h3>
          {ci && <RelationshipMap ci={ci} relationships={relationships} />}
        </div>
      )}

      {!isNew && (
        <div className="card space-y-4">
          <h3 className="section-title">Dependency Details</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-slate-500 mb-2">← Upstream (hängen von diesem CI ab)</p>
              <div className="space-y-1.5">
                {deps?.upstream?.length ? deps.upstream.map(d => (
                  <div key={d.ci.id}
                    className="p-2.5 rounded-lg bg-slate-800/40 border border-slate-700/40 hover:border-slate-600/60 cursor-pointer transition-all"
                    onClick={() => navigate(`/inventory/${d.ci.id}`)}>
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-slate-200 font-medium">{d.ci.name}</div>
                      <span className="text-[10px] text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">{d.relationship_type.replace(/_/g,' ')}</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">{d.ci.ip_address || d.ci.ci_type}</div>
                  </div>
                )) : (
                  <p className="text-slate-600 text-sm py-2">None</p>
                )}
              </div>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-2">→ Downstream (dieses CI hängt ab von)</p>
              <div className="space-y-1.5">
                {deps?.downstream?.length ? deps.downstream.map(d => (
                  <div key={d.ci.id}
                    className="p-2.5 rounded-lg bg-slate-800/40 border border-slate-700/40 hover:border-slate-600/60 cursor-pointer transition-all"
                    onClick={() => navigate(`/inventory/${d.ci.id}`)}>
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-slate-200 font-medium">{d.ci.name}</div>
                      <span className="text-[10px] text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">{d.relationship_type.replace(/_/g,' ')}</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">{d.ci.ip_address || d.ci.ci_type}</div>
                  </div>
                )) : (
                  <p className="text-slate-600 text-sm py-2">None</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Vulnerability Scan */}
      {!isNew && id && <VulnSection ciId={id} />}

      {!isNew && (
        <div className="card space-y-3">
          <h3 className="section-title flex items-center gap-2">
            <History className="w-3.5 h-3.5" /> History
          </h3>
          <div className="max-h-64 overflow-y-auto space-y-1.5">
            {(auditData?.items ?? []).length === 0 && (
              <p className="text-slate-500 text-sm py-2">No audit history for this CI.</p>
            )}
            {(auditData?.items ?? []).map((log: any) => (
              <div key={log.id} className="flex items-start gap-2.5 py-1.5 border-b border-slate-800/60 last:border-0">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border flex-shrink-0 mt-0.5 ${ACTION_STYLE[log.action] ?? 'bg-slate-500/15 text-slate-400 border-slate-500/30'}`}>
                  {log.action}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-300 truncate">{log.description || '—'}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {log.actor && <span className="mr-2">{log.actor}</span>}
                    {log.timestamp && (
                      <span>{formatDistanceToNow(new Date(log.timestamp), { addSuffix: true })}</span>
                    )}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

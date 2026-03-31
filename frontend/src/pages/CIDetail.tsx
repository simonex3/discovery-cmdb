import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Save, Trash2, Plus, RefreshCw, Link2, GitFork, X } from 'lucide-react';
import client from '../api/client';
import type { CI, Relationship, DependencyTree } from '../types';
import { healthBadge, statusBadge } from '../components/ui/Badge';
import StatusDot from '../components/ui/StatusDot';
import RelationshipMap from '../components/ci/RelationshipMap';

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
            <p className="text-sm text-slate-200 mt-1">{ci.servicenow_sys_id ? `Linked (${ci.servicenow_sys_id})` : 'Not linked'}</p>
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
    </div>
  );
}

import { useState } from 'react';
import axios from 'axios';
import { Network, User, Settings, Database, ChevronRight, ChevronLeft, Check, Eye, EyeOff, Loader2 } from 'lucide-react';

interface SetupData {
  // Step 1: Admin account
  admin_username: string;
  admin_email: string;
  admin_password: string;
  admin_password_confirm: string;
  admin_full_name: string;

  // Step 2: Network & Discovery
  app_name: string;
  network_range: string;
  auto_discovery_enabled: boolean;
  discovery_interval_minutes: number;
  health_check_interval_minutes: number;

  // Step 3: ServiceNow (optional)
  servicenow_instance_url: string;
  servicenow_username: string;
  servicenow_password: string;

  // FRITZ!Box (optional)
  fritz_host: string;
  fritz_username: string;
  fritz_password: string;
  fritz_sync_enabled: boolean;

  // Step 4: Final
  seed_sample_data: boolean;
}

const STEPS = [
  { id: 1, title: 'Admin Account', icon: User, description: 'Create your administrator account' },
  { id: 2, title: 'Network Setup', icon: Network, description: 'Configure discovery & monitoring' },
  { id: 3, title: 'Integrations', icon: Database, description: 'Optional: ServiceNow & FRITZ!Box' },
  { id: 4, title: 'Finish', icon: Check, description: 'Review and complete setup' },
];

export default function Setup({ onComplete }: { onComplete: (token: string) => void }) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [data, setData] = useState<SetupData>({
    admin_username: '',
    admin_email: '',
    admin_password: '',
    admin_password_confirm: '',
    admin_full_name: '',
    app_name: 'Discovery CMDB',
    network_range: '192.168.178.0/24',
    auto_discovery_enabled: true,
    discovery_interval_minutes: 60,
    health_check_interval_minutes: 5,
    servicenow_instance_url: '',
    servicenow_username: '',
    servicenow_password: '',
    fritz_host: '',
    fritz_username: '',
    fritz_password: '',
    fritz_sync_enabled: true,
    seed_sample_data: true,
  });

  const set = (field: keyof SetupData, value: string | boolean | number) =>
    setData(prev => ({ ...prev, [field]: value }));

  const validateStep1 = () => {
    if (!data.admin_username || data.admin_username.length < 3) return 'Username must be at least 3 characters';
    if (!data.admin_email.includes('@')) return 'Enter a valid email address';
    if (!data.admin_password || data.admin_password.length < 8) return 'Password must be at least 8 characters';
    if (data.admin_password !== data.admin_password_confirm) return 'Passwords do not match';
    return null;
  };

  const validateStep2 = () => {
    const cidrRegex = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;
    if (!cidrRegex.test(data.network_range)) return 'Enter a valid CIDR range (e.g. 192.168.1.0/24)';
    if (data.discovery_interval_minutes < 5) return 'Discovery interval must be at least 5 minutes';
    if (data.health_check_interval_minutes < 1) return 'Health check interval must be at least 1 minute';
    return null;
  };

  const handleNext = () => {
    setError(null);
    if (step === 1) {
      const err = validateStep1();
      if (err) { setError(err); return; }
    }
    if (step === 2) {
      const err = validateStep2();
      if (err) { setError(err); return; }
    }
    setStep(s => s + 1);
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = {
        admin_username: data.admin_username,
        admin_email: data.admin_email,
        admin_password: data.admin_password,
        admin_full_name: data.admin_full_name || undefined,
        app_name: data.app_name,
        network_range: data.network_range,
        auto_discovery_enabled: data.auto_discovery_enabled,
        discovery_interval_minutes: data.discovery_interval_minutes,
        health_check_interval_minutes: data.health_check_interval_minutes,
        servicenow_instance_url: data.servicenow_instance_url || undefined,
        servicenow_username: data.servicenow_username || undefined,
        servicenow_password: data.servicenow_password || undefined,
        fritz_host: data.fritz_host || undefined,
        fritz_username: data.fritz_username || undefined,
        fritz_password: data.fritz_password || undefined,
        fritz_sync_enabled: data.fritz_sync_enabled,
        seed_sample_data: data.seed_sample_data,
      };
      const res = await axios.post('/api/v1/setup/complete', payload);
      localStorage.setItem('cmdb_token', res.data.access_token);
      onComplete(res.data.access_token);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Setup failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/30 mb-4">
            <span className="text-3xl">🖧</span>
          </div>
          <h1 className="text-3xl font-bold text-white">Discovery CMDB</h1>
          <p className="text-slate-400 mt-1">Setup Wizard — Let's get you configured</p>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center justify-between mb-8">
          {STEPS.map((s, idx) => {
            const Icon = s.icon;
            const isActive = s.id === step;
            const isDone = s.id < step;
            return (
              <div key={s.id} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-shrink-0">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${
                    isDone ? 'bg-green-500 border-green-500' :
                    isActive ? 'bg-blue-500/20 border-blue-500' :
                    'bg-slate-800 border-slate-600'
                  }`}>
                    {isDone ? (
                      <Check className="w-5 h-5 text-white" />
                    ) : (
                      <Icon className={`w-5 h-5 ${isActive ? 'text-blue-400' : 'text-slate-500'}`} />
                    )}
                  </div>
                  <span className={`text-xs mt-1 font-medium ${isActive ? 'text-blue-400' : isDone ? 'text-green-400' : 'text-slate-500'}`}>
                    {s.title}
                  </span>
                </div>
                {idx < STEPS.length - 1 && (
                  <div className={`h-0.5 flex-1 mx-2 transition-all ${isDone ? 'bg-green-500' : 'bg-slate-700'}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* Card */}
        <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-8">
          <h2 className="text-xl font-semibold text-white mb-1">{STEPS[step - 1].title}</h2>
          <p className="text-slate-400 text-sm mb-6">{STEPS[step - 1].description}</p>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-5 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Step 1: Admin Account */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Username *</label>
                  <input
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                    placeholder="admin"
                    value={data.admin_username}
                    onChange={e => set('admin_username', e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Full Name</label>
                  <input
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                    placeholder="John Doe"
                    value={data.admin_full_name}
                    onChange={e => set('admin_full_name', e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Email *</label>
                <input
                  type="email"
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  placeholder="admin@example.com"
                  value={data.admin_email}
                  onChange={e => set('admin_email', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Password *</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 pr-10 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                    placeholder="Min. 8 characters"
                    value={data.admin_password}
                    onChange={e => set('admin_password', e.target.value)}
                  />
                  <button type="button" className="absolute right-3 top-2.5 text-slate-400 hover:text-white" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Confirm Password *</label>
                <input
                  type="password"
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  placeholder="Repeat password"
                  value={data.admin_password_confirm}
                  onChange={e => set('admin_password_confirm', e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Step 2: Network */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Application Name</label>
                <input
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  value={data.app_name}
                  onChange={e => set('app_name', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Network Range (CIDR) *</label>
                <input
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
                  placeholder="192.168.178.0/24"
                  value={data.network_range}
                  onChange={e => set('network_range', e.target.value)}
                />
                <p className="text-slate-500 text-xs mt-1">The subnet that will be scanned for devices</p>
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-800 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-slate-200">Auto-Discovery</p>
                  <p className="text-xs text-slate-400">Automatically scan the network on a schedule</p>
                </div>
                <button
                  type="button"
                  onClick={() => set('auto_discovery_enabled', !data.auto_discovery_enabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${data.auto_discovery_enabled ? 'bg-blue-500' : 'bg-slate-600'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition-transform ${data.auto_discovery_enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Discovery Interval</label>
                  <select
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                    value={data.discovery_interval_minutes}
                    onChange={e => set('discovery_interval_minutes', parseInt(e.target.value))}
                  >
                    <option value={15}>Every 15 minutes</option>
                    <option value={30}>Every 30 minutes</option>
                    <option value={60}>Every hour</option>
                    <option value={360}>Every 6 hours</option>
                    <option value={1440}>Once a day</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Health Check Interval</label>
                  <select
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                    value={data.health_check_interval_minutes}
                    onChange={e => set('health_check_interval_minutes', parseInt(e.target.value))}
                  >
                    <option value={1}>Every minute</option>
                    <option value={2}>Every 2 minutes</option>
                    <option value={5}>Every 5 minutes</option>
                    <option value={10}>Every 10 minutes</option>
                    <option value={30}>Every 30 minutes</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Integrations */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-sm text-blue-300 mb-4">
                <strong>Optional:</strong> You can configure integrations later in Settings.
              </div>
              <h3 className="text-sm font-semibold text-slate-300">ServiceNow</h3>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">ServiceNow Instance URL</label>
                <input
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  placeholder="https://dev12345.service-now.com"
                  value={data.servicenow_instance_url}
                  onChange={e => set('servicenow_instance_url', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Username</label>
                <input
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  placeholder="admin"
                  value={data.servicenow_username}
                  onChange={e => set('servicenow_username', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Password</label>
                <input
                  type="password"
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  placeholder="ServiceNow password"
                  value={data.servicenow_password}
                  onChange={e => set('servicenow_password', e.target.value)}
                />
              </div>
              <div className="h-px bg-slate-700 my-2" />
              <h3 className="text-sm font-semibold text-slate-300">FRITZ!Box</h3>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">FRITZ!Box Host</label>
                <input
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  placeholder="192.168.178.1 or fritz.box"
                  value={data.fritz_host}
                  onChange={e => set('fritz_host', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Username</label>
                <input
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  placeholder="fritz-user"
                  value={data.fritz_username}
                  onChange={e => set('fritz_username', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Password</label>
                <input
                  type="password"
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  placeholder="FRITZ!Box password"
                  value={data.fritz_password}
                  onChange={e => set('fritz_password', e.target.value)}
                />
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-800 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-slate-200">Mesh Sync</p>
                  <p className="text-xs text-slate-400">Automatically sync mesh relationships after discovery</p>
                </div>
                <button
                  type="button"
                  onClick={() => set('fritz_sync_enabled', !data.fritz_sync_enabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${data.fritz_sync_enabled ? 'bg-blue-500' : 'bg-slate-600'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition-transform ${data.fritz_sync_enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Finish */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="bg-slate-800 rounded-xl p-4 space-y-3">
                <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">Review Configuration</h3>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-slate-400">Admin User</span><span className="text-white font-mono">{data.admin_username}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Email</span><span className="text-white">{data.admin_email}</span></div>
                  <div className="h-px bg-slate-700" />
                  <div className="flex justify-between"><span className="text-slate-400">App Name</span><span className="text-white">{data.app_name}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Network Range</span><span className="text-white font-mono">{data.network_range}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Auto-Discovery</span><span className={data.auto_discovery_enabled ? 'text-green-400' : 'text-slate-400'}>{data.auto_discovery_enabled ? 'Enabled' : 'Disabled'}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Discovery Interval</span><span className="text-white">Every {data.discovery_interval_minutes} min</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Health Checks</span><span className="text-white">Every {data.health_check_interval_minutes} min</span></div>
                  {data.servicenow_instance_url && (
                    <>
                      <div className="h-px bg-slate-700" />
                      <div className="flex justify-between"><span className="text-slate-400">ServiceNow</span><span className="text-green-400">Configured</span></div>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-800 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-slate-200">Load Sample Data</p>
                  <p className="text-xs text-slate-400">Pre-populate with example home network devices</p>
                </div>
                <button
                  type="button"
                  onClick={() => set('seed_sample_data', !data.seed_sample_data)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${data.seed_sample_data ? 'bg-blue-500' : 'bg-slate-600'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition-transform ${data.seed_sample_data ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between mt-8 pt-6 border-t border-slate-700">
            <button
              type="button"
              disabled={step === 1}
              onClick={() => { setError(null); setStep(s => s - 1); }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" /> Back
            </button>

            {step < 4 ? (
              <button
                type="button"
                onClick={handleNext}
                className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading}
                className="flex items-center gap-2 px-6 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Setting up...</>
                ) : (
                  <><Check className="w-4 h-4" /> Complete Setup</>
                )}
              </button>
            )}
          </div>
        </div>

        <p className="text-center text-slate-600 text-xs mt-4">Discovery CMDB v1.0.0</p>
      </div>
    </div>
  );
}

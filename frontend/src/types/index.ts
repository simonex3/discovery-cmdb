export type CIType =
  | 'server' | 'router' | 'switch' | 'access_point' | 'firewall'
  | 'nas' | 'vm' | 'container' | 'service' | 'database'
  | 'desktop' | 'laptop' | 'mobile' | 'iot' | 'printer' | 'other';

export type HealthStatus = 'healthy' | 'degraded' | 'down' | 'unknown';
export type CIStatus = 'active' | 'inactive' | 'maintenance' | 'retired';
export type Environment = 'production' | 'development' | 'test' | 'home_automation' | 'media' | 'security';
export type RelType = 'depends_on' | 'connects_to' | 'hosted_on' | 'runs_on' | 'part_of' | 'backs_up_to' | 'replicates_to' | 'monitors';

export interface OpenPort {
  port: number;
  protocol: string;
  service?: string;
}

export interface CI {
  id: string;
  name: string;
  ci_type: CIType;
  category?: string;
  status: CIStatus;
  ip_address?: string;
  mac_address?: string;
  hostname?: string;
  fqdn?: string;
  open_ports?: OpenPort[];
  manufacturer?: string;
  model_name?: string;
  serial_number?: string;
  os?: string;
  os_version?: string;
  environment: Environment;
  location?: string;
  owner?: string;
  department?: string;
  description?: string;
  tags: string[];
  properties: Record<string, unknown>;
  health_status: HealthStatus;
  last_seen?: string;
  last_discovered?: string;
  servicenow_sys_id?: string;
  created_at: string;
  updated_at: string;
  relationships_count: number;
}

export interface CIRef {
  id: string;
  name: string;
  ci_type: CIType;
  ip_address?: string;
}

export interface Relationship {
  id: string;
  source_id: string;
  target_id: string;
  relationship_type: RelType;
  description?: string;
  created_at: string;
  source?: CIRef;
  target?: CIRef;
}

export interface DependencyNode {
  ci: CI;
  relationship_type: RelType;
  direction: 'upstream' | 'downstream';
}

export interface DependencyTree {
  ci: CI;
  upstream: DependencyNode[];
  downstream: DependencyNode[];
}

export interface TopologyNodeData extends Record<string, unknown> {
  label: string;
  ci_type: CIType;
  status: CIStatus;
  health_status: HealthStatus;
  ip_address?: string;
  environment: Environment;
  ci_id: string;
}

export interface AuditLog {
  id: string;
  ci_id?: string;
  ci_name?: string;
  action: string;
  actor: string;
  description?: string;
  changes?: Record<string, { old: unknown; new: unknown }>;
  timestamp: string;
}

export interface Stats {
  total_cis: number;
  by_type: Record<string, number>;
  by_status: Record<string, number>;
  by_health: Record<string, number>;
  by_environment: Record<string, number>;
  recent_changes: AuditLog[];
  issues: Array<{ id: string; name: string; ip_address?: string; health_status: HealthStatus; ci_type: CIType }>;
}

export interface User {
  id: string;
  username: string;
  email: string;
  full_name?: string;
  role: 'admin' | 'operator' | 'viewer';
  is_active: boolean;
  avatar_color: string;
  last_login?: string;
  created_at: string;
  api_key?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

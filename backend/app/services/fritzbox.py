"""FRITZ!Box mesh integration using login_sid.lua + meshlist.*."""
from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from xml.etree import ElementTree

import httpx
from urllib.parse import urljoin
from sqlalchemy.orm import Session

from app.models.ci import ConfigurationItem
from app.models.relationship import Relationship
from app.models.audit import AuditLog
from app.models.user import AppSettings

logger = logging.getLogger(__name__)


class FritzBoxService:
    def __init__(self, host: str, username: str | None, password: str | None, enabled: bool = True):
        self.host = host
        self.username = username or ""
        self.password = password or ""
        self.enabled = enabled

    @staticmethod
    def from_settings(db: Session) -> "FritzBoxService":
        def get_setting(key: str, default: Optional[str] = None) -> Optional[str]:
            s = db.query(AppSettings).filter(AppSettings.key == key).first()
            return s.value if s else default

        host = get_setting("fritz_host", "") or ""
        username = get_setting("fritz_username", "") or ""
        password = get_setting("fritz_password", "") or ""
        enabled = get_setting("fritz_sync_enabled", "true") == "true"
        return FritzBoxService(host, username, password, enabled=enabled)

    def _get_sid(self) -> str:
        url = f"http://{self.host}/login_sid.lua"
        r = httpx.get(url, timeout=10)
        r.raise_for_status()
        sid, challenge = self._parse_login_sid(r.text)
        if sid != "0000000000000000":
            return sid

        response = self._build_response(challenge, self.password)
        params = {"response": response}
        if self.username:
            params["username"] = self.username
        r2 = httpx.get(url, params=params, timeout=10)
        r2.raise_for_status()
        sid2, _ = self._parse_login_sid(r2.text)
        if sid2 == "0000000000000000":
            raise RuntimeError("FRITZ!Box login failed (SID is 0)")
        return sid2

    def _soap_call(self, action: str, params: Optional[Dict[str, Any]] = None) -> Optional[str]:
        """Call TR-064 Hosts:1 action and return response XML as text."""
        if not self.username or not self.password:
            return None
        inner = ""
        if params:
            for k, v in params.items():
                inner += f"<{k}>{v}</{k}>"
        body = (
            '<?xml version="1.0" encoding="utf-8"?>'
            '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" '
            's:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">'
            '<s:Body>'
            f'<u:{action} xmlns:u="urn:dslforum-org:service:Hosts:1">{inner}</u:{action}>'
            '</s:Body>'
            '</s:Envelope>'
        )
        headers = {
            "Content-Type": 'text/xml; charset="utf-8"',
            "SOAPAction": f'"urn:dslforum-org:service:Hosts:1#{action}"',
        }
        candidates = [
            f"http://{self.host}:49000/upnp/control/hosts",
            f"https://{self.host}:49443/upnp/control/hosts",
        ]
        for url in candidates:
            try:
                r = httpx.post(
                    url,
                    headers=headers,
                    content=body,
                    auth=(self.username, self.password),
                    timeout=10,
                    verify=False,
                )
                if r.status_code == 200 and r.text:
                    return r.text
            except Exception as e:
                logger.warning(f"TR-064 call {action} failed at {url}: {e}")
                continue
        return None

    def _get_host_count(self) -> int:
        """TR-064: GetHostNumberOfEntries → int."""
        xml_text = self._soap_call("GetHostNumberOfEntries")
        if not xml_text:
            return 0
        try:
            root = ElementTree.fromstring(xml_text)
            val = root.findtext(".//NewHostNumberOfEntries")
            return int(val) if val else 0
        except Exception:
            return 0

    def _get_host_by_index(self, index: int) -> Optional[Dict[str, Any]]:
        """TR-064: GetGenericHostEntry by index → dict with IP, MAC, hostname."""
        xml_text = self._soap_call("GetGenericHostEntry", {"NewIndex": str(index)})
        if not xml_text:
            return None
        try:
            root = ElementTree.fromstring(xml_text)
            host: Dict[str, Any] = {}
            for tag, key in [
                ("NewIPAddress", "ip"),
                ("NewMACAddress", "mac"),
                ("NewHostName", "name"),
                ("NewInterfaceType", "interface_type"),
                ("NewActive", "active"),
                ("NewAddressSource", "address_source"),
            ]:
                val = root.findtext(f".//{tag}")
                if val is not None:
                    host[key] = val.strip()
            return host if host.get("ip") or host.get("mac") else None
        except Exception as e:
            logger.warning(f"GetGenericHostEntry({index}) parse error: {e}")
            return None

    def _get_all_hosts_tr064(self) -> List[Dict[str, Any]]:
        """Iterate TR-064 GetGenericHostEntry to get all connected hosts."""
        count = self._get_host_count()
        if count == 0:
            return []
        hosts = []
        for i in range(count):
            h = self._get_host_by_index(i)
            if h:
                hosts.append(h)
        return hosts

    def _get_host_list_via_path(self, sid: str) -> List[Dict[str, Any]]:
        """Try X_AVM-DE_GetHostListPath → fetch JSON host list."""
        path = self._soap_get_path("X_AVM-DE_GetHostListPath", "NewX_AVM-DE_HostListPath")
        if not path:
            return []
        try:
            url = urljoin(f"http://{self.host}/", path)
            r = httpx.get(url, params={"sid": sid}, timeout=10)
            if r.status_code != 200:
                return []
            text = r.text.strip()
            if text.startswith("{"):
                data = json.loads(text)
                if isinstance(data, dict):
                    return data.get("items") or data.get("hosts") or []
                if isinstance(data, list):
                    return data
            # XML fallback
            if text.startswith("<"):
                root = ElementTree.fromstring(text)
                hosts = []
                for item in root.iter():
                    if item.tag.lower() in ("item", "host", "device"):
                        h: Dict[str, Any] = {}
                        for child in item:
                            if child.text:
                                h[child.tag.lower().replace("new", "")] = child.text.strip()
                        h.update({k.lower(): v for k, v in item.attrib.items()})
                        if h:
                            hosts.append(h)
                return hosts
        except Exception as e:
            logger.warning(f"Host list path fetch failed: {e}")
        return []

    def _soap_get_path(self, action: str, tag: str) -> Optional[str]:
        xml_text = self._soap_call(action)
        if not xml_text:
            return None
        try:
            root = ElementTree.fromstring(xml_text)
            return root.findtext(f".//{tag}")
        except Exception as e:
            logger.warning(f"Failed parsing SOAP {action} response: {e}")
            return None

    @staticmethod
    def _parse_login_sid(xml_text: str) -> tuple[str, str]:
        root = ElementTree.fromstring(xml_text)
        sid = root.findtext("SID", default="0000000000000000")
        challenge = root.findtext("Challenge", default="")
        return sid, challenge

    @staticmethod
    def _build_response(challenge: str, password: str) -> str:
        # AVM challenge-response: MD5 of (challenge + '-' + password) encoded as UTF-16LE
        raw = f"{challenge}-{password}".encode("utf-16le")
        md5 = hashlib.md5(raw).hexdigest()
        return f"{challenge}-{md5}"

    def _fetch_meshlist(self, sid: str) -> Optional[Any]:
        # TR-064 mesh list path (preferred)
        mesh_path = self._soap_get_path("X_AVM-DE_GetMeshListPath", "NewX_AVM-DE_MeshListPath")
        if mesh_path:
            try:
                url = urljoin(f"http://{self.host}/", mesh_path)
                r = httpx.get(url, timeout=10)
                if r.status_code == 200 and r.text:
                    text = r.text.strip()
                    if text.startswith("{") or text.startswith("["):
                        return json.loads(text)
                    if text.startswith("<"):
                        return ElementTree.fromstring(text)
            except Exception as e:
                logger.warning(f"Failed fetching mesh list path {mesh_path}: {e}")

        endpoints = [
            f"http://{self.host}/meshlist.lua",
            f"http://{self.host}/meshlist.json",
            f"http://{self.host}/meshlist.xml",
        ]
        for url in endpoints:
            try:
                r = httpx.get(url, params={"sid": sid}, timeout=10)
                if r.status_code != 200 or not r.text:
                    continue
                text = r.text.strip()
                if text.startswith("{") or text.startswith("["):
                    return json.loads(text)
                if text.startswith("<"):
                    return ElementTree.fromstring(text)
            except Exception as e:
                logger.warning(f"Failed fetching {url}: {e}")
                continue
        return None

    @staticmethod
    def _extract_nodes(mesh: Any) -> List[Dict[str, Any]]:
        nodes: List[Dict[str, Any]] = []
        if mesh is None:
            return nodes

        if isinstance(mesh, dict):
            if "nodes" in mesh and isinstance(mesh["nodes"], list):
                return mesh["nodes"]
            if "mesh" in mesh and isinstance(mesh["mesh"], list):
                return mesh["mesh"]
            if "meshlist" in mesh and isinstance(mesh["meshlist"], dict):
                for key in ("nodes", "devices"):
                    if key in mesh["meshlist"] and isinstance(mesh["meshlist"][key], list):
                        return mesh["meshlist"][key]
        if hasattr(mesh, "tag"):
            # XML fallback: look for node/device elements
            for elem in mesh.iter():
                if elem.tag.lower() in ("node", "device"):
                    data = elem.attrib.copy()
                    # add child text values
                    for child in elem:
                        if child.text and child.text.strip():
                            data[child.tag] = child.text.strip()
                    nodes.append(data)
        return nodes

    @staticmethod
    def _get_parent_ref(node: Dict[str, Any]) -> Optional[str]:
        for key in ("parent", "uplink", "parent_uid", "uplink_uid", "mesh_parent", "uplink_mac", "parent_mac"):
            if node.get(key):
                return str(node.get(key))
        return None

    @staticmethod
    def _find_ci(db: Session, node: Dict[str, Any]) -> Optional[ConfigurationItem]:
        # Direct fields first
        ip = node.get("ip") or node.get("ip_address") or node.get("ipv4_address")
        mac = node.get("mac") or node.get("mac_address") or node.get("MACAddress")
        name = node.get("name") or node.get("hostname") or node.get("device_name")

        # Fritz!Box mesh: IP and MAC are inside node_interfaces
        for iface in node.get("node_interfaces", []):
            if not ip:
                ip = iface.get("ipv4_address") or iface.get("ipv6_address")
            if not mac:
                mac = iface.get("mac_address")

        if ip:
            ci = db.query(ConfigurationItem).filter(ConfigurationItem.ip_address == ip).first()
            if ci:
                return ci
        if mac:
            ci = db.query(ConfigurationItem).filter(ConfigurationItem.mac_address == str(mac).upper()).first()
            if ci:
                return ci
        if name:
            return db.query(ConfigurationItem).filter(ConfigurationItem.name == name).first()
        return None

    def _create_relationship(self, db: Session, src_ci, dst_ci, description: str, actor: str) -> bool:
        """Create a connects_to relationship if it doesn't exist. Returns True if created."""
        exists = db.query(Relationship).filter(
            Relationship.source_id == src_ci.id,
            Relationship.target_id == dst_ci.id,
            Relationship.relationship_type == "connects_to",
        ).first()
        if exists:
            return False
        db.add(Relationship(
            source_id=src_ci.id,
            target_id=dst_ci.id,
            relationship_type="connects_to",
            description=description,
        ))
        db.add(AuditLog(
            ci_id=src_ci.id,
            action="rel_created",
            actor=actor,
            description=f"{description}: {src_ci.name} connects_to {dst_ci.name}",
        ))
        return True

    def sync_mesh(self, db: Session, actor: str = "system") -> Dict[str, Any]:
        if not self.enabled or not self.host:
            return {"message": "FRITZ!Box sync disabled or not configured", "created": 0}

        created = 0
        updated = 0
        nodes: List[Dict[str, Any]] = []
        try:
            sid = self._get_sid()
            mesh = self._fetch_meshlist(sid)
            nodes = self._extract_nodes(mesh)

            # Build lookup by uid (Fritz!Box mesh uses uid)
            by_uid: Dict[str, Dict[str, Any]] = {}
            by_mac: Dict[str, Dict[str, Any]] = {}
            for n in nodes:
                uid = str(n.get("uid") or n.get("id") or n.get("uniqueid") or "").strip()
                if uid:
                    by_uid[uid] = n
                mac = n.get("mac") or n.get("mac_address") or n.get("MACAddress")
                # Also check node_interfaces for MAC
                for iface in n.get("node_interfaces", []):
                    if not mac:
                        mac = iface.get("mac_address")
                if mac:
                    by_mac[str(mac).upper()] = n

            # Strategy 1: Fritz!Box mesh node_links (AVM native mesh JSON format)
            # Each node has node_interfaces[], each interface has node_links[]
            # Each link defines node_1_uid <-> node_2_uid connection
            seen_link_pairs: set = set()
            for node in nodes:
                for iface in node.get("node_interfaces", []):
                    for link in iface.get("node_links", []):
                        uid1 = link.get("node_1_uid", "")
                        uid2 = link.get("node_2_uid", "")
                        if not uid1 or not uid2:
                            continue
                        pair = tuple(sorted([uid1, uid2]))
                        if pair in seen_link_pairs:
                            continue
                        seen_link_pairs.add(pair)
                        n1 = by_uid.get(uid1)
                        n2 = by_uid.get(uid2)
                        if not n1 or not n2:
                            continue
                        ci1 = self._find_ci(db, n1)
                        ci2 = self._find_ci(db, n2)
                        if ci1 and ci2 and ci1.id != ci2.id:
                            if self._create_relationship(db, ci1, ci2, "FRITZ!Box mesh", actor):
                                created += 1

            # Strategy 2: Legacy parent/uplink field (older Fritz!Box firmware or other routers)
            if created == 0:
                for n in nodes:
                    parent_ref = self._get_parent_ref(n)
                    if not parent_ref:
                        continue
                    parent = by_uid.get(str(parent_ref)) or by_mac.get(str(parent_ref).upper())
                    if not parent:
                        continue
                    src_ci = self._find_ci(db, n)
                    dst_ci = self._find_ci(db, parent)
                    if src_ci and dst_ci and src_ci.id != dst_ci.id:
                        if self._create_relationship(db, src_ci, dst_ci, "FRITZ!Box mesh", actor):
                            created += 1

            db.commit()
        except Exception as e:
            logger.warning(f"FRITZ!Box sync failed: {e}")
            db.rollback()
            result = {"message": f"FRITZ!Box sync failed: {e}", "created": created, "nodes": len(nodes)}
        else:
            result = {"message": "FRITZ!Box mesh sync completed", "created": created, "updated": updated, "nodes": len(nodes)}

        # Save status
        now = datetime.now(timezone.utc).isoformat()
        for key, val in {
            "fritz_last_sync": now,
            "fritz_last_sync_result": json.dumps(result),
        }.items():
            s = db.query(AppSettings).filter(AppSettings.key == key).first()
            if s:
                s.value = str(val)
            else:
                db.add(AppSettings(key=key, value=str(val)))
        db.commit()
        return result

    def sync_hosts(self, db: Session, actor: str = "system") -> Dict[str, Any]:
        """Sync all hosts visible to the Fritz!Box as connects_to relationships.

        Priority:
        1. TR-064 GetGenericHostEntry iteration (works on every Fritz!Box)
        2. X_AVM-DE_GetHostListPath JSON endpoint
        3. Mesh list fallback
        Each matching CI gets a 'connects_to' relationship to the Fritz!Box CI.
        """
        if not self.enabled or not self.host:
            return {"message": "FRITZ!Box sync disabled or not configured", "created": 0}

        created = 0
        matched = 0
        hosts: List[Dict[str, Any]] = []
        method_used = "none"

        try:
            # Find or create the Fritz!Box router CI in the CMDB
            router_ci = (
                db.query(ConfigurationItem).filter(ConfigurationItem.ip_address == self.host).first()
                or db.query(ConfigurationItem).filter(ConfigurationItem.hostname.ilike("%fritz%")).first()
                or db.query(ConfigurationItem).filter(ConfigurationItem.name.ilike("%fritz%")).first()
            )
            if not router_ci:
                router_ci = ConfigurationItem(
                    name="FRITZ!Box",
                    ci_type="router",
                    status="active",
                    ip_address=self.host,
                    hostname="fritz.box",
                    description="Auto-created by FRITZ!Box host sync",
                )
                db.add(router_ci)
                db.flush()
                db.add(AuditLog(
                    ci_id=router_ci.id,
                    action="created",
                    actor=actor,
                    description="FRITZ!Box CI auto-created during host sync",
                ))
                logger.info(f"Auto-created Fritz!Box CI for {self.host}")

            # 1. TR-064 host iteration (works without mesh, no SID needed)
            tr064_hosts = self._get_all_hosts_tr064()
            if tr064_hosts:
                hosts = tr064_hosts
                method_used = "tr064_hosts"

            # 2. Host list path via SID
            if not hosts:
                try:
                    sid = self._get_sid()
                    hosts = self._get_host_list_via_path(sid)
                    if hosts:
                        method_used = "host_list_path"
                except Exception as e:
                    logger.warning(f"Host list path failed: {e}")

            # 3. Mesh list fallback
            if not hosts:
                try:
                    sid = self._get_sid()
                    mesh = self._fetch_meshlist(sid)
                    hosts = self._extract_nodes(mesh)
                    if hosts:
                        method_used = "meshlist"
                except Exception as e:
                    logger.warning(f"Mesh fallback failed: {e}")

            for host in hosts:
                # Normalize field names from different sources
                norm = {
                    "ip": host.get("ip") or host.get("IP") or host.get("ipaddress") or host.get("NewIPAddress", ""),
                    "mac": host.get("mac") or host.get("MAC") or host.get("macaddress") or host.get("NewMACAddress", ""),
                    "name": host.get("name") or host.get("hostname") or host.get("HostName") or host.get("NewHostName", ""),
                }
                device_ci = self._find_ci(db, norm)
                if not device_ci:
                    continue
                matched += 1
                if router_ci and device_ci.id != router_ci.id:
                    if self._create_relationship(db, device_ci, router_ci, "FRITZ!Box host", actor):
                        created += 1

            db.commit()
            result = {
                "message": f"Host sync completed (method: {method_used})",
                "created": created,
                "hosts_found": len(hosts),
                "matched_cis": matched,
                "router_ci": router_ci.name if router_ci else "not found in CMDB",
            }
        except Exception as e:
            logger.warning(f"FRITZ!Box host sync failed: {e}")
            db.rollback()
            result = {
                "message": f"FRITZ!Box host sync failed: {e}",
                "created": created,
                "hosts_found": len(hosts),
            }

        now = datetime.now(timezone.utc).isoformat()
        for key, val in {
            "fritz_last_sync": now,
            "fritz_last_sync_result": json.dumps(result),
        }.items():
            s = db.query(AppSettings).filter(AppSettings.key == key).first()
            if s:
                s.value = str(val)
            else:
                db.add(AppSettings(key=key, value=str(val)))
        db.commit()
        return result

    def diagnose(self) -> Dict[str, Any]:
        result: Dict[str, Any] = {
            "host": self.host,
            "enabled": self.enabled,
            "has_user": bool(self.username),
            "has_password": bool(self.password),
        }

        # SID login
        try:
            sid = self._get_sid()
            result["sid_ok"] = True
        except Exception as e:
            result["sid_ok"] = False
            result["sid_error"] = str(e)
            return result

        # TR-064 host count (works on every Fritz!Box, no mesh needed)
        try:
            host_count = self._get_host_count()
            result["tr064_host_count"] = host_count
            if host_count > 0:
                # Fetch first 3 as preview
                preview = []
                for i in range(min(3, host_count)):
                    h = self._get_host_by_index(i)
                    if h:
                        preview.append({k: v for k, v in h.items() if k in ("ip", "mac", "name", "active", "interface_type")})
                result["tr064_host_preview"] = preview
        except Exception as e:
            result["tr064_error"] = str(e)

        # Host list path
        host_list_path = self._soap_get_path("X_AVM-DE_GetHostListPath", "NewX_AVM-DE_HostListPath")
        result["host_list_path"] = host_list_path
        if host_list_path:
            try:
                hosts = self._get_host_list_via_path(sid)
                result["host_list_count"] = len(hosts)
            except Exception as e:
                result["host_list_error"] = str(e)

        # Mesh path (optional — not available on all models)
        mesh_path = self._soap_get_path("X_AVM-DE_GetMeshListPath", "NewX_AVM-DE_MeshListPath")
        result["mesh_path"] = mesh_path

        status_checks = {}
        for url in [
            f"http://{self.host}/meshlist.lua",
            f"http://{self.host}/meshlist.json",
            f"http://{self.host}/meshlist.xml",
        ]:
            try:
                r = httpx.get(url, params={"sid": sid}, timeout=5)
                status_checks[url] = r.status_code
            except Exception as e:
                status_checks[url] = f"error: {e}"
        result["meshlist_status"] = status_checks

        if mesh_path:
            try:
                mesh = self._fetch_meshlist(sid)
                nodes = self._extract_nodes(mesh)
                result["nodes"] = len(nodes)
                if isinstance(mesh, dict):
                    result["mesh_keys"] = list(mesh.keys())[:10]
            except Exception as e:
                result["mesh_error"] = str(e)
        else:
            result["nodes"] = 0

        return result

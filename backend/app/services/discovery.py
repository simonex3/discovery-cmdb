"""Network discovery service using nmap."""
import logging
import json
import subprocess
import socket
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.orm import Session
from app.models.ci import ConfigurationItem
from app.models.relationship import Relationship
from app.models.user import AppSettings
from app.models.audit import AuditLog

logger = logging.getLogger(__name__)

# Global discovery state shared between threads
DISCOVERY_STATE: dict = {
    "running": False,
    "cidr": None,
    "started_at": None,
    "completed_at": None,
    "actor": "system",
    "result": None,
    "error": None,
    "hosts_processed": 0,
    "hosts_found": 0,
}

MAC_VENDOR_PREFIXES = {
    "00:50:56": "VMware", "00:0c:29": "VMware", "08:00:27": "VirtualBox",
    "b8:27:eb": "Raspberry Pi Foundation", "dc:a6:32": "Raspberry Pi Foundation",
    "e4:5f:01": "Raspberry Pi Foundation", "d8:3a:dd": "Raspberry Pi Foundation",
    "00:1a:4b": "FRITZ!Box AVM", "ac:81:12": "AVM GmbH",
    "f0:9f:c2": "Ubiquiti", "00:15:6d": "Ubiquiti",
    "18:e8:29": "TP-Link", "54:c9:df": "TP-Link",
    "3c:18:a0": "Synology", "00:11:32": "Synology",
}


def _get_vendor(mac: Optional[str]) -> Optional[str]:
    if not mac:
        return None
    prefix = mac[:8].lower().replace("-", ":")
    return MAC_VENDOR_PREFIXES.get(prefix)


def _clean_name(hostname: str, ip: str) -> str:
    """Return a clean display name: strip .fritz.box suffix, fall back to IP."""
    if not hostname:
        return ip
    # Strip Fritz!Box FQDN suffix
    name = hostname.replace(".fritz.box", "").replace(".local", "").strip()
    # If the result is just a MAC address pattern or UUID, use IP
    import re
    if re.fullmatch(r"[0-9a-fA-F]{12}", name):
        return ip
    if re.fullmatch(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}", name):
        return ip
    # IP-formatted hostname (e.g. 192-168-178-201) → use IP instead
    if re.fullmatch(r"\d{1,3}[-\.]\d{1,3}[-\.]\d{1,3}[-\.]\d{1,3}", name):
        return ip
    return name


def _infer_ci_type(host_info: dict) -> str:
    """Infer CI type from nmap host data using OS, hostname, vendor and open ports."""
    osmatch = host_info.get("osmatch", [{}])
    os_name = osmatch[0].get("name", "").lower() if osmatch else ""
    hostname = (host_info.get("hostname") or "").lower()
    ip = host_info.get("ip", "")
    vendor = (host_info.get("vendor") or "").lower()
    ports = [str(p.get("portid", "")) for p in host_info.get("ports", [])]
    mac = (host_info.get("mac") or "").lower()

    # --- Routers / Firewalls: only actual network infrastructure ---
    # Fritz!Box itself is .1 or explicitly matched by OS/vendor
    if any(kw in os_name for kw in ["router", "fritzbox", "openwrt", "dd-wrt", "cisco ios", "mikrotik"]):
        return "router"
    if any(kw in vendor for kw in ["avm", "fritzbox", "ubiquiti", "cisco", "mikrotik", "netgear", "asus rt"]):
        return "router"
    if ip.endswith(".1") or ip.endswith(".254"):
        return "router"

    # --- Switches ---
    if any(kw in os_name for kw in ["switch", "cisco catalyst", "hp procurve"]):
        return "switch"

    # --- Access Points ---
    if any(kw in hostname for kw in ["repeater", "ap-", "-ap", "wlan", "wifi", "access_point"]):
        return "access_point"
    if any(kw in vendor for kw in ["tp-link", "unifi", "eap-"]):
        return "access_point"

    # --- NAS ---
    if any(kw in hostname for kw in ["nas", "synology", "qnap", "diskstation", "ds2", "ds4"]):
        return "nas"
    if any(kw in vendor for kw in ["synology", "qnap", "western digital", "wd my"]):
        return "nas"

    # --- Servers (Linux with SSH/web, Windows Server) ---
    if any(kw in os_name for kw in ["windows server"]):
        return "server"
    if "linux" in os_name and any(p in ports for p in ["22", "8006", "8080", "8443"]):
        return "server"
    if "22" in ports and not any(kw in os_name for kw in ["android", "ios", "windows 10", "windows 11", "macos"]):
        return "server"
    if any(kw in hostname for kw in ["server", "srv", "tower", "unraid", "proxmox", "esxi", "nas"]):
        return "server"

    # --- Desktops / Laptops ---
    if any(kw in os_name for kw in ["windows 10", "windows 11"]):
        if any(kw in hostname for kw in ["laptop", "thinkpad", "ideapad", "macbook", "notebook", "book"]):
            return "laptop"
        return "desktop"
    if any(kw in os_name for kw in ["macos", "mac os"]):
        if any(kw in hostname for kw in ["macbook", "book"]):
            return "laptop"
        return "desktop"
    if any(kw in hostname for kw in ["macbook", "thinkpad", "ideapad", "laptop", "notebook"]):
        return "laptop"
    if any(kw in hostname for kw in ["imac", "mac-mini", "desktop", "pc-", "-pc"]):
        return "desktop"
    if any(kw in vendor for kw in ["apple", "lenovo", "dell", "hp", "asus"]):
        if any(kw in hostname for kw in ["book", "pad"]):
            return "laptop"
        if "80" in ports or "443" in ports:
            return "desktop"

    # --- Mobile ---
    if any(kw in os_name for kw in ["android", "ios"]):
        return "mobile"
    if any(kw in hostname for kw in ["iphone", "ipad", "android", "galaxy", "pixel", "s24", "s23", "s22"]):
        return "mobile"

    # --- IoT (smart home, sensors, small embedded) ---
    if any(kw in hostname for kw in [
        "esp", "esp8266", "esp32", "arduino", "tasmota", "shelly",
        "sonos", "amazon", "echo", "alexa", "ring", "nest", "hue",
        "tplink", "kasa", "homekit", "hass", "zigbee", "zwave",
        "philips", "denon", "yamaha", "kenwood", "loewe", "avr",
        "thingsturn", "smart", "plug", "bulb", "cam", "doorbell",
        "xiaomi", "mi-", "tuya", "govee",
    ]):
        return "iot"
    if any(kw in vendor for kw in [
        "espressif", "amazon", "sonos", "philips", "xiaomi", "denon",
        "ring", "nest", "belkin", "wemo", "tp-link", "shelly",
    ]):
        return "iot"

    # --- Services / Containers ---
    if any(kw in hostname for kw in ["docker", "container", "service", "app-"]):
        return "container"

    # --- Catch-all: open web port with no other classification → other ---
    if "80" in ports or "443" in ports:
        return "other"

    return "other"


def _scan_with_nmap(cidr: str) -> list:
    """Run nmap and return list of host dicts."""
    try:
        import nmap
        nm = nmap.PortScanner()
        nm.scan(
            hosts=cidr,
            arguments="-sV --osscan-guess --max-os-tries 1 -T4 --open -p 22,23,80,443,445,3389,8080,8443,8006,5000,8123,1883,9000,9090,3000,5001",
            timeout=300,
        )
        results = []
        for host in nm.all_hosts():
            info = nm[host]
            ports = []
            tcp = info.get("tcp", {})
            for port_num, port_data in tcp.items():
                if port_data.get("state") == "open":
                    ports.append({
                        "port": port_num,
                        "protocol": "tcp",
                        "service": port_data.get("name", ""),
                    })
            results.append({
                "ip": host,
                "hostname": info.hostname() or "",
                "state": info.state(),
                "mac": info.get("addresses", {}).get("mac", ""),
                "vendor": list(info.get("vendor", {}).values())[0] if info.get("vendor") else None,
                "osmatch": info.get("osmatch", []),
                "ports": ports,
            })
        return results
    except ImportError:
        return _scan_with_subprocess(cidr)
    except Exception as e:
        logger.error(f"nmap scan error: {e}")
        return _scan_with_subprocess(cidr)


def _scan_with_subprocess(cidr: str) -> list:
    """Fallback: use subprocess ping sweep."""
    try:
        # Parse CIDR and ping each host
        import ipaddress
        network = ipaddress.ip_network(cidr, strict=False)
        results = []
        for host in list(network.hosts())[:254]:  # Limit to /24 equiv
            ip = str(host)
            try:
                result = subprocess.run(
                    ["ping", "-c", "1", "-W", "1", ip],
                    capture_output=True, timeout=2
                )
                if result.returncode == 0:
                    try:
                        hostname = socket.gethostbyaddr(ip)[0]
                    except Exception:
                        hostname = ""
                    results.append({"ip": ip, "hostname": hostname, "state": "up", "mac": "", "vendor": None, "osmatch": [], "ports": []})
            except Exception:
                pass
        return results
    except Exception as e:
        logger.error(f"Fallback scan error: {e}")
        return []


def _get_setting(db: Session, key: str, default: Optional[str] = None) -> Optional[str]:
    setting = db.query(AppSettings).filter(AppSettings.key == key).first()
    return setting.value if setting else default


def _find_ci(db: Session, criteria: dict) -> Optional[ConfigurationItem]:
    if not criteria:
        return None
    if criteria.get("id"):
        try:
            import uuid
            return db.query(ConfigurationItem).filter(ConfigurationItem.id == uuid.UUID(str(criteria["id"]))).first()
        except Exception:
            return None
    if criteria.get("ip"):
        return db.query(ConfigurationItem).filter(ConfigurationItem.ip_address == criteria["ip"]).first()
    if criteria.get("hostname"):
        return db.query(ConfigurationItem).filter(ConfigurationItem.hostname == criteria["hostname"]).first()
    if criteria.get("name"):
        return db.query(ConfigurationItem).filter(ConfigurationItem.name == criteria["name"]).first()
    return None


def _apply_relationship_hints(db: Session, actor: str = "system") -> None:
    raw = _get_setting(db, "relationship_hints")
    if not raw:
        return
    try:
        hints = json.loads(raw)
    except Exception as e:
        logger.warning(f"Invalid relationship_hints JSON: {e}")
        return
    if not isinstance(hints, list):
        logger.warning("relationship_hints must be a JSON array")
        return

    created = 0
    for hint in hints:
        if not isinstance(hint, dict):
            continue
        rel_type = hint.get("type") or "connects_to"
        source = _find_ci(db, {
            "id": hint.get("source_id"),
            "ip": hint.get("source_ip"),
            "hostname": hint.get("source_hostname"),
            "name": hint.get("source_name"),
        })
        target = _find_ci(db, {
            "id": hint.get("target_id"),
            "ip": hint.get("target_ip"),
            "hostname": hint.get("target_hostname"),
            "name": hint.get("target_name"),
        })
        if not source or not target:
            continue
        existing = db.query(Relationship).filter(
            Relationship.source_id == source.id,
            Relationship.target_id == target.id,
            Relationship.relationship_type == rel_type,
        ).first()
        if existing:
            continue
        rel = Relationship(
            source_id=source.id,
            target_id=target.id,
            relationship_type=rel_type,
            description=hint.get("description"),
        )
        db.add(rel)
        db.add(AuditLog(
            ci_id=source.id,
            action="rel_created",
            actor=actor,
            description=f"Relationship created: {source.name} {rel_type} {target.name}",
        ))
        created += 1
    if created:
        db.commit()


class DiscoveryService:

    @staticmethod
    def scan_network(cidr: str, db: Session, actor: str = "system") -> dict:
        DISCOVERY_STATE.update({
            "running": True,
            "cidr": cidr,
            "started_at": datetime.now(timezone.utc).isoformat(),
            "completed_at": None,
            "actor": actor,
            "result": None,
            "error": None,
            "hosts_processed": 0,
            "hosts_found": 0,
        })
        discovered_new = 0
        updated = 0
        failed = 0

        try:
            logger.info(f"Starting network discovery for {cidr}")
            hosts = _scan_with_nmap(cidr)
            logger.info(f"Scan complete: {len(hosts)} hosts found")

            for host in hosts:
                DISCOVERY_STATE["hosts_processed"] += 1
                if host.get("state") != "up":
                    continue
                try:
                    ip = host["ip"]
                    mac = host.get("mac", "").upper() or None
                    hostname = host.get("hostname") or None
                    vendor = host.get("vendor") or _get_vendor(mac)
                    osmatch = host.get("osmatch", [])
                    os_name = osmatch[0].get("name") if osmatch else None

                    # Find existing CI by IP or MAC
                    existing = None
                    if ip:
                        existing = db.query(ConfigurationItem).filter(ConfigurationItem.ip_address == ip).first()
                    if not existing and mac:
                        existing = db.query(ConfigurationItem).filter(ConfigurationItem.mac_address == mac).first()

                    now = datetime.now(timezone.utc)

                    if existing:
                        changes = {}
                        if hostname and existing.hostname != hostname:
                            changes["hostname"] = {"old": existing.hostname, "new": hostname}
                            existing.hostname = hostname
                        if mac and existing.mac_address != mac:
                            existing.mac_address = mac
                        if vendor and not existing.manufacturer:
                            existing.manufacturer = vendor
                        if os_name and not existing.os:
                            existing.os = os_name
                        if host.get("ports"):
                            existing.open_ports = host["ports"]
                        existing.last_seen = now
                        existing.last_discovered = now
                        if existing.health_status in ("unknown", "down"):
                            existing.health_status = "healthy"
                        db.add(AuditLog(
                            ci_id=existing.id, action="discovered",
                            actor=actor, description=f"Re-discovered {ip}",
                            changes=changes or None,
                        ))
                        updated += 1
                        DISCOVERY_STATE["hosts_found"] += 1
                    else:
                        ci_type = _infer_ci_type(host)
                        name = _clean_name(hostname, ip) if hostname else ip
                        ci = ConfigurationItem(
                            name=name,
                            ci_type=ci_type,
                            ip_address=ip,
                            mac_address=mac,
                            hostname=hostname,
                            manufacturer=vendor,
                            os=os_name,
                            open_ports=host.get("ports") or None,
                            status="active",
                            health_status="healthy",
                            last_seen=now,
                            last_discovered=now,
                        )
                        db.add(ci)
                        db.flush()
                        db.add(AuditLog(
                            ci_id=ci.id, action="discovered",
                            actor=actor, description=f"New CI discovered: {ip} ({ci_type})",
                        ))
                        discovered_new += 1
                        DISCOVERY_STATE["hosts_found"] += 1

                    db.commit()

                except Exception as e:
                    logger.error(f"Error processing host {host}: {e}")
                    failed += 1
                    db.rollback()

        except Exception as e:
            logger.error(f"Discovery scan failed: {e}")
            DISCOVERY_STATE["error"] = str(e)
            failed += 1
        finally:
            result = {
                "cidr": cidr,
                "hosts_found": len(hosts) if "hosts" in locals() else 0,
                "discovered_new": discovered_new,
                "updated": updated,
                "failed": failed,
                "completed_at": datetime.now(timezone.utc).isoformat(),
            }
            DISCOVERY_STATE.update({
                "running": False,
                "completed_at": result["completed_at"],
                "result": result,
            })
            try:
                _apply_relationship_hints(db, actor=actor)
            except Exception as e:
                logger.warning(f"Failed applying relationship hints: {e}")
            try:
                from app.services.fritzbox import FritzBoxService
                svc = FritzBoxService.from_settings(db)
                if svc.enabled and svc.host:
                    svc.sync_netdev(db, actor=actor)
            except Exception as e:
                logger.warning(f"Fritz!Box netdev auto-sync after discovery failed: {e}")
            logger.info(f"Discovery complete: {result}")

        return result

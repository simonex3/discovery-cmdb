"""Health monitoring service — ping and port checks."""
import logging
import socket
import subprocess
import platform
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.orm import Session
from app.models.ci import ConfigurationItem
from app.models.audit import AuditLog

logger = logging.getLogger(__name__)


def ping_host(ip: str, timeout: int = 2) -> bool:
    """Ping a host. Returns True if reachable."""
    try:
        # Try icmplib first
        from icmplib import ping as icmp_ping
        result = icmp_ping(ip, count=1, timeout=timeout, privileged=True)
        return result.is_alive
    except Exception:
        pass

    # Fallback: subprocess ping
    try:
        if platform.system() == "Windows":
            cmd = ["ping", "-n", "1", "-w", str(timeout * 1000), ip]
        else:
            cmd = ["ping", "-c", "1", "-W", str(timeout), ip]
        result = subprocess.run(cmd, capture_output=True, timeout=timeout + 2)
        return result.returncode == 0
    except Exception:
        return False


def check_port(ip: str, port: int, timeout: int = 2) -> bool:
    """TCP connect check."""
    try:
        with socket.create_connection((ip, port), timeout=timeout):
            return True
    except Exception:
        return False


def determine_health(ci: ConfigurationItem) -> str:
    """Determine health status for a CI with an IP address."""
    if not ci.ip_address:
        return "unknown"

    is_up = ping_host(ci.ip_address)
    if not is_up:
        return "down"

    # Check a key port if we have open_ports info
    if ci.open_ports:
        ports_checked = 0
        ports_ok = 0
        for port_info in ci.open_ports[:3]:  # Check max 3 ports
            port = port_info.get("port")
            if port and isinstance(port, int):
                ports_checked += 1
                if check_port(ci.ip_address, port):
                    ports_ok += 1
        if ports_checked > 0 and ports_ok < ports_checked:
            return "degraded"

    return "healthy"


class MonitoringService:

    @staticmethod
    def check_health(ci: ConfigurationItem, db: Session) -> str:
        if not ci.ip_address:
            return ci.health_status

        new_status = determine_health(ci)
        old_status = ci.health_status
        now = datetime.now(timezone.utc)

        if new_status != old_status:
            logger.info(f"Health change for {ci.name} ({ci.ip_address}): {old_status} → {new_status}")
            ci.health_status = new_status
            db.add(AuditLog(
                ci_id=ci.id,
                action="health_changed",
                actor="monitor",
                description=f"Health status changed: {old_status} → {new_status}",
                changes={"health_status": {"old": old_status, "new": new_status}},
            ))

        if new_status != "down":
            ci.last_seen = now

        db.commit()
        return new_status

    @staticmethod
    def run_health_checks(db: Session):
        """Run health checks for all active CIs with IP addresses."""
        cis = db.query(ConfigurationItem).filter(
            ConfigurationItem.ip_address.isnot(None),
            ConfigurationItem.status == "active",
        ).all()

        logger.info(f"Running health checks for {len(cis)} CIs")
        healthy = degraded = down = 0

        for ci in cis:
            try:
                status = MonitoringService.check_health(ci, db)
                if status == "healthy": healthy += 1
                elif status == "degraded": degraded += 1
                elif status == "down": down += 1
            except Exception as e:
                logger.error(f"Health check failed for {ci.name}: {e}")

        logger.info(f"Health checks done: {healthy} healthy, {degraded} degraded, {down} down")

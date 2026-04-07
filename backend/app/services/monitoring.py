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


def _fire_webhook(db: Session, ci: ConfigurationItem) -> None:
    """POST to configured webhook URL when a device goes down."""
    try:
        from app.models.user import AppSettings
        setting = db.query(AppSettings).filter(AppSettings.key == "webhook_url").first()
        if not setting or not setting.value:
            return
        import httpx, json
        payload = {
            "event": "device_down",
            "ci": {"id": str(ci.id), "name": ci.name, "ip": ci.ip_address, "type": ci.ci_type},
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        httpx.post(setting.value, json=payload, timeout=5)
        logger.info(f"Webhook fired for {ci.name} down event")
    except Exception as e:
        logger.warning(f"Webhook failed: {e}")


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
            # Fire webhook + email if device went down or degraded
            if new_status in ("down", "degraded"):
                _fire_webhook(db, ci)
                try:
                    from app.services.notifications import notify_device_down
                    notify_device_down(db, ci.name, ci.ip_address or "", new_status, str(ci.id))
                except Exception as _ne:
                    logger.warning(f"Email notification failed: {_ne}")
                try:
                    import asyncio
                    from app.services.servicenow import ServiceNowService
                    from app.api.v1.endpoints.setup import get_setting
                    svc = ServiceNowService(
                        instance_url=get_setting(db, "sn_instance_url", ""),
                        username=get_setting(db, "sn_username", ""),
                        password=get_setting(db, "sn_password", ""),
                    )
                    incident_sys_id = asyncio.run(svc.notify_ci_down(ci.name, ci.ip_address or "", ci.servicenow_sys_id, new_status))
                    if incident_sys_id:
                        props = dict(ci.properties or {})
                        props["sn_incident_sys_id"] = incident_sys_id
                        ci.properties = props
                        db.commit()
                except Exception as _sne:
                    logger.warning(f"ServiceNow down-notification failed: {_sne}")

            elif new_status == "healthy" and old_status in ("down", "degraded"):
                try:
                    import asyncio
                    from app.services.servicenow import ServiceNowService
                    from app.api.v1.endpoints.setup import get_setting
                    svc = ServiceNowService(
                        instance_url=get_setting(db, "sn_instance_url", ""),
                        username=get_setting(db, "sn_username", ""),
                        password=get_setting(db, "sn_password", ""),
                    )
                    asyncio.run(svc.notify_ci_recovered(ci.name, ci.servicenow_sys_id))
                except Exception as _sne:
                    logger.warning(f"ServiceNow recovery-notification failed: {_sne}")

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

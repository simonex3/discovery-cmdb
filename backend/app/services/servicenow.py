"""ServiceNow bidirectional sync service."""
import logging
from datetime import datetime, timezone
from typing import Tuple
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


class ServiceNowService:
    def __init__(self, instance_url: str, username: str, password: str):
        self.instance_url = instance_url.rstrip("/") if instance_url else ""
        self.username = username
        self.password = password

    @property
    def _auth(self):
        return (self.username, self.password)

    async def test_connection(self) -> Tuple[bool, str]:
        if not self.instance_url:
            return False, "ServiceNow instance URL not configured"
        try:
            import httpx
            async with httpx.AsyncClient(auth=self._auth, timeout=10) as client:
                resp = await client.get(f"{self.instance_url}/api/now/table/cmdb_ci?sysparm_limit=1")
                if resp.status_code == 200:
                    return True, "Connection successful"
                return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        except Exception as e:
            return False, str(e)

    async def import_from_sn(self, db: Session, actor: str = "system") -> dict:
        """Import CIs from ServiceNow CMDB."""
        if not self.instance_url:
            return {"error": "Not configured", "imported": 0}
        try:
            import httpx
            from app.models.ci import ConfigurationItem
            from app.models.audit import AuditLog

            imported = 0
            updated = 0
            async with httpx.AsyncClient(auth=self._auth, timeout=30) as client:
                # Fetch cmdb_ci records
                resp = await client.get(
                    f"{self.instance_url}/api/now/table/cmdb_ci",
                    params={"sysparm_limit": 1000, "sysparm_fields": "sys_id,name,ip_address,mac_address,fqdn,manufacturer,model_id,os,sys_class_name,operational_status"}
                )
                if resp.status_code != 200:
                    return {"error": f"HTTP {resp.status_code}", "imported": 0}

                records = resp.json().get("result", [])
                for rec in records:
                    sys_id = rec.get("sys_id")
                    existing = db.query(ConfigurationItem).filter(ConfigurationItem.servicenow_sys_id == sys_id).first()

                    ci_type = _sn_class_to_type(rec.get("sys_class_name", ""))
                    name = rec.get("name") or rec.get("ip_address") or sys_id

                    if existing:
                        existing.name = name
                        existing.ip_address = rec.get("ip_address") or existing.ip_address
                        existing.os = rec.get("os") or existing.os
                        db.add(AuditLog(ci_id=existing.id, action="synced", actor=actor, description=f"Updated from ServiceNow"))
                        updated += 1
                    else:
                        ci = ConfigurationItem(
                            name=name,
                            ci_type=ci_type,
                            ip_address=rec.get("ip_address") or None,
                            mac_address=rec.get("mac_address") or None,
                            fqdn=rec.get("fqdn") or None,
                            manufacturer=rec.get("manufacturer") or None,
                            os=rec.get("os") or None,
                            servicenow_sys_id=sys_id,
                            status="active",
                        )
                        db.add(ci)
                        db.flush()
                        db.add(AuditLog(ci_id=ci.id, action="imported", actor=actor, description=f"Imported from ServiceNow (sys_id: {sys_id})"))
                        imported += 1

                db.commit()
            return {"imported": imported, "updated": updated}
        except Exception as e:
            logger.error(f"ServiceNow import failed: {e}")
            db.rollback()
            return {"error": str(e), "imported": 0}

    async def export_to_sn(self, db: Session, actor: str = "system") -> dict:
        """Export local CIs to ServiceNow."""
        if not self.instance_url:
            return {"error": "Not configured", "exported": 0}
        try:
            import httpx
            from app.models.ci import ConfigurationItem
            from app.models.audit import AuditLog

            exported = 0
            cis = db.query(ConfigurationItem).filter(ConfigurationItem.status == "active").all()

            async with httpx.AsyncClient(auth=self._auth, timeout=30) as client:
                for ci in cis:
                    payload = {
                        "name": ci.name,
                        "ip_address": ci.ip_address or "",
                        "mac_address": ci.mac_address or "",
                        "fqdn": ci.fqdn or "",
                        "manufacturer": ci.manufacturer or "",
                        "os": ci.os or "",
                        "short_description": ci.description or "",
                        "u_environment": ci.environment,
                    }
                    if ci.servicenow_sys_id:
                        # Update existing
                        resp = await client.put(
                            f"{self.instance_url}/api/now/table/cmdb_ci/{ci.servicenow_sys_id}",
                            json=payload,
                        )
                    else:
                        # Create new
                        resp = await client.post(
                            f"{self.instance_url}/api/now/table/cmdb_ci",
                            json=payload,
                        )
                        if resp.status_code in (200, 201):
                            sys_id = resp.json().get("result", {}).get("sys_id")
                            if sys_id:
                                ci.servicenow_sys_id = sys_id

                    if resp.status_code in (200, 201):
                        exported += 1

            db.commit()
            return {"exported": exported}
        except Exception as e:
            logger.error(f"ServiceNow export failed: {e}")
            db.rollback()
            return {"error": str(e), "exported": 0}

    async def notify_ci_down(self, ci_name: str, ci_ip: str, sys_id: str | None, health: str) -> str | None:
        """Update operational_status in ServiceNow and create an Incident when a CI goes down.
        Returns the sys_id of the created Incident, or None on failure."""
        if not self.instance_url:
            return None
        try:
            import httpx
            async with httpx.AsyncClient(auth=self._auth, timeout=10) as client:
                if sys_id:
                    await client.patch(
                        f"{self.instance_url}/api/now/table/cmdb_ci/{sys_id}",
                        json={"operational_status": "2"},
                    )

                resp = await client.post(
                    f"{self.instance_url}/api/now/table/incident",
                    json={
                        "short_description": f"CI down: {ci_name} ({ci_ip})",
                        "description": (
                            f"Health check detected status '{health}' for CI '{ci_name}' "
                            f"at {ci_ip}. Automatic alert from Discovery CMDB."
                        ),
                        "impact": "2",
                        "urgency": "2",
                        "category": "network",
                        "cmdb_ci": sys_id or "",
                    },
                )
                incident_sys_id = resp.json().get("result", {}).get("sys_id") if resp.status_code in (200, 201) else None
                logger.info(f"ServiceNow notified: CI down — {ci_name} ({health}), incident={incident_sys_id}")
                return incident_sys_id
        except Exception as e:
            logger.warning(f"ServiceNow down-notification failed for {ci_name}: {e}")
            return None

    async def notify_ci_maintenance(self, ci_name: str, ci_ip: str, sys_id: str | None) -> str | None:
        """Set operational_status to Repair in Progress and create a Change Request in ServiceNow.
        Returns the sys_id of the created Change Request, or None on failure."""
        if not self.instance_url:
            return None
        try:
            import httpx
            async with httpx.AsyncClient(auth=self._auth, timeout=10) as client:
                if sys_id:
                    await client.patch(
                        f"{self.instance_url}/api/now/table/cmdb_ci/{sys_id}",
                        json={"operational_status": "3"},
                    )

                resp = await client.post(
                    f"{self.instance_url}/api/now/table/change_request",
                    json={
                        "short_description": f"Planned maintenance: {ci_name} ({ci_ip})",
                        "description": (
                            f"Maintenance window started for CI '{ci_name}' at {ci_ip}. "
                            f"Triggered automatically by Discovery CMDB."
                        ),
                        "type": "maintenance",
                        "risk": "low",
                        "impact": "2",
                        "cmdb_ci": sys_id or "",
                    },
                )
                change_sys_id = resp.json().get("result", {}).get("sys_id") if resp.status_code in (200, 201) else None
                logger.info(f"ServiceNow notified: maintenance started — {ci_name}, change={change_sys_id}")
                return change_sys_id
        except Exception as e:
            logger.warning(f"ServiceNow maintenance-notification failed for {ci_name}: {e}")
            return None

    async def notify_ci_recovered(self, ci_name: str, sys_id: str | None) -> None:
        """Set operational_status back to Operational when a CI recovers."""
        if not self.instance_url or not sys_id:
            return
        try:
            import httpx
            async with httpx.AsyncClient(auth=self._auth, timeout=10) as client:
                await client.patch(
                    f"{self.instance_url}/api/now/table/cmdb_ci/{sys_id}",
                    json={"operational_status": "1"},
                )
                logger.info(f"ServiceNow notified: CI recovered — {ci_name}")
        except Exception as e:
            logger.warning(f"ServiceNow recovery-notification failed for {ci_name}: {e}")

    async def sync(self, db: Session, direction: str = "both", actor: str = "system") -> dict:
        result = {}
        if direction in ("import", "both"):
            result["import"] = await self.import_from_sn(db, actor)
        if direction in ("export", "both"):
            result["export"] = await self.export_to_sn(db, actor)

        # Save sync timestamp
        from app.api.v1.endpoints.setup import set_setting
        set_setting(db, "sn_last_sync", datetime.now(timezone.utc).isoformat())
        set_setting(db, "sn_last_sync_result", "success" if not result.get("error") else "error")
        return result


def _sn_class_to_type(sys_class: str) -> str:
    mapping = {
        "cmdb_ci_server": "server",
        "cmdb_ci_win_server": "server",
        "cmdb_ci_linux_server": "server",
        "cmdb_ci_netgear": "router",
        "cmdb_ci_ip_router": "router",
        "cmdb_ci_ip_switch": "switch",
        "cmdb_ci_firewall": "firewall",
        "cmdb_ci_database": "database",
        "cmdb_ci_appl": "service",
        "cmdb_ci_computer": "desktop",
        "cmdb_ci_printer": "printer",
        "cmdb_ci_storage_server": "nas",
        "cmdb_ci_vm_instance": "vm",
    }
    return mapping.get(sys_class, "other")

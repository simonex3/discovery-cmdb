"""Vulnerability scan endpoint — NVD API integration."""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.ci import ConfigurationItem
from app.models.user import AppSettings, User
from app.services.auth import require_user

router = APIRouter(prefix="/vulns", tags=["Vulnerability Scan"])


def _get_setting(db: Session, key: str, default: str = "") -> str:
    s = db.query(AppSettings).filter(AppSettings.key == key).first()
    return s.value if s else default


@router.get("/{ci_id}", summary="Scan CI for vulnerabilities")
def scan_ci_vulns(
    ci_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_user),
):
    """Scan a CI's open ports/OS against NVD CVE database.

    Note: This makes real HTTP requests to the NVD API and may take 30-60s
    depending on the number of open ports (rate limited to 5 req/30s without API key).
    """
    ci = db.query(ConfigurationItem).filter(ConfigurationItem.id == ci_id).first()
    if not ci:
        raise HTTPException(status_code=404, detail="CI not found")

    open_ports = [p.get("port") for p in (ci.open_ports or []) if isinstance(p.get("port"), int)]
    nvd_api_key = _get_setting(db, "nvd_api_key")

    from app.services.vuln import scan_ci_vulnerabilities
    result = scan_ci_vulnerabilities(
        open_ports=open_ports,
        os_name=ci.os,
        api_key=nvd_api_key or None,
        max_keywords=5,
    )
    return {
        "ci_id": ci_id,
        "ci_name": ci.name,
        "ip_address": ci.ip_address,
        "os": ci.os,
        "open_ports": open_ports,
        "vulnerabilities": result,
    }


@router.post("/quick", summary="Quick vulnerability check for ports")
def quick_vuln_check(
    ports: list[int],
    os_name: Optional[str] = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_user),
):
    """Quick check for a list of ports without a specific CI."""
    nvd_api_key = _get_setting(db, "nvd_api_key")
    from app.services.vuln import scan_ci_vulnerabilities
    return scan_ci_vulnerabilities(
        open_ports=ports,
        os_name=os_name,
        api_key=nvd_api_key or None,
        max_keywords=3,
    )

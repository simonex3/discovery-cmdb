"""Vulnerability scanning via NIST NVD API v2.0.

Maps open ports/services to known CVEs using the public NVD API.
No API key required for basic usage (rate limited to 5 req/30s without key).
"""
from __future__ import annotations

import logging
import time
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)

NVD_API_BASE = "https://services.nvd.nist.gov/rest/json/cves/2.0"

# Port → common service/product keyword mappings
PORT_SERVICE_MAP: Dict[int, List[str]] = {
    21: ["ftp", "vsftpd", "proftpd"],
    22: ["openssh", "ssh"],
    23: ["telnet"],
    25: ["sendmail", "postfix", "smtp"],
    53: ["bind", "named", "dns"],
    80: ["apache", "nginx", "iis", "http"],
    110: ["pop3", "dovecot"],
    143: ["imap", "dovecot"],
    443: ["apache", "nginx", "iis", "openssl", "tls"],
    445: ["samba", "smb", "cifs"],
    3306: ["mysql", "mariadb"],
    3389: ["rdp", "remote desktop", "windows terminal services"],
    5432: ["postgresql"],
    5900: ["vnc", "realvnc"],
    6379: ["redis"],
    8080: ["tomcat", "jetty", "http"],
    8443: ["tomcat", "https"],
    8006: ["proxmox"],
    8123: ["home assistant"],
    1883: ["mqtt", "mosquitto"],
    9000: ["portainer", "php-fpm"],
    9090: ["prometheus", "cockpit"],
    27017: ["mongodb"],
}

SEVERITY_ORDER = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3, "NONE": 4}


def _query_nvd(keyword: str, api_key: Optional[str] = None) -> List[Dict[str, Any]]:
    """Query NVD API for CVEs matching a keyword. Returns simplified list."""
    params = {
        "keywordSearch": keyword,
        "resultsPerPage": 10,
        "startIndex": 0,
    }
    headers = {}
    if api_key:
        headers["apiKey"] = api_key

    try:
        r = httpx.get(NVD_API_BASE, params=params, headers=headers, timeout=15)
        if r.status_code == 429:
            logger.warning("NVD API rate limited — waiting 35s")
            time.sleep(35)
            r = httpx.get(NVD_API_BASE, params=params, headers=headers, timeout=15)
        if r.status_code != 200:
            logger.warning(f"NVD API returned {r.status_code} for keyword '{keyword}'")
            return []
        data = r.json()
    except Exception as e:
        logger.warning(f"NVD API request failed for '{keyword}': {e}")
        return []

    vulns = []
    for item in data.get("vulnerabilities", []):
        cve = item.get("cve", {})
        cve_id = cve.get("id", "")
        descriptions = cve.get("descriptions", [])
        desc = next((d["value"] for d in descriptions if d.get("lang") == "en"), "")
        metrics = cve.get("metrics", {})
        severity = "UNKNOWN"
        score = None
        for metric_key in ("cvssMetricV31", "cvssMetricV30", "cvssMetricV2"):
            metric_list = metrics.get(metric_key, [])
            if metric_list:
                cvss_data = metric_list[0].get("cvssData", {})
                severity = cvss_data.get("baseSeverity", "UNKNOWN")
                score = cvss_data.get("baseScore")
                break
        published = cve.get("published", "")[:10]
        refs = [r.get("url", "") for r in cve.get("references", [])[:3]]
        vulns.append({
            "cve_id": cve_id,
            "description": desc[:300] if desc else "",
            "severity": severity,
            "score": score,
            "published": published,
            "references": refs,
        })

    return vulns


def scan_ci_vulnerabilities(
    open_ports: List[int],
    os_name: Optional[str] = None,
    api_key: Optional[str] = None,
    max_keywords: int = 5,
) -> Dict[str, Any]:
    """Scan a CI for vulnerabilities based on open ports and OS.

    Returns dict with {port: [cve_list], 'os': [cve_list], 'summary': {...}}.
    Rate-limited: sleeps 6s between NVD requests to avoid 429.
    """
    results: Dict[str, Any] = {"by_port": {}, "by_os": [], "summary": {}}
    keywords_checked = 0

    for port in open_ports:
        if keywords_checked >= max_keywords:
            break
        keywords = PORT_SERVICE_MAP.get(port)
        if not keywords:
            continue
        keyword = keywords[0]  # Use primary keyword only
        if keywords_checked > 0:
            time.sleep(6)  # NVD rate limit: 5 req/30s without key
        vulns = _query_nvd(keyword, api_key=api_key)
        if vulns:
            results["by_port"][str(port)] = vulns
        keywords_checked += 1

    if os_name and keywords_checked < max_keywords:
        os_keyword = _extract_os_keyword(os_name)
        if os_keyword:
            if keywords_checked > 0:
                time.sleep(6)
            vulns = _query_nvd(os_keyword, api_key=api_key)
            results["by_os"] = vulns
            keywords_checked += 1

    # Summary stats
    all_vulns = [v for port_vulns in results["by_port"].values() for v in port_vulns]
    all_vulns += results["by_os"]
    severity_counts: Dict[str, int] = {}
    for v in all_vulns:
        sev = v.get("severity", "UNKNOWN")
        severity_counts[sev] = severity_counts.get(sev, 0) + 1

    results["summary"] = {
        "total": len(all_vulns),
        "by_severity": severity_counts,
        "highest_severity": min(
            (v.get("severity", "NONE") for v in all_vulns),
            key=lambda s: SEVERITY_ORDER.get(s, 99),
            default="NONE",
        ) if all_vulns else "NONE",
    }
    return results


def _extract_os_keyword(os_name: str) -> Optional[str]:
    os_lower = os_name.lower()
    if "windows" in os_lower:
        return "windows server" if "server" in os_lower else "windows"
    if "ubuntu" in os_lower:
        return "ubuntu"
    if "debian" in os_lower:
        return "debian"
    if "centos" in os_lower:
        return "centos"
    if "rhel" in os_lower or "red hat" in os_lower:
        return "red hat enterprise linux"
    if "proxmox" in os_lower:
        return "proxmox"
    if "esxi" in os_lower or "vmware" in os_lower:
        return "vmware esxi"
    if "android" in os_lower:
        return "android"
    if "ios" in os_lower:
        return "apple ios"
    return None

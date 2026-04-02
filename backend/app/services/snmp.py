"""SNMP discovery service for network devices (switches, printers, APs)."""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# Standard SNMP OIDs
OID_SYSNAME = "1.3.6.1.2.1.1.5.0"
OID_SYSDESCR = "1.3.6.1.2.1.1.1.0"
OID_SYSLOCATION = "1.3.6.1.2.1.1.6.0"
OID_SYSCONTACT = "1.3.6.1.2.1.1.4.0"
OID_SYSUPTIME = "1.3.6.1.2.1.1.3.0"
OID_IFDESCR = "1.3.6.1.2.1.2.2.1.2"
OID_IFOPERSTATUS = "1.3.6.1.2.1.2.2.1.8"


def snmp_get(host: str, oids: List[str], community: str = "public", port: int = 161, timeout: int = 3) -> Dict[str, Any]:
    """Perform SNMP GET for a list of OIDs. Returns dict of oid -> value."""
    try:
        from pysnmp.hlapi import (
            SnmpEngine, CommunityData, UdpTransportTarget,
            ContextData, ObjectType, ObjectIdentity, getCmd
        )
    except ImportError:
        logger.warning("pysnmp not available — SNMP disabled")
        return {}

    result: Dict[str, Any] = {}
    engine = SnmpEngine()
    community_data = CommunityData(community, mpModel=1)  # v2c
    transport = UdpTransportTarget((host, port), timeout=timeout, retries=1)
    context = ContextData()

    object_types = [ObjectType(ObjectIdentity(oid)) for oid in oids]

    error_indication, error_status, error_index, var_binds = next(
        getCmd(engine, community_data, transport, context, *object_types)
    )

    if error_indication or error_status:
        return {}

    for var_bind in var_binds:
        oid_str = str(var_bind[0])
        val = var_bind[1]
        try:
            result[oid_str] = str(val)
        except Exception:
            result[oid_str] = repr(val)

    return result


def snmp_probe(host: str, community: str = "public", port: int = 161, timeout: int = 3) -> Optional[Dict[str, Any]]:
    """Probe a host via SNMP. Returns device info dict or None if unreachable."""
    data = snmp_get(
        host,
        [OID_SYSNAME, OID_SYSDESCR, OID_SYSLOCATION, OID_SYSCONTACT],
        community=community,
        port=port,
        timeout=timeout,
    )
    if not data:
        return None

    def _get(*keys: str) -> str:
        for k in keys:
            for oid_key, val in data.items():
                if k in oid_key and val and val not in ("None", ""):
                    return val
        return ""

    name = _get("1.5.0")
    descr = _get("1.1.0")
    location = _get("1.6.0")
    contact = _get("1.4.0")

    ci_type = _infer_type_from_snmp(name, descr)

    return {
        "hostname": name or host,
        "name": name or host,
        "description": descr,
        "location": location,
        "contact": contact,
        "ci_type": ci_type,
        "snmp_community": community,
    }


def _infer_type_from_snmp(name: str, descr: str) -> str:
    text = (name + " " + descr).lower()
    if any(k in text for k in ("switch", "catalyst", "procurve", "nexus", "powerconnect")):
        return "switch"
    if any(k in text for k in ("router", "gateway", "cisco ios", "junos")):
        return "router"
    if any(k in text for k in ("access point", "arubaos", "unifi", "ruckus", "ap ")):
        return "network_device"
    if any(k in text for k in ("printer", "laserjet", "inkjet", "mfp", "xerox", "epson", "canon")):
        return "printer"
    if any(k in text for k in ("ups", "uninterruptible")):
        return "other"
    if any(k in text for k in ("linux", "ubuntu", "debian", "centos", "rhel")):
        return "server"
    if any(k in text for k in ("windows")):
        return "server"
    return "network_device"


def scan_subnet_snmp(
    cidr: str,
    community: str = "public",
    port: int = 161,
    timeout: int = 2,
) -> List[Dict[str, Any]]:
    """Scan all hosts in a CIDR range via SNMP. Returns list of responsive hosts."""
    import ipaddress
    results = []
    try:
        network = ipaddress.ip_network(cidr, strict=False)
    except ValueError as e:
        logger.error(f"Invalid CIDR {cidr}: {e}")
        return results

    hosts = list(network.hosts())
    # Limit to avoid very long scans
    if len(hosts) > 1024:
        logger.warning(f"SNMP scan: subnet {cidr} has {len(hosts)} hosts, limiting to first 256")
        hosts = hosts[:256]

    for ip in hosts:
        host_str = str(ip)
        info = snmp_probe(host_str, community=community, port=port, timeout=timeout)
        if info:
            info["ip_address"] = host_str
            results.append(info)
            logger.info(f"SNMP: found device at {host_str}: {info.get('name')}")

    return results

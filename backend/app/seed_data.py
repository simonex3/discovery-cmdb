"""Seed sample home network data for demo purposes."""
import uuid
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models.ci import ConfigurationItem
from app.models.relationship import Relationship
from app.models.audit import AuditLog


def seed_sample_data(db: Session):
    """Seed sample home network CIs if DB is empty."""
    if db.query(ConfigurationItem).count() > 0:
        return  # Already has data

    now = datetime.now(timezone.utc)

    cis = [
        ConfigurationItem(name="FRITZ!Box 7590", ci_type="router", category="hardware", ip_address="192.168.178.1",
                          mac_address="AC:81:12:AA:BB:CC", hostname="fritz.box", manufacturer="AVM",
                          model_name="FRITZ!Box 7590", os="FRITZ!OS", status="active",
                          health_status="healthy", environment="production",
                          description="Home router and DSL gateway", tags=["gateway", "wifi"],
                          open_ports=[{"port": 80, "protocol": "tcp", "service": "http"}, {"port": 443, "protocol": "tcp", "service": "https"}],
                          last_seen=now),
        ConfigurationItem(name="Unraid Server", ci_type="server", category="hardware", ip_address="192.168.178.112",
                          mac_address="B8:27:EB:11:22:33", hostname="unraid", manufacturer="Custom Build",
                          model_name="ATX Tower", os="Unraid", os_version="6.12.6", status="active",
                          health_status="healthy", environment="production",
                          description="Main home server running Docker containers and VMs",
                          tags=["homelab", "docker", "nas"],
                          open_ports=[{"port": 22, "protocol": "tcp", "service": "ssh"}, {"port": 80, "protocol": "tcp", "service": "http"}, {"port": 443, "protocol": "tcp", "service": "https"}],
                          last_seen=now),
        ConfigurationItem(name="Synology NAS DS920+", ci_type="nas", category="hardware", ip_address="192.168.178.50",
                          mac_address="3C:18:A0:AA:BB:CC", hostname="diskstation", manufacturer="Synology",
                          model_name="DS920+", os="DSM", os_version="7.2", status="active",
                          health_status="healthy", environment="production",
                          description="4-bay NAS for media and backups",
                          tags=["storage", "backup", "media"],
                          open_ports=[{"port": 5000, "protocol": "tcp", "service": "http"}, {"port": 5001, "protocol": "tcp", "service": "https"}],
                          last_seen=now),
        ConfigurationItem(name="Desktop PC", ci_type="desktop", category="hardware", ip_address="192.168.178.100",
                          hostname="desktop-pc", manufacturer="Custom Build", model_name="Mid-Tower",
                          os="Windows 11", os_version="23H2", status="active",
                          health_status="unknown", environment="production",
                          tags=["workstation"], last_seen=now),
        ConfigurationItem(name="Raspberry Pi 4", ci_type="server", category="hardware", ip_address="192.168.178.80",
                          mac_address="DC:A6:32:BB:CC:DD", hostname="raspberrypi", manufacturer="Raspberry Pi Foundation",
                          model_name="Raspberry Pi 4 Model B 8GB", os="Raspberry Pi OS", os_version="Bookworm",
                          status="active", health_status="healthy", environment="home_automation",
                          description="Runs Home Assistant and Pi-hole",
                          tags=["homeassistant", "pihole", "automation"],
                          open_ports=[{"port": 22, "protocol": "tcp", "service": "ssh"}, {"port": 8123, "protocol": "tcp", "service": "homeassistant"}],
                          last_seen=now),
        ConfigurationItem(name="Smart TV Samsung", ci_type="iot", category="hardware", ip_address="192.168.178.200",
                          hostname="samsung-tv", manufacturer="Samsung", model_name="QN85Q80C",
                          os="Tizen", status="active", health_status="unknown",
                          environment="media", tags=["tv", "iot", "media"], last_seen=now),
        ConfigurationItem(name="TP-Link EAP670 AP", ci_type="access_point", category="hardware",
                          ip_address="192.168.178.2", mac_address="18:E8:29:CC:DD:EE",
                          hostname="eap670", manufacturer="TP-Link", model_name="EAP670",
                          status="active", health_status="healthy", environment="production",
                          description="WiFi 6 Access Point", tags=["wifi", "network"],
                          last_seen=now),
        ConfigurationItem(name="Plex Media Server", ci_type="container", category="software",
                          ip_address="192.168.178.112", hostname="unraid", status="active",
                          health_status="healthy", environment="media",
                          description="Plex running as Docker container on Unraid",
                          tags=["plex", "media", "docker"],
                          open_ports=[{"port": 32400, "protocol": "tcp", "service": "plex"}]),
        ConfigurationItem(name="Home Assistant", ci_type="service", category="software",
                          ip_address="192.168.178.80", hostname="raspberrypi", status="active",
                          health_status="healthy", environment="home_automation",
                          description="Home automation platform",
                          tags=["homeassistant", "automation"],
                          open_ports=[{"port": 8123, "protocol": "tcp", "service": "http"}]),
        ConfigurationItem(name="Portainer", ci_type="container", category="software",
                          ip_address="192.168.178.112", hostname="unraid", status="active",
                          health_status="healthy", environment="production",
                          description="Docker management UI",
                          tags=["docker", "management"],
                          open_ports=[{"port": 9000, "protocol": "tcp", "service": "http"}]),
        ConfigurationItem(name="Pi-hole", ci_type="service", category="software",
                          ip_address="192.168.178.80", hostname="raspberrypi", status="active",
                          health_status="healthy", environment="production",
                          description="Network-wide ad blocker",
                          tags=["pihole", "dns", "security"],
                          open_ports=[{"port": 53, "protocol": "udp", "service": "dns"}, {"port": 80, "protocol": "tcp", "service": "http"}]),
        ConfigurationItem(name="Discovery CMDB", ci_type="container", category="software",
                          ip_address="192.168.178.112", hostname="unraid", status="active",
                          health_status="healthy", environment="production",
                          description="This CMDB running on Unraid",
                          tags=["cmdb", "docker", "management"],
                          open_ports=[{"port": 8085, "protocol": "tcp", "service": "http"}]),
    ]

    for ci in cis:
        db.add(ci)
    db.flush()

    # Get IDs by name
    def get_ci(name: str):
        return db.query(ConfigurationItem).filter(ConfigurationItem.name == name).first()

    router = get_ci("FRITZ!Box 7590")
    unraid = get_ci("Unraid Server")
    nas = get_ci("Synology NAS DS920+")
    desktop = get_ci("Desktop PC")
    rpi = get_ci("Raspberry Pi 4")
    tv = get_ci("Smart TV Samsung")
    ap = get_ci("TP-Link EAP670 AP")
    plex = get_ci("Plex Media Server")
    ha = get_ci("Home Assistant")
    portainer = get_ci("Portainer")
    pihole = get_ci("Pi-hole")
    cmdb = get_ci("Discovery CMDB")

    relationships = [
        # Network connections to router
        Relationship(source_id=unraid.id, target_id=router.id, relationship_type="connects_to", description="Wired Ethernet"),
        Relationship(source_id=nas.id, target_id=router.id, relationship_type="connects_to", description="Wired Ethernet"),
        Relationship(source_id=desktop.id, target_id=router.id, relationship_type="connects_to", description="Wired Ethernet"),
        Relationship(source_id=rpi.id, target_id=router.id, relationship_type="connects_to", description="Wired Ethernet"),
        Relationship(source_id=tv.id, target_id=router.id, relationship_type="connects_to", description="WiFi"),
        Relationship(source_id=ap.id, target_id=router.id, relationship_type="connects_to", description="Wired Ethernet"),
        # Containers on Unraid
        Relationship(source_id=plex.id, target_id=unraid.id, relationship_type="hosted_on", description="Docker container"),
        Relationship(source_id=portainer.id, target_id=unraid.id, relationship_type="hosted_on", description="Docker container"),
        Relationship(source_id=cmdb.id, target_id=unraid.id, relationship_type="hosted_on", description="Docker container"),
        # Services on RPi
        Relationship(source_id=ha.id, target_id=rpi.id, relationship_type="runs_on", description="Native install"),
        Relationship(source_id=pihole.id, target_id=rpi.id, relationship_type="runs_on", description="Docker container"),
        # Dependencies
        Relationship(source_id=plex.id, target_id=nas.id, relationship_type="depends_on", description="Media library on NAS"),
        Relationship(source_id=ha.id, target_id=pihole.id, relationship_type="depends_on", description="DNS resolution"),
        Relationship(source_id=pihole.id, target_id=router.id, relationship_type="depends_on", description="Acts as DNS server"),
        # Backup
        Relationship(source_id=nas.id, target_id=unraid.id, relationship_type="backs_up_to", description="Rsync backup"),
    ]

    for rel in relationships:
        db.add(rel)

    db.add(AuditLog(action="created", actor="system", description="Sample home network data seeded"))
    db.commit()

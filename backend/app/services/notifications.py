"""Notification service: webhook + SMTP email alerts."""
from __future__ import annotations

import logging
import smtplib
import json
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional

import httpx
from sqlalchemy.orm import Session

from app.models.user import AppSettings

logger = logging.getLogger(__name__)


def _get_setting(db: Session, key: str, default: str = "") -> str:
    s = db.query(AppSettings).filter(AppSettings.key == key).first()
    return s.value if s else default


def send_webhook(url: str, payload: dict) -> bool:
    if not url:
        return False
    try:
        r = httpx.post(url, json=payload, timeout=10)
        return r.status_code < 400
    except Exception as e:
        logger.warning(f"Webhook to {url} failed: {e}")
        return False


def send_email(
    smtp_host: str,
    smtp_port: int,
    smtp_user: str,
    smtp_password: str,
    from_addr: str,
    to_addr: str,
    subject: str,
    body_html: str,
    use_tls: bool = True,
) -> bool:
    """Send email via SMTP. Returns True on success."""
    if not smtp_host or not to_addr:
        return False
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = from_addr or smtp_user
        msg["To"] = to_addr
        msg.attach(MIMEText(body_html, "html", "utf-8"))

        if use_tls:
            server = smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=15)
        else:
            server = smtplib.SMTP(smtp_host, smtp_port, timeout=15)
            server.starttls()

        if smtp_user and smtp_password:
            server.login(smtp_user, smtp_password)
        server.sendmail(smtp_user or from_addr, [to_addr], msg.as_string())
        server.quit()
        logger.info(f"Email sent to {to_addr}: {subject}")
        return True
    except Exception as e:
        logger.warning(f"Email send failed: {e}")
        return False


def notify_device_down(db: Session, ci_name: str, ci_ip: str, health: str, ci_id: str) -> None:
    """Send webhook + email notification when a device goes down or degrades."""
    payload = {
        "event": "health_changed",
        "ci_id": ci_id,
        "ci_name": ci_name,
        "ip_address": ci_ip,
        "health_status": health,
        "message": f"Device '{ci_name}' ({ci_ip}) is now {health}",
    }

    # Webhook
    webhook_url = _get_setting(db, "webhook_url")
    if webhook_url:
        send_webhook(webhook_url, payload)

    # Email
    smtp_host = _get_setting(db, "smtp_host")
    smtp_port_str = _get_setting(db, "smtp_port", "465")
    smtp_user = _get_setting(db, "smtp_user")
    smtp_pass = _get_setting(db, "smtp_password")
    smtp_from = _get_setting(db, "smtp_from", smtp_user)
    smtp_to = _get_setting(db, "smtp_to")
    smtp_tls = _get_setting(db, "smtp_tls", "true") == "true"

    if smtp_host and smtp_to:
        status_color = "#dc2626" if health == "down" else "#d97706"
        status_label = "DOWN" if health == "down" else "DEGRADED"
        body = f"""
        <html><body style="font-family: sans-serif; background: #f3f4f6; padding: 24px;">
        <div style="background: white; border-radius: 8px; padding: 24px; max-width: 560px; margin: auto;
                    border-left: 4px solid {status_color};">
          <h2 style="color: {status_color}; margin-top: 0;">⚠ Device {status_label}</h2>
          <p><strong>Name:</strong> {ci_name}</p>
          <p><strong>IP:</strong> {ci_ip}</p>
          <p><strong>Status:</strong> <span style="color:{status_color};font-weight:bold;">{status_label}</span></p>
          <p style="color:#6b7280;font-size:12px;">Discovery CMDB Alert</p>
        </div>
        </body></html>
        """
        try:
            send_email(
                smtp_host=smtp_host,
                smtp_port=int(smtp_port_str),
                smtp_user=smtp_user,
                smtp_password=smtp_pass,
                from_addr=smtp_from,
                to_addr=smtp_to,
                subject=f"[CMDB] Device {status_label}: {ci_name} ({ci_ip})",
                body_html=body,
                use_tls=smtp_tls,
            )
        except Exception as e:
            logger.warning(f"notify_device_down email error: {e}")


def notify_new_device(db: Session, ci_name: str, ci_ip: str, ci_type: str, ci_id: str) -> None:
    """Send notification when a new device is discovered."""
    payload = {
        "event": "device_discovered",
        "ci_id": ci_id,
        "ci_name": ci_name,
        "ip_address": ci_ip,
        "ci_type": ci_type,
        "message": f"New device discovered: '{ci_name}' ({ci_ip}) — type: {ci_type}",
    }
    webhook_url = _get_setting(db, "webhook_url")
    if webhook_url:
        send_webhook(webhook_url, payload)

    smtp_host = _get_setting(db, "smtp_host")
    smtp_to = _get_setting(db, "smtp_to")
    smtp_port_str = _get_setting(db, "smtp_port", "465")
    smtp_user = _get_setting(db, "smtp_user")
    smtp_pass = _get_setting(db, "smtp_password")
    smtp_from = _get_setting(db, "smtp_from", smtp_user)
    smtp_tls = _get_setting(db, "smtp_tls", "true") == "true"

    if smtp_host and smtp_to:
        body = f"""
        <html><body style="font-family: sans-serif; background: #f3f4f6; padding: 24px;">
        <div style="background: white; border-radius: 8px; padding: 24px; max-width: 560px; margin: auto;
                    border-left: 4px solid #2563eb;">
          <h2 style="color: #2563eb; margin-top: 0;">New Device Discovered</h2>
          <p><strong>Name:</strong> {ci_name}</p>
          <p><strong>IP:</strong> {ci_ip}</p>
          <p><strong>Type:</strong> {ci_type}</p>
          <p style="color:#6b7280;font-size:12px;">Discovery CMDB</p>
        </div>
        </body></html>
        """
        try:
            send_email(
                smtp_host=smtp_host,
                smtp_port=int(smtp_port_str),
                smtp_user=smtp_user,
                smtp_password=smtp_pass,
                from_addr=smtp_from,
                to_addr=smtp_to,
                subject=f"[CMDB] New Device: {ci_name} ({ci_ip})",
                body_html=body,
                use_tls=smtp_tls,
            )
        except Exception as e:
            logger.warning(f"notify_new_device email error: {e}")

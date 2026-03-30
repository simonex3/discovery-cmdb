"""ServiceNow integration endpoints (config, sync status)."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session
from app.database import get_db
from app.services.auth import require_user, require_operator, require_admin
from app.models.user import User

router = APIRouter(prefix="/servicenow", tags=["ServiceNow Integration"])


class SNConfig(BaseModel):
    instance_url: str
    username: str
    password: str


@router.get("/config", summary="Get ServiceNow configuration")
def get_sn_config(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    from app.api.v1.endpoints.setup import get_setting
    return {
        "instance_url": get_setting(db, "sn_instance_url", ""),
        "username": get_setting(db, "sn_username", ""),
        "configured": bool(get_setting(db, "sn_instance_url")),
    }


@router.post("/config", summary="Save ServiceNow configuration")
def save_sn_config(config: SNConfig, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    from app.api.v1.endpoints.setup import set_setting
    set_setting(db, "sn_instance_url", config.instance_url)
    set_setting(db, "sn_username", config.username)
    set_setting(db, "sn_password", config.password)
    return {"message": "ServiceNow configuration saved"}


@router.post("/test", summary="Test ServiceNow connection")
async def test_sn_connection(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    from app.services.servicenow import ServiceNowService
    from app.api.v1.endpoints.setup import get_setting
    svc = ServiceNowService(
        instance_url=get_setting(db, "sn_instance_url", ""),
        username=get_setting(db, "sn_username", ""),
        password=get_setting(db, "sn_password", ""),
    )
    ok, msg = await svc.test_connection()
    return {"connected": ok, "message": msg}


@router.post("/sync", summary="Sync with ServiceNow", description="Import CIs from ServiceNow and export local CIs to ServiceNow.")
async def sync_with_servicenow(
    direction: str = "both",  # import | export | both
    db: Session = Depends(get_db),
    user: User = Depends(require_operator),
):
    from app.services.servicenow import ServiceNowService
    from app.api.v1.endpoints.setup import get_setting
    svc = ServiceNowService(
        instance_url=get_setting(db, "sn_instance_url", ""),
        username=get_setting(db, "sn_username", ""),
        password=get_setting(db, "sn_password", ""),
    )
    result = await svc.sync(db, direction=direction, actor=user.username)
    return result


@router.get("/sync/status", summary="Get last sync status")
def get_sync_status(db: Session = Depends(get_db), _: User = Depends(require_user)):
    from app.api.v1.endpoints.setup import get_setting
    return {
        "last_sync": get_setting(db, "sn_last_sync"),
        "last_sync_result": get_setting(db, "sn_last_sync_result"),
        "configured": bool(get_setting(db, "sn_instance_url")),
    }

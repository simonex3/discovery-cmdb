from fastapi import APIRouter
from app.api.v1.endpoints import cis, relationships, topology, discovery, servicenow, stats, audit, fritz
from app.api.v1.endpoints.auth import router as auth_router, router_users
from app.api.v1.endpoints.setup import router as setup_router, router_settings

router = APIRouter()

router.include_router(setup_router)
router.include_router(router_settings)
router.include_router(auth_router)
router.include_router(router_users)
router.include_router(cis.router)
router.include_router(relationships.router)
router.include_router(topology.router)
router.include_router(discovery.router)
router.include_router(servicenow.router)
router.include_router(fritz.router)
router.include_router(stats.router)
router.include_router(audit.router)

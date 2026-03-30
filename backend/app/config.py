from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://cmdb:cmdb_secret_change_me@db:5432/cmdb"
    SECRET_KEY: str = "change_this_super_secret_key_in_production_please"

    # Network discovery
    NETWORK_RANGE: str = "192.168.178.0/24"
    DISCOVERY_INTERVAL_MINUTES: int = 60
    HEALTH_CHECK_INTERVAL_MINUTES: int = 5
    AUTO_DISCOVERY_ENABLED: bool = True

    # CORS
    CORS_ORIGINS: List[str] = ["*"]

    # Feature flags
    SETUP_COMPLETED: bool = False
    SEED_SAMPLE_DATA: bool = True

    model_config = {"env_file": ".env", "case_sensitive": True}


settings = Settings()

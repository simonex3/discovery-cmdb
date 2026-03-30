"""Authentication and user management service."""
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.config import settings
from app.database import get_db
from app.models.user import User

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer(auto_error=False)

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    data = {"sub": user_id, "exp": expire}
    return jwt.encode(data, settings.SECRET_KEY, algorithm=ALGORITHM)


def generate_api_key() -> str:
    return f"cmdb_{secrets.token_urlsafe(32)}"


def get_user_from_token(token: str, db: Session) -> Optional[User]:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if not user_id:
            return None
    except JWTError:
        return None
    return db.query(User).filter(User.id == uuid.UUID(user_id), User.is_active == True).first()


def get_user_from_api_key(api_key: str, db: Session) -> Optional[User]:
    return db.query(User).filter(User.api_key == api_key, User.is_active == True).first()


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security),
    db: Session = Depends(get_db),
) -> Optional[User]:
    """Get current user from JWT bearer token or API key header.
    Returns None if no valid auth - endpoints decide if auth is required."""
    if not credentials:
        return None

    token = credentials.credentials

    # Try API key first
    if token.startswith("cmdb_"):
        user = get_user_from_api_key(token, db)
        if user:
            return user

    # Try JWT
    return get_user_from_token(token, db)


async def require_user(user: Optional[User] = Depends(get_current_user)) -> User:
    """Require authenticated user (any role)."""
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


async def require_operator(user: User = Depends(require_user)) -> User:
    """Require operator or admin role."""
    if user.role not in ("admin", "operator"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    return user


async def require_admin(user: User = Depends(require_user)) -> User:
    """Require admin role."""
    if user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required")
    return user


def authenticate_user(username: str, password: str, db: Session) -> Optional[User]:
    user = db.query(User).filter(
        (User.username == username) | (User.email == username),
        User.is_active == True,
    ).first()
    if not user or not verify_password(password, user.hashed_password):
        return None
    user.last_login = datetime.now(timezone.utc)
    db.commit()
    return user

"""Authentication endpoints - login, logout, profile, API keys."""
import uuid
from typing import List
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.schemas.user import (
    LoginRequest, TokenResponse, UserResponse, UserCreate, UserUpdate,
    UserPublic, ChangePasswordRequest,
)
from app.services.auth import (
    authenticate_user, create_access_token, hash_password,
    generate_api_key, require_user, require_admin, require_operator,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Login",
    description="Authenticate with username/email and password. Returns a JWT bearer token.",
)
def login(request: LoginRequest, db: Session = Depends(get_db)):
    user = authenticate_user(request.username, request.password, db)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )
    token = create_access_token(str(user.id))
    return TokenResponse(access_token=token, user=UserResponse.model_validate(user))


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Get current user",
    description="Returns the profile of the currently authenticated user.",
)
def get_me(current_user: User = Depends(require_user)):
    return current_user


@router.put(
    "/me",
    response_model=UserResponse,
    summary="Update own profile",
)
def update_me(update: UserUpdate, db: Session = Depends(get_db), current_user: User = Depends(require_user)):
    if update.email:
        existing = db.query(User).filter(User.email == update.email, User.id != current_user.id).first()
        if existing:
            raise HTTPException(status_code=400, detail="Email already in use")
        current_user.email = update.email
    if update.full_name is not None:
        current_user.full_name = update.full_name
    if update.avatar_color is not None:
        current_user.avatar_color = update.avatar_color
    db.commit()
    db.refresh(current_user)
    return current_user


@router.post(
    "/me/change-password",
    summary="Change own password",
)
def change_password(
    request: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_user),
):
    from app.services.auth import verify_password, hash_password
    if not verify_password(request.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    current_user.hashed_password = hash_password(request.new_password)
    db.commit()
    return {"message": "Password changed successfully"}


@router.post(
    "/me/api-key",
    summary="Generate API key",
    description="Generate a new API key for the current user. The old key is invalidated.",
)
def generate_my_api_key(db: Session = Depends(get_db), current_user: User = Depends(require_user)):
    current_user.api_key = generate_api_key()
    db.commit()
    return {"api_key": current_user.api_key}


@router.delete(
    "/me/api-key",
    summary="Revoke API key",
)
def revoke_my_api_key(db: Session = Depends(get_db), current_user: User = Depends(require_user)):
    current_user.api_key = None
    db.commit()
    return {"message": "API key revoked"}


# ---- User Management (Admin) ----

router_users = APIRouter(prefix="/users", tags=["User Management"])


@router_users.get(
    "",
    response_model=List[UserResponse],
    summary="List all users",
    description="Returns all users. Admin only.",
)
def list_users(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return db.query(User).order_by(User.created_at).all()


@router_users.post(
    "",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create user",
    description="Create a new user. Admin only.",
)
def create_user(data: UserCreate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    if db.query(User).filter(User.username == data.username).first():
        raise HTTPException(status_code=400, detail="Username already taken")
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=400, detail="Email already in use")
    user = User(
        username=data.username,
        email=data.email,
        full_name=data.full_name,
        role=data.role,
        avatar_color=data.avatar_color,
        hashed_password=hash_password(data.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router_users.get(
    "/{user_id}",
    response_model=UserResponse,
    summary="Get user by ID",
)
def get_user(user_id: uuid.UUID, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router_users.put(
    "/{user_id}",
    response_model=UserResponse,
    summary="Update user",
)
def update_user(
    user_id: uuid.UUID,
    data: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if data.email:
        existing = db.query(User).filter(User.email == data.email, User.id != user_id).first()
        if existing:
            raise HTTPException(status_code=400, detail="Email already in use")
        user.email = data.email
    if data.full_name is not None:
        user.full_name = data.full_name
    if data.role:
        user.role = data.role
    if data.is_active is not None:
        user.is_active = data.is_active
    if data.avatar_color is not None:
        user.avatar_color = data.avatar_color
    if data.password:
        user.hashed_password = hash_password(data.password)
    db.commit()
    db.refresh(user)
    return user


@router_users.delete(
    "/{user_id}",
    summary="Delete user",
)
def delete_user(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    db.delete(user)
    db.commit()
    return {"message": "User deleted"}


@router_users.post(
    "/{user_id}/api-key",
    summary="Generate API key for user",
)
def generate_user_api_key(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.api_key = generate_api_key()
    db.commit()
    return {"api_key": user.api_key}

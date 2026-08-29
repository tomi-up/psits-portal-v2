"""Landing page News & Updates: admin-curated Facebook post links, embedded
client-side via Facebook's Post Plugin (no Facebook Developer App needed for
public posts). The list endpoint is public - it feeds the logged-out landing
page - while adding/removing links is admin-only."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.core.database import get_db
from app.core.deps import get_current_admin
from app.models.news import NewsPost

router = APIRouter(prefix="/news", tags=["news"])
admin_router = APIRouter(prefix="/officer/news", tags=["admin-news"], dependencies=[Depends(get_current_admin)])


class NewsRow(BaseModel):
    id: str
    facebook_url: str
    created_at: datetime


class NewsCreate(BaseModel):
    facebook_url: str


@router.get("/")
def list_news(db: Session = Depends(get_db)):
    posts = db.query(NewsPost).order_by(NewsPost.created_at.desc()).all()
    return {"posts": [NewsRow(id=p.id, facebook_url=p.facebook_url, created_at=p.created_at) for p in posts]}


@admin_router.get("/")
def admin_list_news(db: Session = Depends(get_db)):
    return list_news(db)


@admin_router.post("/")
def add_news(body: NewsCreate, db: Session = Depends(get_db)):
    url = body.facebook_url.strip()
    if not url:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="A Facebook post URL is required")
    if "facebook.com" not in url:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="That doesn't look like a Facebook URL")

    post = NewsPost(facebook_url=url)
    db.add(post)
    db.commit()

    return NewsRow(id=post.id, facebook_url=post.facebook_url, created_at=post.created_at)


@admin_router.delete("/{news_id}")
def delete_news(news_id: str, db: Session = Depends(get_db)):
    post = db.query(NewsPost).filter(NewsPost.id == news_id).first()
    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="News post not found")

    db.delete(post)
    db.commit()

    return {"status": "deleted"}

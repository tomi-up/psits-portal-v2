"""Facebook post links the admin curates for the landing page's News & Updates section."""

from sqlalchemy import Column, Text

from app.models.base import BaseModel


class NewsPost(BaseModel):
    __tablename__ = "news_posts"

    facebook_url = Column(Text, nullable=False)

    def __repr__(self):
        return f"<NewsPost(id={self.id})>"

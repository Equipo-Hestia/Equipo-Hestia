from sqlalchemy import Column, Integer, String, Boolean, DateTime
from app.database import Base


class TokenRecuperacion(Base):
    __tablename__ = "tokens_recuperacion"

    id = Column(Integer, primary_key=True)
    email = Column(String(256), nullable=False, index=True)
    token_hash = Column(String(64), nullable=False, unique=True)
    expira_en = Column(DateTime(timezone=True), nullable=False)
    usado = Column(Boolean, default=False, nullable=False)

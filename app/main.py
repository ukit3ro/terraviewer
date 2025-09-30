from fastapi import FastAPI, HTTPException, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, Column, Integer, String, DateTime, Text, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List, Dict, Any
import json

SQLITE_DATABASE_URL = "sqlite:///./data/terraform_logs.db"
engine = create_engine(SQLITE_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class TerraformLog(Base):
    __tablename__ = "terraform_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    level = Column(String, index=True)
    message = Column(Text)
    timestamp = Column(DateTime, index=True)
    module = Column(String, nullable=True)
    tf_req_id = Column(String, index=True, nullable=True)
    tf_resource_type = Column(String, index=True, nullable=True)
    tf_rpc = Column(String, nullable=True)
    raw_data = Column(Text)  #исх json
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class LogCreate(BaseModel):
    level: str
    message: str
    timestamp: datetime
    module: Optional[str] = None
    tf_req_id: Optional[str] = None
    tf_resource_type: Optional[str] = None
    tf_rpc: Optional[str] = None
    raw_data: Optional[str] = None

class LogResponse(BaseModel):
    id: int
    level: str
    message: str
    timestamp: datetime
    module: Optional[str] = None
    tf_req_id: Optional[str] = None
    tf_resource_type: Optional[str] = None
    tf_rpc: Optional[str] = None
    is_read: bool
    created_at: datetime

    class Config:
        from_attributes = True

class LogListResponse(BaseModel):
    logs: List[LogResponse]
    total: int
    page: int
    page_size: int

class ChainResponse(BaseModel):
    tf_req_id: str
    logs: List[LogResponse]
    total_logs: int

Base.metadata.create_all(bind=engine)

app = FastAPI(title="TerraViewer API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.get("/")
async def root():
    return {"message": "TerraViewer API", "version": "1.0.0"}

@app.post("/api/logs", response_model=LogResponse)
async def create_log(log: LogCreate, db: Session = Depends(get_db)):
    """Загрузка одного лога"""
    db_log = TerraformLog(**log.dict())
    db.add(db_log)
    db.commit()
    db.refresh(db_log)
    return db_log

@app.post("/api/logs/batch")
async def create_logs_batch(logs: List[LogCreate], db: Session = Depends(get_db)):
    """Пакетная загрузка логов"""
    db_logs = [TerraformLog(**log.dict()) for log in logs]
    db.add_all(db_logs)
    db.commit()
    return {"message": f"Successfully added {len(db_logs)} logs"}

@app.get("/api/logs", response_model=LogListResponse)
async def get_logs(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    level: Optional[str] = Query(None),
    tf_resource_type: Optional[str] = Query(None),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    unread_only: bool = Query(False),
    db: Session = Depends(get_db)
):
    """Получение списка логов с фильтрацией и пагинацией"""
    query = db.query(TerraformLog)
    
    if level:
        query = query.filter(TerraformLog.level == level)
    if tf_resource_type:
        query = query.filter(TerraformLog.tf_resource_type == tf_resource_type)
    if start_date:
        query = query.filter(TerraformLog.timestamp >= start_date)
    if end_date:
        query = query.filter(TerraformLog.timestamp <= end_date)
    if unread_only:
        query = query.filter(TerraformLog.is_read == False)
    
    total = query.count()
    
    logs = query.order_by(TerraformLog.timestamp.desc()).offset(skip).limit(limit).all()
    
    return LogListResponse(
        logs=logs,
        total=total,
        page=skip // limit + 1,
        page_size=limit
    )

@app.get("/api/logs/{log_id}", response_model=LogResponse)
async def get_log(log_id: int, db: Session = Depends(get_db)):
    """Получение деталей конкретного лога"""
    log = db.query(TerraformLog).filter(TerraformLog.id == log_id).first()
    if not log:
        raise HTTPException(status_code=404, detail="Log not found")
    return log

@app.patch("/api/logs/{log_id}/read")
async def mark_log_as_read(log_id: int, db: Session = Depends(get_db)):
    """Пометить лог как прочитанный"""
    log = db.query(TerraformLog).filter(TerraformLog.id == log_id).first()
    if not log:
        raise HTTPException(status_code=404, detail="Log not found")
    
    log.is_read = True
    db.commit()
    return {"message": "Log marked as read"}

@app.get("/api/search")
async def search_logs(
    q: str = Query(..., description="Search query"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db)
):
    #fulltext поиск
    search_query = f"%{q}%"
    
    query = db.query(TerraformLog).filter(
        TerraformLog.message.ilike(search_query) |
        TerraformLog.raw_data.ilike(search_query)
    )
    
    total = query.count()
    logs = query.order_by(TerraformLog.timestamp.desc()).offset(skip).limit(limit).all()
    
    return {
        "logs": logs,
        "total": total,
        "query": q,
        "page": skip // limit + 1,
        "page_size": limit
    }

@app.get("/api/chains/{tf_req_id}", response_model=ChainResponse)
async def get_request_chain(tf_req_id: str, db: Session = Depends(get_db)):
    #получаем цепочку логов по tf_req_ id
    logs = db.query(TerraformLog).filter(
        TerraformLog.tf_req_id == tf_req_id
    ).order_by(TerraformLog.timestamp.asc()).all()
    
    if not logs:
        raise HTTPException(status_code=404, detail="Request chain not found")
    
    return ChainResponse(
        tf_req_id=tf_req_id,
        logs=logs,
        total_logs=len(logs)
    )

@app.get("/api/stats")
async def get_stats(db: Session = Depends(get_db)):
    """Получение статистики по логам"""
    total_logs = db.query(TerraformLog).count()
    unread_logs = db.query(TerraformLog).filter(TerraformLog.is_read == False).count()
    
    #стата по уровням:
    level_stats = db.query(
        TerraformLog.level,
        db.func.count(TerraformLog.id)
    ).group_by(TerraformLog.level).all()
    
    #тп res types
    resource_stats = db.query(
        TerraformLog.tf_resource_type,
        db.func.count(TerraformLog.id)
    ).filter(TerraformLog.tf_resource_type.isnot(None)).group_by(
        TerraformLog.tf_resource_type
    ).order_by(db.func.count(TerraformLog.id).desc()).limit(10).all()
    
    return {
        "total_logs": total_logs,
        "unread_logs": unread_logs,
        "level_stats": dict(level_stats),
        "top_resources": dict(resource_stats)
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
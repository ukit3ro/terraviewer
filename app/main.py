from fastapi import FastAPI, HTTPException, Depends, Query, UploadFile, File, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, Column, Integer, String, DateTime, Text, Boolean, func
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List, Dict, Any
import json
import os
import uuid

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
    raw_data = Column(Text)  # Исходный JSON
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

class SimpleTerraformParser:
    def __init__(self):
        self.level_patterns = {
            'error': ['error', 'failed', 'exception', 'fatal'],
            'warn': ['warn', 'warning', 'attention', 'caution'],
            'debug': ['debug', 'trace'],
            'info': ['info', 'message', 'starting', 'completed']
        }
    
    def detect_level_heuristic(self, message: str) -> str:
        message_lower = message.lower()
        for level, patterns in self.level_patterns.items():
            if any(pattern in message_lower for pattern in patterns):
                return level
        return 'info'
    
    def parse_timestamp(self, timestamp_str: str) -> Optional[datetime]:
        try:
            if '+' in timestamp_str:
                return datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
            elif timestamp_str.endswith('Z'):
                return datetime.fromisoformat(timestamp_str[:-1] + '+00:00')
            else:
                return datetime.fromisoformat(timestamp_str)
        except (ValueError, TypeError):
            return datetime.utcnow()
    
    def parse_single_log(self, log_data: dict) -> LogCreate:
        level = log_data.get('@level')
        message = log_data.get('@message', '')
        timestamp_str = log_data.get('@timestamp')
        
        if not level:
            level = self.detect_level_heuristic(message)
        
        timestamp = self.parse_timestamp(timestamp_str) if timestamp_str else datetime.utcnow()
        
        return LogCreate(
            level=level,
            message=message,
            timestamp=timestamp,
            module=log_data.get('@module'),
            tf_req_id=log_data.get('tf_req_id'),
            tf_resource_type=log_data.get('tf_resource_type'),
            tf_rpc=log_data.get('tf_rpc'),
            raw_data=json.dumps(log_data)
        )

parser = SimpleTerraformParser()

def process_log_file(file_path: str, db: Session):
    try:
        print(f"Processing file: {file_path}")
        stats = {
            'total': 0,
            'parsed': 0,
            'errors': 0,
            'sections': {'plan': 0, 'apply': 0, 'validation': 0}
        }
        
        with open(file_path, 'r', encoding='utf-8') as file:
            for line_number, line in enumerate(file, 1):
                line = line.strip()
                if not line:
                    continue
                
                stats['total'] += 1
                
                try:
                    log_data = json.loads(line)
                    log_create = parser.parse_single_log(log_data)
                    
                    db_log = TerraformLog(**log_create.dict())
                    db.add(db_log)
                    stats['parsed'] += 1
                    
                except json.JSONDecodeError as e:
                    print(f"JSON decode error on line {line_number}: {e}")
                    stats['errors'] += 1
                except Exception as e:
                    print(f"Error processing line {line_number}: {e}")
                    stats['errors'] += 1
            
            db.commit()
        
        print(f"File processed: {stats}")
        
    except Exception as e:
        print(f"Error processing file: {e}")
        db.rollback()
    finally:
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
                print(f"Cleaned up: {file_path}")
        except Exception as e:
            print(f" Cleanup failed: {e}")

os.makedirs("./data/uploads", exist_ok=True)

@app.get("/")
async def root():
    return {"message": "TerraViewer API", "version": "1.0.0"}

@app.post("/api/logs", response_model=LogResponse)
async def create_log(log: LogCreate, db: Session = Depends(get_db)):
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
    log = db.query(TerraformLog).filter(TerraformLog.id == log_id).first()
    if not log:
        raise HTTPException(status_code=404, detail="Log not found")
    return log

@app.patch("/api/logs/{log_id}/read")
async def mark_log_as_read(log_id: int, db: Session = Depends(get_db)):
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
    total_logs = db.query(TerraformLog).count()
    unread_logs = db.query(TerraformLog).filter(TerraformLog.is_read == False).count()
    
    level_stats = db.query(
        TerraformLog.level,
        func.count(TerraformLog.id)
    ).group_by(TerraformLog.level).all()
    
    resource_stats = db.query(
        TerraformLog.tf_resource_type,
        func.count(TerraformLog.id)
    ).filter(TerraformLog.tf_resource_type.isnot(None)).group_by(
        TerraformLog.tf_resource_type
    ).order_by(func.count(TerraformLog.id).desc()).limit(10).all()
    
    return {
        "total_logs": total_logs,
        "unread_logs": unread_logs,
        "level_stats": dict(level_stats),
        "top_resources": dict(resource_stats)
    }

@app.post("/api/upload-logs")
async def upload_logs_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    try:
        if not file.filename or not file.filename.endswith(('.json', '.log', '.txt')):
            raise HTTPException(status_code=400, detail="Only JSON, LOG, and TXT files are allowed")
        
        file_extension = os.path.splitext(file.filename)[1]
        unique_filename = f"{uuid.uuid4()}{file_extension}"
        file_path = f"./data/uploads/{unique_filename}"
        
        content = await file.read()
        with open(file_path, "wb") as buffer:
            buffer.write(content)
        
        background_tasks.add_task(process_log_file, file_path, db)
        
        return {
            "message": "File uploaded successfully", 
            "filename": unique_filename,
            "size": len(content)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

@app.post("/api/parse-logs")
async def parse_logs_directly(
    logs: List[Dict[str, Any]],
    db: Session = Depends(get_db)
):
    stats = {
        'total': len(logs),
        'parsed': 0,
        'errors': 0,
        'sections': {'plan': 0, 'apply': 0, 'validation': 0}
    }
    
    db_logs = []
    
    for log_data in logs:
        try:
            log_create = parser.parse_single_log(log_data)
            db_log = TerraformLog(**log_create.dict())
            db_logs.append(db_log)
            stats['parsed'] += 1
            
        except Exception as e:
            print(f"Error parsing log: {e}")
            stats['errors'] += 1
    
    if db_logs:
        db.add_all(db_logs)
        db.commit()
    
    return {"message": "Logs parsed successfully", "stats": stats}

@app.get("/api/analyze-logs/{filename}")
async def analyze_logs_structure(filename: str):
    """Анализ структуры логов без сохранения в БД"""
    file_path = f"./data/uploads/{filename}"
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    
    analysis = {
        'total_lines': 0,
        'valid_json': 0,
        'levels': {},
        'modules': {},
        'timestamp_format_ok': 0
    }
    
    try:
        with open(file_path, 'r', encoding='utf-8') as file:
            for line in file:
                line = line.strip()
                if not line:
                    continue
                
                analysis['total_lines'] += 1
                
                try:
                    log_data = json.loads(line)
                    analysis['valid_json'] += 1
                    
                    level = log_data.get('@level', 'unknown')
                    analysis['levels'][level] = analysis['levels'].get(level, 0) + 1
                    
                    module = log_data.get('@module', 'unknown')
                    analysis['modules'][module] = analysis['modules'].get(module, 0) + 1
                    
                    timestamp = log_data.get('@timestamp')
                    if timestamp and parser.parse_timestamp(timestamp):
                        analysis['timestamp_format_ok'] += 1
                        
                except json.JSONDecodeError:
                    continue
        
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found")
    
    return analysis

@app.get("/api/parser-stats")
async def get_parser_stats(db: Session = Depends(get_db)):
    total_logs = db.query(TerraformLog).count()
    
    level_stats = db.query(
        TerraformLog.level,
        func.count(TerraformLog.id)
    ).group_by(TerraformLog.level).all()
    
    resource_stats = db.query(
        TerraformLog.tf_resource_type,
        func.count(TerraformLog.id)
    ).filter(TerraformLog.tf_resource_type.isnot(None)).group_by(
        TerraformLog.tf_resource_type
    ).order_by(func.count(TerraformLog.id).desc()).limit(10).all()
    
    return {
        "total_parsed_logs": total_logs,
        "level_distribution": dict(level_stats),
        "top_resource_types": dict(resource_stats)
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
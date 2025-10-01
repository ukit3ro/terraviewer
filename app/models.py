from sqlalchemy import Column, Integer, String, DateTime, Text, Boolean, JSON
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime

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
    raw_data = Column(Text)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class LogAnalysis(Base):
    __tablename__ = "log_analysis" # модель для хранения результатов анализа логов
    
    id = Column(Integer, primary_key=True, index=True)
    file_name = Column(String, index=True)
    analysis_data = Column(JSON)
    total_logs = Column(Integer)
    parsed_logs = Column(Integer)
    error_logs = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow)

class LogSection(Base):
    __tablename__ = "log_sections" # модель для отслеживания секций выполнения
    
    id = Column(Integer, primary_key=True, index=True)
    section_type = Column(String, index=True)
    start_log_id = Column(Integer)
    end_log_id = Column(Integer)
    log_count = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow)
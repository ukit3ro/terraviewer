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
    section = Column(String, index=True, nullable=True)
    json_blocks = Column(JSON, nullable=True)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
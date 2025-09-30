from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from typing import List, Dict, Any, Optional
from datetime import datetime

class LogSearch:
    def __init__(self, database_url: str = "sqlite:///./data/terraform_logs.db"):
        self.engine = create_engine(database_url)
        self.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)
        
        self._setup_fts_table()
    
    def _setup_fts_table(self):
        """Создание виртуальной таблицы FTS5 для полнотекстового поиска"""
        with self.engine.connect() as conn:
            conn.execute(text("""
                CREATE VIRTUAL TABLE IF NOT EXISTS logs_fts 
                USING fts5(id, level, message, tf_resource_type, timestamp)
            """))
            
            conn.execute(text("""
                INSERT OR IGNORE INTO logs_fts 
                SELECT id, level, message, tf_resource_type, timestamp 
                FROM terraform_logs
            """))
            conn.commit()
    
    def full_text_search(self, query: str, limit: int = 100) -> List[Dict[str, Any]]:
        """Полнотекстовый поиск с использованием FTS5"""
        with self.engine.connect() as conn:
            result = conn.execute(text("""
                SELECT l.* 
                FROM logs_fts f
                JOIN terraform_logs l ON f.id = l.id
                WHERE logs_fts MATCH :query
                ORDER BY rank
                LIMIT :limit
            """), {"query": query, "limit": limit})
            
            return [dict(row) for row in result.mappings()]
    
    def advanced_search(
        self, 
        query: Optional[str] = None,
        level: Optional[str] = None,
        resource_type: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Расширенный поиск с комбинированными фильтрами"""
        with self.engine.connect() as conn:
            sql = """
                SELECT * FROM terraform_logs 
                WHERE 1=1
            """
            params = {}
            
            if query:
                sql += " AND (message LIKE :query OR raw_data LIKE :query)"
                params["query"] = f"%{query}%"
            
            if level:
                sql += " AND level = :level"
                params["level"] = level
            
            if resource_type:
                sql += " AND tf_resource_type = :resource_type"
                params["resource_type"] = resource_type
            
            if start_date:
                sql += " AND timestamp >= :start_date"
                params["start_date"] = start_date
            
            if end_date:
                sql += " AND timestamp <= :end_date"
                params["end_date"] = end_date
            
            sql += " ORDER BY timestamp DESC LIMIT :limit"
            params["limit"] = limit
            
            result = conn.execute(text(sql), params)
            return [dict(row) for row in result.mappings()]
    
    def get_resource_types(self) -> List[str]:
        """Получение списка всех resource_types"""
        with self.engine.connect() as conn:
            result = conn.execute(text("""
                SELECT DISTINCT tf_resource_type 
                FROM terraform_logs 
                WHERE tf_resource_type IS NOT NULL 
                ORDER BY tf_resource_type
            """))
            return [row[0] for row in result if row[0]]

search_engine = LogSearch()

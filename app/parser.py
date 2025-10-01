import json
import re
from datetime import datetime
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session

class TerraformLogParser:
    def __init__(self):
        self.level_patterns = {
            'error': re.compile(r'error|failed|exception|fatal', re.IGNORECASE),
            'warn': re.compile(r'warn|attention|caution', re.IGNORECASE),
            'debug': re.compile(r'debug|trace', re.IGNORECASE),
            'info': re.compile(r'info|message|starting|completed', re.IGNORECASE)
        }
        
        self.plan_section_pattern = re.compile(r'starting Plan operation', re.IGNORECASE)
        self.apply_section_pattern = re.compile(r'starting Apply operation', re.IGNORECASE)
        self.validation_section_pattern = re.compile(r'running validation operation', re.IGNORECASE)

    def parse_timestamp(self, timestamp_str: str) -> Optional[datetime]:
        """Парсинг временных меток из различных форматов"""
        try:
            if '+' in timestamp_str:
                return datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
            elif timestamp_str.endswith('Z'):
                return datetime.fromisoformat(timestamp_str[:-1] + '+00:00')
            else:
                return datetime.fromisoformat(timestamp_str)
        except (ValueError, TypeError):
            return None

    def detect_level_heuristic(self, message: str) -> str:
        """Эвристическое определение уровня логирования по сообщению"""
        message_lower = message.lower()
        
        for level, pattern in self.level_patterns.items():
            if pattern.search(message_lower):
                return level
        
        return 'info'

    def extract_json_blocks(self, field_value: str) -> Optional[Dict[str, Any]]:
        """Извлечение и парсинг JSON блоков из строковых полей"""
        if not field_value or not isinstance(field_value, str):
            return None
        
        json_match = re.search(r'(\{.*\}|\[.*\])', field_value, re.DOTALL)
        if json_match:
            try:
                return json.loads(json_match.group(1))
            except json.JSONDecodeError:
                pass
        
        return None

    def detect_section(self, message: str) -> Optional[str]:
        if self.plan_section_pattern.search(message):
            return 'plan'
        elif self.apply_section_pattern.search(message):
            return 'apply'
        elif self.validation_section_pattern.search(message):
            return 'validation'
        return None

    def parse_single_log(self, log_data: Dict[str, Any]) -> Dict[str, Any]:
        level = log_data.get('@level')
        message = log_data.get('@message', '')
        timestamp_str = log_data.get('@timestamp')
        module = log_data.get('@module')
        
        if not level:
            level = self.detect_level_heuristic(message)
        
        timestamp = self.parse_timestamp(timestamp_str) if timestamp_str else datetime.utcnow()
        
        tf_req_id = log_data.get('tf_req_id')
        tf_resource_type = log_data.get('tf_resource_type')
        tf_rpc = log_data.get('tf_rpc')
        
        section = self.detect_section(message)
        
        json_blocks = {}
        for json_field in ['tf_http_req_body', 'tf_http_res_body']:
            if json_field in log_data:
                json_blocks[json_field] = self.extract_json_blocks(log_data[json_field])
        
        return {
            'level': level,
            'message': message,
            'timestamp': timestamp,
            'module': module,
            'tf_req_id': tf_req_id,
            'tf_resource_type': tf_resource_type,
            'tf_rpc': tf_rpc,
            'section': section,
            'json_blocks': json_blocks,
            'raw_data': json.dumps(log_data)
        }

    def parse_log_file(self, file_path: str, db: Session) -> Dict[str, Any]:
        """Парсинг файла с логами и сохранение в БД"""
        from .models import TerraformLog
        
        stats = {
            'total': 0,
            'parsed': 0,
            'errors': 0,
            'sections': {'plan': 0, 'apply': 0, 'validation': 0}
        }
        
        try:
            with open(file_path, 'r', encoding='utf-8') as file:
                db_logs = []
                
                for line_number, line in enumerate(file, 1):
                    line = line.strip()
                    if not line:
                        continue
                    
                    stats['total'] += 1
                    
                    try:
                        log_data = json.loads(line)
                        parsed_log = self.parse_single_log(log_data)
                        
                        db_log = TerraformLog(
                            level=parsed_log['level'],
                            message=parsed_log['message'],
                            timestamp=parsed_log['timestamp'],
                            module=parsed_log['module'],
                            tf_req_id=parsed_log['tf_req_id'],
                            tf_resource_type=parsed_log['tf_resource_type'],
                            tf_rpc=parsed_log['tf_rpc'],
                            raw_data=parsed_log['raw_data']
                        )
                        db_logs.append(db_log)
                        
                        section = parsed_log['section']
                        if section and section in stats['sections']:
                            stats['sections'][section] += 1
                        
                        stats['parsed'] += 1
                        
                    except json.JSONDecodeError as e:
                        print(f"Ошибка парсинга JSON в строке {line_number}: {e}")
                        stats['errors'] += 1
                    except Exception as e:
                        print(f"Ошибка обработки строки {line_number}: {e}")
                        stats['errors'] += 1
                
                if db_logs:
                    db.add_all(db_logs)
                    db.commit()
                
        except FileNotFoundError:
            print(f"Файл не найден: {file_path}")
            stats['errors'] = stats['total']
        except Exception as e:
            print(f"Ошибка чтения файла: {e}")
            db.rollback()
            stats['errors'] = stats['total']
        
        return stats

    def parse_logs_batch(self, logs_data: List[Dict[str, Any]], db: Session) -> Dict[str, Any]:
        """Пакетный парсинг логов из списка словарей"""
        from .models import TerraformLog
        
        stats = {
            'total': len(logs_data),
            'parsed': 0,
            'errors': 0,
            'sections': {'plan': 0, 'apply': 0, 'validation': 0}
        }
        
        db_logs = []
        
        for log_data in logs_data:
            try:
                parsed_log = self.parse_single_log(log_data)
                db_log = TerraformLog(
                    level=parsed_log['level'],
                    message=parsed_log['message'],
                    timestamp=parsed_log['timestamp'],
                    module=parsed_log['module'],
                    tf_req_id=parsed_log['tf_req_id'],
                    tf_resource_type=parsed_log['tf_resource_type'],
                    tf_rpc=parsed_log['tf_rpc'],
                    raw_data=parsed_log['raw_data']
                )
                db_logs.append(db_log)
                
                #обновление статистики секций
                section = parsed_log['section']
                if section and section in stats['sections']:
                    stats['sections'][section] += 1
                
                stats['parsed'] += 1
                
            except Exception as e:
                print(f"Ошибка парсинга лога: {e}")
                stats['errors'] += 1
        
        if db_logs:
            db.add_all(db_logs)
            db.commit()
        
        return stats

    def analyze_log_structure(self, file_path: str) -> Dict[str, Any]:
        """Анализ структуры логов без сохранения в БД"""
        analysis = {
            'total_lines': 0,
            'valid_json': 0,
            'levels': {},
            'modules': {},
            'resource_types': {},
            'rpc_types': {},
            'timestamp_format_ok': 0,
            'common_fields': set()
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
                        
                        #анализ полей
                        analysis['common_fields'].update(log_data.keys())
                        
                        #уровни логированя
                        level = log_data.get('@level', 'unknown')
                        analysis['levels'][level] = analysis['levels'].get(level, 0) + 1
                        
                        #модули
                        module = log_data.get('@module', 'unknown')
                        analysis['modules'][module] = analysis['modules'].get(module, 0) + 1
                        
                        #типы ресурсов
                        resource_type = log_data.get('tf_resource_type')
                        if resource_type:
                            analysis['resource_types'][resource_type] = analysis['resource_types'].get(resource_type, 0) + 1
                        
                        #rpc типы
                        rpc_type = log_data.get('tf_rpc')
                        if rpc_type:
                            analysis['rpc_types'][rpc_type] = analysis['rpc_types'].get(rpc_type, 0) + 1
                        
                        timestamp = log_data.get('@timestamp')
                        if timestamp and self.parse_timestamp(timestamp):
                            analysis['timestamp_format_ok'] += 1
                            
                    except json.JSONDecodeError:
                        continue
            
            analysis['common_fields'] = list(analysis['common_fields'])
            
        except FileNotFoundError:
            print(f"Файл не найден: {file_path}")
        
        return analysis

parser = TerraformLogParser()
import uvicorn
import os
import sys

def main():
    current_dir = os.path.dirname(os.path.abspath(__file__))
    sys.path.insert(0, current_dir)
    
    print("API будет доступно по адресу: http://localhost:8000")
    print("Документация: http://localhost:8000/docs")
    
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        reload_dirs=["app"],
        access_log=True,
        log_level="info"
    )

if __name__ == "__main__":
    main()

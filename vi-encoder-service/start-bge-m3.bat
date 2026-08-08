@echo off
REM ============================================================
REM  start-bge-m3.bat  —  Launch the BGE-M3 FAQ microservice
REM ============================================================

set HF_HUB_DISABLE_SYMLINKS_WARNING=1
set PYTHONIOENCODING=utf-8

echo [BGE-M3] Activating venv at C:\pb ...
call C:\pb\Scripts\activate.bat

echo [BGE-M3] Starting service on http://localhost:5051 ...
uvicorn main:app --port 5051 --reload

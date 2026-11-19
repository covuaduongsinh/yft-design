@echo off
title yft-design Fullstack Launcher
echo ====================================================
echo    yft-design: Khoi dong Fullstack (Backend + Frontend)
echo ====================================================
echo.
echo [1/2] Dang khoi dong Auth Backend tai http://127.0.0.1:8788 ...
start "yft-design Auth Backend" node server/index.mjs
timeout /t 2 /nobreak > nul
echo [2/2] Dang khoi dong Frontend Dev Server tai http://localhost:5174 ...
pnpm dev
pause

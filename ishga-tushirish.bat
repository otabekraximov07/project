@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist dist\index.html (
  call npm install || goto :err
  call npm run build || goto :err
)
echo Server ishga tushmoqda: http://localhost:3000
echo To'xtatish uchun Ctrl+C bosing.
call npm start
goto :eof

:err
echo Xatolik yuz berdi. Yuqoridagi matnni nusxalab Claude'ga yuboring.
pause

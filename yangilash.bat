@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo === HamrohNasiya Undiruv: yangilash ===
echo Ma'lumotlar (data papkasi) saqlanib qoladi.
echo.
git pull --ff-only || goto :err
call npm install || goto :err
call npm run build || goto :err
echo.
echo Yangilandi. Server ishga tushmoqda: http://localhost:3000
echo To'xtatish uchun Ctrl+C bosing.
echo.
call npm start
goto :eof

:err
echo.
echo Xatolik yuz berdi. Yuqoridagi matnni nusxalab Claude'ga yuboring.
pause

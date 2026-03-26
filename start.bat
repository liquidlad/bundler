@echo off
cd /d "%~dp0"
if exist .next rmdir /s /q .next
echo Starting Bundler...
echo Open http://localhost:3000 in your browser
start http://localhost:3000
npx next dev -p 3000

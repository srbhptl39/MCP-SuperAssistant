@echo off
:: Install dependencies if missing
if not exist "node_modules" call pnpm install

:: Build project
call pnpm build

:: Check if icon-16.png exists in dist, if not copy from icon-34.png
if exist "dist\icon-34.png" (
    if not exist "dist\icon-16.png" (
        echo Missing icon-16.png detected. Creating copy from icon-34.png...
        copy "dist\icon-34.png" "dist\icon-16.png"
    )
)

pause
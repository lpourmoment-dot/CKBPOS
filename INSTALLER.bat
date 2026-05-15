@echo off
title CKBPOS - Installation
color 0A
cls

echo.
echo  ██████╗██╗  ██╗██████╗ ██████╗  ██████╗ ███████╗
echo ██╔════╝██║ ██╔╝██╔══██╗██╔══██╗██╔═══██╗██╔════╝
echo ██║     █████╔╝ ██████╔╝██████╔╝██║   ██║███████╗
echo ██║     ██╔═██╗ ██╔══██╗██╔═══╝ ██║   ██║╚════██║
echo ╚██████╗██║  ██╗██████╔╝██║     ╚██████╔╝███████║
echo  ╚═════╝╚═╝  ╚═╝╚═════╝ ╚═╝      ╚═════╝ ╚══════╝
echo.
echo  Point de Vente Professionnel v1.0
echo  ====================================
echo.

:: Check Node.js
echo [1/4] Verification de Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERREUR: Node.js n'est pas installe!
    echo Telechargez-le sur: https://nodejs.org
    pause
    exit /b 1
)
echo OK - Node.js detecte

:: Check credentials.json
echo [2/4] Verification du fichier credentials.json...
if not exist "credentials.json" (
    echo ATTENTION: credentials.json introuvable!
    echo Creez ce fichier avec vos credentials Google OAuth.
    echo Consultez le README.md pour les instructions.
    echo.
    pause
)

:: Install dependencies
echo [3/4] Installation des dependances npm...
echo Cela peut prendre 2-5 minutes...
echo.
call npm install
if %errorlevel% neq 0 (
    echo ERREUR lors de l'installation!
    echo Essayez de lancer en tant qu'Administrateur.
    pause
    exit /b 1
)
echo OK - Dependances installees

:: Rebuild native modules
echo [4/4] Compilation des modules natifs...
call npm rebuild better-sqlite3 2>nul
echo OK

echo.
echo ====================================
echo  Installation terminee avec succes!
echo ====================================
echo.
echo Pour demarrer CKBPOS, lancez: npm run dev
echo.
echo Compte admin par defaut:
echo   Email   : admin@ckbpos.com
echo   Password: admin123
echo.
echo IMPORTANT: Changez le mot de passe apres la premiere connexion!
echo.
pause

@echo off
setlocal
pushd "%~dp0.." || exit /b 1
set "STARTFIT_PYTHON="
set "STARTFIT_PYTHON_OPT="

if exist ".venv\Scripts\python.exe" call :try_python "%CD%\.venv\Scripts\python.exe"
if not defined STARTFIT_PYTHON call :try_python py.exe -3
if not defined STARTFIT_PYTHON (
  for /f "delims=" %%P in ('where.exe python.exe 2^>nul ^| findstr.exe /i /v /c:"\Microsoft\WindowsApps"') do call :try_python "%%P"
)
if defined STARTFIT_PYTHON goto prepare

where.exe winget.exe >nul 2>&1
if errorlevel 1 (
  echo WinGet was not found. Install CPython 3.9+ from python.org, then rerun this command. 1>&2
  popd
  exit /b 1
)
winget install --id Python.Python.3.14 --exact --scope user --source winget
if errorlevel 1 (
  popd
  exit /b 1
)

for %%D in (Python314 Python314-64 Python314-arm64) do (
  if exist "%LOCALAPPDATA%\Programs\Python\%%D\python.exe" call :try_python "%LOCALAPPDATA%\Programs\Python\%%D\python.exe"
)
if not defined STARTFIT_PYTHON call :try_python py.exe -3.14
if not defined STARTFIT_PYTHON (
  echo Python was installed. Open a new terminal so the updated PATH can load, then rerun this command. 1>&2
  popd
  exit /b 1
)

:prepare
"%STARTFIT_PYTHON%" %STARTFIT_PYTHON_OPT% scripts\setup_environment.py
set "result=%errorlevel%"
popd
exit /b %result%

:try_python
if defined STARTFIT_PYTHON exit /b 0
"%~1" %2 -c "import ensurepip, sys, venv; sys.exit(not (sys.implementation.name == 'cpython' and sys.version_info >= (3, 9)))" >nul 2>&1
if errorlevel 1 exit /b 0
set "STARTFIT_PYTHON=%~1"
set "STARTFIT_PYTHON_OPT=%2"
exit /b 0

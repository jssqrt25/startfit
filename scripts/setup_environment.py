import os
import subprocess
import sys
import venv
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
VENV = ROOT / ".venv"
WINDOWS = sys.platform == "win32"
BIN = VENV / ("Scripts" if WINDOWS else "bin")
PYTHON = BIN / ("python.exe" if WINDOWS else "python")
NODE = BIN / ("node.exe" if WINDOWS else "node")
NPM_CLI = (BIN if WINDOWS else VENV / "lib") / "node_modules/npm/bin/npm-cli.js"
NODE_VERSION = "25.8.2"


def run(command):
    env = os.environ.copy()
    env["PATH"] = str(BIN) + os.pathsep + env.get("PATH", "")
    print("+", " ".join(map(str, command)), flush=True)
    subprocess.run(command, cwd=ROOT, env=env, check=True)


def bootstrap():
    if sys.implementation.name != "cpython" or sys.version_info < (3, 9):
        raise SystemExit("Install CPython 3.9 or newer first. See README.md.")

    if not PYTHON.is_file():
        print("Creating Python virtual environment...", flush=True)
        venv.EnvBuilder(with_pip=True).create(VENV)

    run([PYTHON, "-m", "pip", "install", "-r", ROOT / "requirements.txt"])
    run([PYTHON, "-m", "nodeenv", "-p", "--node", NODE_VERSION, "--prebuilt"])
    run([NODE, "--version"])
    run([NODE, NPM_CLI, "--version"])
    run([NODE, NPM_CLI, "ci"])

    print("Environment is ready. See README.md for the app and test commands.")


if __name__ == "__main__":
    bootstrap()

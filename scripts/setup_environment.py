import subprocess
import sys
import venv
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
VENV = ROOT / ".venv"
NODE_VERSION = "25.8.2"
NPM_VERSION = "11.11.1"


def run(command):
    print("+", " ".join(str(part) for part in command))
    subprocess.run(command, cwd=ROOT, check=True)


def executable(directory, name):
    if sys.platform == "win32":
        for suffix in (".exe", ".cmd", ".bat"):
            candidate = directory / (name + suffix)
            if candidate.exists():
                return candidate
    return directory / name


def ensure_python():
    if sys.version_info < (3, 9):
        raise SystemExit("Python 3.9 or newer is required.")
    if sys.implementation.name != "cpython":
        raise SystemExit("CPython 3.9 or newer is required.")


def bootstrap():
    ensure_python()

    if not VENV.exists():
        print("Creating Python virtual environment...")
        venv.EnvBuilder(with_pip=True).create(VENV)

    scripts = VENV / ("Scripts" if sys.platform == "win32" else "bin")
    python = executable(scripts, "python")
    run([python, "-m", "pip", "install", "--upgrade", "pip"])
    run([python, "-m", "pip", "install", "-r", ROOT / "requirements.txt"])

    nodeenv = executable(scripts, "nodeenv")
    run([
        nodeenv,
        "-p",
        "--node",
        NODE_VERSION,
        "--npm",
        NPM_VERSION,
        "--prebuilt",
    ])

    npm = executable(scripts, "npm")
    run([npm, "ci"])

    print("Environment is ready.")


if __name__ == "__main__":
    bootstrap()

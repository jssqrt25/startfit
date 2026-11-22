#!/usr/bin/env bash
set -euo pipefail

project=$(cd -- "$(dirname -- "$0")/.." && pwd)
platform=$(uname -s)
cd "$project"

usable_python() {
  "$1" -c 'import ensurepip, sys, venv; sys.exit(not (sys.implementation.name == "cpython" and sys.version_info >= (3, 9)))' >/dev/null 2>&1
}

python=""
for candidate in "$project/.venv/bin/python" "$(command -v python3.14 || true)" "$(command -v python3 || true)"; do
  [[ -n "$candidate" && -x "$candidate" ]] || continue
  if [[ "$platform" == Darwin && "$candidate" == /usr/bin/python3 ]] &&
     ! xcode-select -p >/dev/null 2>&1; then
    continue
  fi
  if usable_python "$candidate"; then
    python="$candidate"
    break
  fi
done

if [[ -z "$python" ]]; then
  case "$platform" in
    Darwin)
      if command -v brew >/dev/null 2>&1; then
        brew install python@3.14
        python="$(brew --prefix python@3.14)/bin/python3.14"
      else
        download_dir=$(mktemp -d)
        package="$download_dir/python-3.14.10-macos11.pkg"
        trap 'rm -f -- "$package"; rmdir -- "$download_dir"' EXIT
        curl -fL https://www.python.org/ftp/python/3.14.10/python-3.14.10-macos11.pkg -o "$package"
        printf '%s  %s\n' '286c7018aa2730f6747ca433dccdc2b31be45f078a9ea0ffa44d5f06368fd2d7' "$package" |
          shasum -a 256 -c -
        sudo /usr/sbin/installer -pkg "$package" -target /
        "/Applications/Python 3.14/Install Certificates.command"
        python="/Library/Frameworks/Python.framework/Versions/3.14/bin/python3.14"
      fi
      ;;
    Linux)
      if ! command -v apt-get >/dev/null 2>&1; then
        echo "Install CPython 3.9 or newer with venv for your distribution, then rerun this command." >&2
        exit 1
      fi
      sudo apt-get update
      sudo apt-get install python3 python3-venv
      python=$(command -v python3)
      ;;
    *)
      echo "Install CPython 3.9 or newer with venv first. See README.md." >&2
      exit 1
      ;;
  esac
fi

if ! usable_python "$python"; then
  echo "A usable CPython 3.9+ installation with venv was not found. See README.md." >&2
  exit 1
fi

exec "$python" scripts/setup_environment.py

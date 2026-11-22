# StartFit

StartFit은 시간표와 과제·시험 정보를 바탕으로 공강에 학습을 배정하고, 집중 타이머로 바로 시작할 수 있게 돕는 웹 앱이다. HTML, CSS, JavaScript로 실행되며 시간표와 학습 기록은 같은 브라우저의 `localStorage`에 저장된다.

## 설치

`index.html`이 있는 프로젝트 폴더를 터미널에서 열고, 운영체제에 맞는 명령 **한 줄**을 실행한다.

**macOS 또는 Ubuntu·Debian**

```bash
bash scripts/setup.sh
```

**Windows PowerShell**

```powershell
.\scripts\setup.cmd
```

스크립트가 Python을 확인한다. 사용 가능한 CPython 3.9 이상이 있으면 재사용하고, 없으면 운영체제에 맞는 방법으로 설치한다. macOS는 Homebrew가 있으면 사용하고, 없으면 Python 공식 설치 파일을 사용한다. Ubuntu·Debian은 `apt`, Windows는 WinGet을 사용한다. 처음 설치할 때 인터넷 연결과 시스템 설치 권한이 필요할 수 있다. Windows에서 WinGet이 없거나 설치 후 경로 갱신이 필요하다는 안내가 나오면 아래 수동 설치 방법을 참고한다.

이어서 `.venv`를 만들고 [requirements.txt](requirements.txt)의 `nodeenv`로 Node.js 25.8.2와 함께 제공되는 npm 11.11.1을 준비한다. [package-lock.json](package-lock.json)을 기준으로 Jest 29.7.0을 포함한 npm 패키지를 설치한다.

<details>
<summary>Python을 직접 설치해 환경을 준비하는 방법</summary>

### Python 직접 설치

터미널에서 macOS·Linux는 `python3 --version`, Windows는 `py -3 --version`으로 확인한다. **CPython 3.9 이상**이 있고 가상 환경을 만들 수 있으면 환경 스크립트 직접 실행으로 이동한다. 없거나 버전이 낮으면 아래에서 운영체제에 맞는 설치 방법을 선택한다. 처음 설치할 때는 인터넷 연결이 필요하다.

#### macOS

Homebrew가 설치되어 있다면 다음 명령으로 Python을 설치하고 확인한다.

```bash
brew install python@3.14
python3.14 --version
```

Homebrew 없이 설치하려면 터미널에서 Python 공식 설치 파일을 내려받아 SHA-256을 확인한 뒤 설치한다. `sudo`는 macOS 관리자 권한을 요청한다.

```bash
python_download_dir="$(mktemp -d)" &&
python_pkg="$python_download_dir/python-3.14.10-macos11.pkg" &&
curl -fL https://www.python.org/ftp/python/3.14.10/python-3.14.10-macos11.pkg -o "$python_pkg" &&
printf '%s  %s\n' '286c7018aa2730f6747ca433dccdc2b31be45f078a9ea0ffa44d5f06368fd2d7' "$python_pkg" | shasum -a 256 -c - &&
sudo /usr/sbin/installer -pkg "$python_pkg" -target / &&
"/Applications/Python 3.14/Install Certificates.command"
```

설치 후 터미널을 새로 열고 `python3.14 --version`을 확인한다. 터미널에서 공식 설치 파일을 받기 어려우면 Python 다운로드 페이지에서 macOS 설치 파일을 열고 설치 후 **Install Certificates.command**를 실행한다. [Homebrew 설치 명령](https://formulae.brew.sh/formula/python@3.14) · [Python 공식 설치 파일](https://www.python.org/downloads/release/python-31410/) · [macOS 인증서 설치 안내](https://docs.python.org/3.14/using/mac.html#installation-steps)

#### Windows PowerShell

```powershell
winget install --id Python.Python.3.14 --exact
```

설치 후 PowerShell을 새로 열고 `py -3.14 --version`을 확인한다. `winget`이 없는 경우 Python 공식 다운로드 페이지에서 Windows용 설치 파일을 사용하고 Python 실행기와 PATH 옵션을 확인한다. [Microsoft의 WinGet 설치 안내](https://learn.microsoft.com/en-us/windows/python/beginners) · [Python 공식 설치 파일](https://www.python.org/downloads/release/python-31410/)

#### Ubuntu 또는 Debian

```bash
sudo apt update && sudo apt install python3 python3-venv
python3 --version
```

[Ubuntu의 Python 설치 안내](https://documentation.ubuntu.com/ubuntu-for-developers/howto/python-setup/)

### 환경 스크립트 직접 실행

소스를 내려받은 다음 `index.html`, `requirements.txt`, `scripts` 폴더가 함께 있는 디렉터리를 터미널에서 연다.

macOS 또는 Linux에서 기존 Python을 사용하는 경우

```bash
python3 scripts/setup_environment.py
```

위에서 macOS용 Python 3.14를 새로 설치했다면 `python3.14 scripts/setup_environment.py`를 사용한다.

Windows PowerShell에서는 기본 Python 3을 사용한다. 위에서 설치한 3.14를 명시하려면 `py -3.14`로 바꾸면 된다.

```powershell
py -3 scripts/setup_environment.py
```

설치 스크립트는 `.venv`를 만들고 [requirements.txt](requirements.txt)의 `nodeenv`를 설치한다. 이어서 `.venv`에 Node.js 25.8.2와 함께 제공되는 npm 11.11.1을 준비하고, [package-lock.json](package-lock.json)을 기준으로 Jest 29.7.0을 포함한 npm 의존성을 설치한다. `requirements.txt`는 Python 설치 후에 읽는 pip 패키지 목록이다. Python은 위의 운영체제별 방법으로 설치한다. [Node.js 배포본의 npm 버전](https://nodejs.org/en/download/archive/v25.8.2)

</details>

## 실행

설치 스크립트를 실행한 프로젝트 폴더에서 아래 명령을 실행한다.

macOS 또는 Linux

```bash
./.venv/bin/python -m http.server 8000 --bind 127.0.0.1
```

Windows PowerShell

```powershell
& .\.venv\Scripts\python.exe -m http.server 8000 --bind 127.0.0.1
```

브라우저에서 [http://127.0.0.1:8000/](http://127.0.0.1:8000/)을 연다. 서버는 터미널에서 `Ctrl+C`로 종료한다. 앱 화면만 보려면 설치한 Python으로 `python3 -m http.server 8000 --bind 127.0.0.1` 또는 Windows의 `py -3 -m http.server 8000 --bind 127.0.0.1`을 바로 실행할 수도 있다. 공휴일 조회에는 인터넷 연결이 필요하며, 학습 계획은 등록한 시간표와 공부 가능 시간을 바탕으로 계산한다.

## Jest 단위 테스트

서버를 켜 둔 경우에는 프로젝트 폴더에서 두 번째 터미널을 열고 실행한다.

macOS 또는 Linux

```bash
source .venv/bin/activate
npm test -- --runInBand --verbose
```

Windows PowerShell

```powershell
$env:Path = "$($PWD.Path)\.venv\Scripts;$env:Path"
& .\.venv\Scripts\npm.cmd test -- --runInBand --verbose
```

| 테스트 파일 | 확인한 동작 | 결과 |
|---|---|---|
| [tests/engine.test.js](tests/engine.test.js) | 분할수업, 인접 시간 허용, 겹침 예외, 빈 일정 예외, 수업을 제외한 공강, 빈 계획, 미배정 분량 | 7개 통과 |
| [tests/holidays.test.js](tests/holidays.test.js) | 정상 윤년 날짜 허용과 존재하지 않는 날짜 2개 거부 | 3개 통과 |

```text
Test Suites: 2 passed, 2 total
Tests:       10 passed, 10 total
```

## 사용법과 MVP

1. **나의 시간표**에서 수업을 등록한다. 분할수업을 켜면 일정을 함께 추가할 수 있고, 개별 설정으로 요일별 시간을 지정할 수 있다.
2. **학습 등록**에서 시간표 과목을 선택해 과제나 시험을 등록한다. **과제와 시험**에서 남은 시간을 수정하거나 완료 처리할 수 있다.
3. **학습 계획**에서 수업을 제외한 공강의 일별 배정과 미배정 안내를 확인한다.
4. **오늘의 시작**에서 가능한 시간 안에서 집중 타이머를 실행한다. 종료 후 남은 시간을 저장하고 같은 주소에서 다시 열면 학습 기록을 확인할 수 있다.

| MVP | 상태 | 확인 내용 |
|---|---|---|
| 시간표와 분할수업 | 완성 | 시간 연동, 요일별 개별 설정, 주간 시간표 반영 |
| 학습 항목 등록 | 완성 | 과목 선택, 과제·시험 등록, 수정, 완료 처리 |
| 공강과 학습 계획 | 완성 | 수업을 제외한 공강 배정, 일별 분량, 미배정 안내 |
| 맞춤 집중 타이머 | 완성 | 집중 시작, 일시정지·재개, 시간 상한 확인 |
| 기록과 저장 | 완성 | 남은 분량과 집중 기록 저장 및 복원 |

## 계획 변경 사항

없음.

## 개발 과정과 증거

Copilot Chat으로 엔진과 공휴일 테스트를 작성했다. 공휴일 검증은 중단점에서 입력 날짜와 UTC 파싱 결과가 달라지는 것을 확인한 뒤 수정했다. 엔진 리팩토링에서는 시간 유효성 검사와 일정 겹침 판단을 분리하고, 요일별 일정 조회와 공강 시간 합산의 반복을 줄였다. 동일한 회귀 테스트 10개가 리팩토링 전후에 통과했다.

[기말보고서 PDF](StartFit_기말보고서.pdf)에 MVP 화면, Copilot 질문·응답, 디버깅과 코드 리뷰·리팩토링 캡처를 수록했다.

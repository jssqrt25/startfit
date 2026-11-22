// 엔진 API와 DOM 조회·HTML 이스케이프 유틸리티입니다.
const E = StartFit,
  $ = (s) => document.querySelector(s),
  esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
// localStorage에 학습 데이터를 저장할 때 사용하는 키입니다.
const KEY = "startfit-v1";
// 현재 화면, 계획 기준일, 과제 필터, 집중 타이머 상태입니다.
let view = "home",
  baseDate = E.dateKey(new Date()),
  filter = "all",
  timer = null,
  timerTick = null,
  storageOK = true;
// 오늘을 기준으로 지정한 날짜 뒤의 기본 마감 시각을 만듭니다.
const deadline = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return E.dateKey(d) + "T23:59";
};
// 저장된 데이터가 없을 때 사용할 초기 상태를 생성합니다.
const emptyState = () => ({
  courses: [],
  tasks: [],
  settings: E.normalizeSettings({ start: 540, end: 1080, weekend: true }),
  records: [],
  cancelledSessions: [],
  sampleCleanup: 1,
});
// 이전 데모 데이터가 남아 있으면 사용자 데이터에서 제거합니다.
function removeExamples(data) {
  if (data.sampleCleanup === 1) return data;
  return {
    ...data,
    courses: data.courses.filter(
      (c) => !["c1", "c2", "c3", "c4"].includes(c.id),
    ),
    tasks: data.tasks.filter((t) => !["t1", "t2", "t3", "t4"].includes(t.id)),
    records: data.records.filter(
      (r) => !["t1", "t2", "t3", "t4"].includes(r.taskId),
    ),
    sampleCleanup: 1,
  };
}
// 현재 사용자의 시간표·학습·기록을 보관하는 메모리 상태입니다.
let db;
// 저장된 상태를 읽고 형식을 정규화합니다.
try {
  const raw = localStorage.getItem(KEY);
  db = raw ? JSON.parse(raw) : emptyState();
  if (
    !Array.isArray(db.courses) ||
    !Array.isArray(db.tasks) ||
    !Array.isArray(db.records) ||
    !db.settings
  )
    throw Error();
  db = removeExamples(db);
  db.settings = E.normalizeSettings(db.settings);
  db.cancelledSessions = Array.isArray(db.cancelledSessions)
    ? db.cancelledSessions
    : [];
  localStorage.setItem(KEY, JSON.stringify(db));
} catch {
  db = emptyState();
  storageOK = false;
  setTimeout(
    () =>
      toast("기존 기록을 읽지 못했어요. 기록 보호를 위해 저장은 중지했어요."),
    500,
  );
}

// 변경된 상태를 localStorage와 메모리에 저장합니다.
function save(next) {
  try {
    if (!storageOK) throw Error();
    localStorage.setItem(KEY, JSON.stringify(next));
    db = next;
    return true;
  } catch {
    toast("저장하지 못했어요. 브라우저의 저장 설정을 확인해 주세요.");
    return false;
  }
}
// 토스트 메시지의 자동 닫힘 타이머 ID입니다.
let toastId;
// 화면 하단에 일시적인 알림 메시지를 표시합니다.
function toast(text) {
  $("#toast").textContent = text;
  $("#toast").classList.remove("hidden");
  clearTimeout(toastId);
  toastId = setTimeout(() => $("#toast").classList.add("hidden"), 4500);
}
// 요일 표시명과 시간표 과목별 색상 목록입니다.
const dayNames = ["일", "월", "화", "수", "목", "금", "토"],
  colors = [
    ["#eaeef9", "#8f9ccc"],
    ["#f0ebf7", "#b199c5"],
    ["#e9f3eb", "#8bb99a"],
    ["#fff0df", "#c4a472"],
  ];
// 날짜·시간 값을 한국어 화면 표시 형식으로 변환합니다.
const fmtDate = (t) =>
    new Date(t).toLocaleDateString("ko-KR", { month: "long", day: "numeric" }),
  fmtTime = (t) =>
    new Date(t).toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
// 계획 계산에 사용할 기준 날짜를 Date 객체로 반환합니다.
function base() {
  return baseDate === E.dateKey(new Date())
    ? new Date()
    : new Date(baseDate + "T00:00:00");
}
// 화면을 전환하고 새 화면을 렌더링합니다.
function navigate(v) {
  view = v;
  render();
}
// 학습 항목의 마감일까지 남은 기간을 표시 문자열로 만듭니다.
function remainingLabel(t) {
  const d = new Date(t.deadline),
    today = new Date();
  if (d < today) return "기한 지남";
  const days = Math.round(
    (new Date(E.dateKey(d) + "T00:00:00") -
      new Date(E.dateKey(today) + "T00:00:00")) /
      86400000,
  );
  return days === 0 ? "오늘 마감" : "D-" + days;
}
// 각 화면 상단에 공통 제목 영역을 생성합니다.
function heading(title, sub, action = "") {
  return `<div class="page-heading"><div><h1>${title}</h1>${sub ? `<p class="sub">${sub}</p>` : ""}</div>${action}</div>`;
}
// 비동기 계획 계산의 최신 요청을 추적하고 현재 계획을 저장합니다.
let renderVersion = 0,
  currentPlan = { blocks: [], ranked: [], slots: [], missing: [] };
// 현재 화면에 필요한 계획을 계산하고 UI를 다시 그립니다.
async function render() {
  const version = ++renderVersion;
  const snapshot = structuredClone(db);
  $("#content").setAttribute("aria-busy", "true");
  try {
    const result = await calculatePlan(
      snapshot,
      view === "plan" ? base() : new Date(),
    );
    if (version !== renderVersion) return;
    currentPlan = result;
  } catch {
    if (version !== renderVersion) return;
    toast("계획을 계산하지 못했어요. 입력 내용을 확인해 주세요.");
    return;
  } finally {
    if (version === renderVersion) $("#content").removeAttribute("aria-busy");
  }
  document
    .querySelectorAll("[data-view]")
    .forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  $("#dateTitle").textContent = new Date().toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
  if (view === "home") home();
  if (view === "timetable") timetable();
  if (view === "tasks") tasks();
  if (view === "plan") planView();
  document
    .querySelectorAll("[data-go]")
    .forEach((b) => (b.onclick = () => navigate(b.dataset.go)));
  const focusForm = $("#focusForm");
  if (focusForm)
    focusForm.onsubmit = (e) => {
      e.preventDefault();
      if (focusForm.reportValidity())
        start(focusForm.dataset.task, +$("#focusMinutes").value);
    };
  document
    .querySelectorAll("[data-settings]")
    .forEach((b) => (b.onclick = openSettings));
}
// 오늘의 시작 화면을 렌더링합니다.
function home() {
  const p = currentPlan,
    now = Date.now(),
    current = p.slots.find(
      (s) => s.start <= Math.ceil(now / 60000) * 60000 && s.end > now,
    ),
    next = p.blocks.find((b) => b.end > now),
    rec = current
      ? p.ranked.find((t) => t.deadlineMs > now && t.target > now)
      : p.ranked.find((t) => t.deadlineMs > now),
    space = current
      ? Math.floor(
          (Math.min(current.end, rec?.deadlineMs || Infinity) - now) / 60000,
        )
      : 0;
  const focusMinutes = db.records
    .filter((r) => r.day === E.dateKey(new Date()))
    .reduce((n, r) => n + r.minutes, 0);
  const todayBlocks = p.blocks.filter(
    (b) => E.dateKey(new Date(b.start)) === E.dateKey(new Date()),
  );
  $("#content").innerHTML =
    heading(
      "작은 시작이면 충분해요.",
      "오늘의 여유 시간을, 내일의 여유로 만들어 볼까요?",
      `<span class="date-pill">${new Date().getMonth() + 1}월 · ${dayNames[new Date().getDay()]}요일</span>`,
    ) +
    `<div class="home-layout"><div class="main-column"><section class="focus"><span class="overline">YOUR NEXT SMALL STEP</span><div class="orbit"></div><h2>${!db.courses.length ? "먼저, 내 시간표를 알려주세요." : !rec ? "오늘도 한 걸음 나아갔어요." : space >= 1 ? `${esc(rec.title)}<br>내 속도로 시작해 볼까요?` : "다음 작은 시작을 준비해요."}</h2><p>${!db.courses.length ? "수업을 등록하면 빈 시간에 맞춰 학습을 제안해 드려요." : !rec ? "새로운 과제나 시험을 등록하면 다음 계획을 세워드릴게요." : space >= 1 ? `${esc(rec.subject)} · ${remainingLabel(rec)} · ${rec.remaining}분 남음<br>기한까지의 여유와 난이도를 함께 고려했어요.` : next ? `다음 학습은 ${fmtDate(next.start)} ${fmtTime(next.start)}에 시작해요.<br>${esc(next.title)} · ${next.minutes}분` : "현재 설정한 시간에는 배정할 수 없어요. 공부 가능한 시간을 조정해 주세요."}</p>${space >= 1 && rec ? `<form id="focusForm" class="focus-form" data-task="${rec.id}"><label for="focusMinutes">집중할 시간</label><div class="focus-input-row"><input id="focusMinutes" name="minutes" type="number" min="1" max="${space}" step="1" placeholder="분 입력" required aria-describedby="focusHelp"><span>분</span><button type="submit" class="button lime">▶ 집중 시작</button></div><span id="focusHelp" class="tiny-label">지금 최대 ${space}분까지 설정할 수 있어요</span></form>` : `<div class="focus-buttons"><button class="button lime" data-go="${!db.courses.length ? "timetable" : !rec ? "tasks" : "plan"}">${!db.courses.length ? "시간표 등록하기" : !rec ? "학습 목록 보기" : "학습 계획 확인"}</button><button class="button quiet" data-settings>가능 시간 설정</button></div>`}</section><div class="stats"><div class="stat"><label>오늘 계획한 학습</label><strong>${todayBlocks.reduce((n, b) => n + b.minutes, 0)}<small>분</small></strong></div><div class="stat"><label>오늘 시작한 시간</label><strong>${focusMinutes}<small>분</small></strong></div><div class="stat"><label>기다리는 과제·시험</label><strong>${db.tasks.filter((t) => t.remaining > 0).length}<small>개</small></strong></div></div><section class="panel"><div class="panel-head"><h2>먼저 챙길 학습</h2><button class="link" data-go="tasks">전체 보기</button></div>${p.ranked.length ? p.ranked.slice(0, 4).map(taskRow).join("") : '<div class="empty"><p>등록한 학습이 없어요. 학습 등록 버튼으로 시작해 보세요.</p></div>'}</section>${p.missing.length ? `<div class="notice">목표 완료 시점까지 ${p.missing.reduce((n, m) => n + m.minutes, 0)}분이 배정되지 않았어요. 학습 계획에서 확인해 주세요.</div>` : ""}</div><div class="right-column"><section class="panel"><div class="panel-head"><h2 style="font-size:16px">오늘의 시간 흐름</h2><span class="pill">${dayNames[new Date().getDay()]}요일</span></div><div class="timeline">${todayTimeline(p)}</div></section><section class="panel"><div class="panel-head"><h2 style="font-size:16px">이번 주의 작은 시작</h2></div><div class="week-days">${weekDots()}</div></section><div class="hint-card"><h3>시간은 내가 정하고, 시작은 지금.</h3><p>다 끝내지 않아도 괜찮아요.<br>작게 시작하고, 남은 분량은 다시 맞춰요.</p></div></div></div>`;
}
// 홈 화면의 우선 학습 항목 한 줄을 생성합니다.
function taskRow(t) {
  return `<div class="task-row"><div class="type-icon ${t.type === "exam" ? "exam" : ""}">${t.type === "exam" ? "▤" : "✓"}</div><div class="task-info"><strong>${esc(t.title)}</strong><p>${esc(t.subject)} · ${t.type === "exam" ? "시험" : "과제"} · ${t.remaining}분 남음</p></div><span class="pill ${new Date(t.deadline) - new Date() < 3 * 86400000 ? "urgent" : ""}">${remainingLabel(t)}</span></div>`;
}
// 오늘의 수업과 학습 계획을 시간순 타임라인으로 생성합니다.
function todayTimeline(p) {
  const today = new Date(),
    items = E.sessionsOn(db, today);
  for (const b of p.blocks
    .filter((b) => E.dateKey(new Date(b.start)) === E.dateKey(today))
    .slice(0, 4)) {
    const d = new Date(b.start);
    items.push({
      start: d.getHours() * 60 + d.getMinutes(),
      title: b.title,
      end: d.getHours() * 60 + d.getMinutes() + b.minutes,
      free: true,
    });
  }
  return (
    items
      .sort((a, b) => a.start - b.start)
      .slice(0, 6)
      .map(
        (i) =>
          `<div class="timeline-item"><span class="timeline-time">${E.time(i.start)}</span><div class="timeline-block ${i.free ? "free" : ""}"><strong>${esc(i.title)}</strong><small>${E.time(i.start)} – ${E.time(i.end)}${i.free ? " · 학습" : ""}</small></div></div>`,
      )
      .join("") || '<p class="hint">오늘 예정된 수업과 학습이 없어요.</p>'
  );
}
// 이번 주 학습 기록을 요일별 표시로 생성합니다.
function weekDots() {
  const d = new Date(),
    dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return ["월", "화", "수", "목", "금", "토", "일"]
    .map((v, i) => {
      const x = new Date(d);
      x.setDate(x.getDate() + i);
      const n = db.records.filter((r) => r.day === E.dateKey(x)).length;
      return `<div class="week-day">${v}<b class="${n ? "today" : ""}">${n ? "✓" : x.getDate()}</b></div>`;
    })
    .join("");
}
// 시간표에서 보고 있는 주와 선택된 날짜입니다.
let weekOffset = 0,
  selectedDate = E.dateKey(new Date());
// 연도별 공휴일 조회 결과를 캐시합니다.
const holidayYears = new Map();
// 필요한 연도의 공휴일 정보를 불러오고 시간표를 갱신합니다.
async function loadHolidayYear(year, force = false) {
  if (!force && holidayYears.has(year)) return;
  const previous = holidayYears.get(year);
  holidayYears.set(year, {
    ...previous,
    status: "loading",
    items: previous?.items || [],
  });
  if (force && view === "timetable") render();
  const result = await StartFitHolidays.load(year, force);
  holidayYears.set(year, result);
  if (view === "timetable") render();
}
// 특정 날짜의 공휴일 이름을 반환합니다.
function holidayLabel(date) {
  return (holidayYears.get(Number(date.slice(0, 4)))?.items || [])
    .filter((h) => h.date === date)
    .map((h) => h.name)
    .join(" · ");
}
// 공휴일 상태와 목록을 보여주는 패널을 생성합니다.
function holidayPanel(year) {
  const data = holidayYears.get(year),
    items = data?.items || [];
  const status =
    !data || data.status === "loading"
      ? "공휴일 정보를 불러오는 중이에요."
      : data.status === "error"
        ? "공휴일 정보를 가져오지 못했어요. 다시 시도해 주세요."
        : data.status === "stale"
          ? "연결하지 못해 이전에 저장한 정보를 표시해요."
          : "한국 공휴일 정보를 불러왔어요.";
  return `<section class="panel holiday-panel"><div class="panel-head"><h2>${year}년 공휴일</h2><button class="button" data-refresh-holidays="${year}" ${data?.status === "loading" ? "disabled" : ""}>새로고침</button></div><p class="hint" role="status">${status}${data?.updatedAt ? " · 확인 " + new Date(data.updatedAt).toLocaleDateString("ko-KR") : ""}</p><p class="hint">학교의 실제 휴강 여부를 확인한 뒤 해당 수업을 눌러 휴강 처리해 주세요. 휴강 시간은 공부 가능 시간 안에서 학습 계획에 반영돼요.</p>${items.length ? `<details><summary>연간 공휴일 ${items.length}개 보기</summary><div class="holiday-list">${items.map((h) => `<div><time datetime="${h.date}">${esc(h.date.slice(5).replace("-", " / "))}</time><span>${esc(h.name)}</span></div>`).join("")}</div></details>` : ""}<a class="holiday-source" href="https://date.nager.at" target="_blank" rel="noopener noreferrer">자료 제공 Nager.Date · 학교 학사일정과 다를 수 있어요 ↗</a></section>`;
}
// 주간 시간표 화면을 렌더링하고 시간표 관련 이벤트를 연결합니다.
function timetable() {
  const now = new Date(),
    monday = new Date(now);
  monday.setDate(
    monday.getDate() - ((monday.getDay() + 6) % 7) + weekOffset * 7,
  );
  monday.setHours(0, 0, 0, 0);
  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return d;
  });
  if (!dates.some((d) => E.dateKey(d) === selectedDate))
    selectedDate = E.dateKey(dates[0]);
  const years = [...new Set(dates.map((d) => d.getFullYear()))];
  years.forEach((y) => loadHolidayYear(y));
  const days = dates.map((d) => ({
    d,
    key: E.dateKey(d),
    classes: E.sessionsOn(db, d),
  }));
  const values = days.flatMap((x) => {
    const c = E.daySettings(db.settings, x.d.getDay());
    const regular = db.courses
      .flatMap((c) => c.sessions)
      .filter((s) => s.day === x.d.getDay());
    return [
      ...(c.enabled ? [c.start, c.end] : []),
      ...regular.flatMap((s) => [s.start, s.end]),
    ];
  });
  const min = values.length ? Math.floor(Math.min(...values) / 60) * 60 : 540,
    max = values.length ? Math.ceil(Math.max(...values) / 60) * 60 : 1080,
    height = Math.max(240, (max - min) * 1.1),
    scale = height / (max - min),
    selected = days.find((d) => d.key === selectedDate);
  const cancellations = (db.cancelledSessions || []).filter(
    (c) =>
      days.some((d) => d.key === c.date) &&
      db.courses.some((x) => x.id === c.courseId),
  );
  const courseButton = (c, date, grid) =>
    `<button class="${grid ? "class-block" : "mobile-class"}" data-cancel-course="${esc(c.courseId)}" data-class-date="${date}" data-class-start="${c.start}" data-class-end="${c.end}" style="${grid ? `top:${(c.start - min) * scale}px;height:${Math.max(3, (c.end - c.start) * scale)}px;` : ""}background:${colors[c.color % 4][0]};border-color:${colors[c.color % 4][1]}" aria-label="${esc(c.title)} ${date} ${E.time(c.start)} 수업 휴강 설정"><strong>${esc(c.title)}</strong><small>${E.time(c.start)}–${E.time(c.end)}</small>${grid ? "" : "<span>휴강 설정 ›</span>"}</button>`;
  $("#content").innerHTML =
    heading(
      "나의 시간표",
      "",
      `<button class="button primary" id="newCourse">＋ 수업 등록</button>`,
    ) +
    `<div class="availability-toolbar"><button class="button" data-settings>공부 가능 시간 설정</button>${[
      "weekday",
      "weekend",
    ]
      .map((k) => {
        const v = E.daySettings(db.settings, k === "weekday" ? 1 : 6);
        return `<span>${k === "weekday" ? "평일" : "주말"} <b>${v.enabled ? E.time(v.start) + "–" + E.time(v.end) : "계획 없음"}</b></span>`;
      })
      .join("")}</div>
 <div class="week-toolbar"><button class="button" id="prevWeek" ${weekOffset <= 0 ? "disabled" : ""} aria-label="이전 주">‹</button><strong>${fmtDate(dates[0])} – ${fmtDate(dates[6])}</strong><button class="button" id="nextWeek" ${weekOffset >= 3 ? "disabled" : ""} aria-label="다음 주">›</button></div>
 <p class="hint">수업을 누르면 선택한 날짜만 휴강 처리할 수 있어요.</p>
 <div class="day-tabs class-day-tabs">${days.map((x) => `<button class="day-tab ${x.key === selectedDate ? "selected" : ""}" data-date="${x.key}" aria-pressed="${x.key === selectedDate}"><span>${dayNames[x.d.getDay()]}</span><b>${x.d.getDate()}</b>${holidayLabel(x.key) ? '<small class="holiday-dot" aria-label="공휴일">●</small>' : ""}</button>`).join("")}</div>
 <section class="panel desktop-calendar"><div class="table-scroll"><div class="calendar adaptive-calendar" style="--calendar-height:${height}px;--hour-height:${60 * scale}px"><div class="calendar-head"></div>${days.map((x) => `<div class="calendar-head ${holidayLabel(x.key) ? "holiday-day" : ""}">${dayNames[x.d.getDay()]} ${x.d.getDate()}${holidayLabel(x.key) ? `<small class="holiday-name">${esc(holidayLabel(x.key))}</small>` : ""}</div>`).join("")}<div class="hours">${Array.from({ length: (max - min) / 60 + 1 }, (_, i) => `<span class="hour" style="top:${i * 60 * scale}px">${E.time(min + i * 60)}</span>`).join("")}</div>${days.map((x) => `<div class="day-col">${x.classes.map((c) => courseButton(c, x.key, true)).join("")}</div>`).join("")}</div></div></section>
 <section class="mobile-class-list panel"><div class="panel-head"><h2>${fmtDate(selected.d)} ${dayNames[selected.d.getDay()]}요일</h2></div>${holidayLabel(selected.key) ? `<p class="holiday-label">${esc(holidayLabel(selected.key))}</p>` : ""}${selected.classes.map((c) => courseButton(c, selected.key, false)).join("") || '<p class="empty">이 날짜에는 수업이 없어요.</p>'}</section>
 ${cancellations.length ? `<section class="cancelled-list panel"><div class="panel-head"><h2>이번 주 휴강</h2><span class="sub">언제든 복원할 수 있어요</span></div>${cancellations.map((c) => `<div class="cancelled-item"><div><strong>${esc(db.courses.find((x) => x.id === c.courseId).name)}</strong><small>${fmtDate(c.date + "T00:00")} · ${E.time(c.start)}–${E.time(c.end)}</small></div><button class="button" data-restore="${esc(c.id)}">수업 복원</button></div>`).join("")}</section>` : ""}
 ${years.map(holidayPanel).join("")}<div class="class-list">${db.courses.map((c) => `<span class="class-chip">${esc(c.name)}<button data-delete-course="${c.id}" aria-label="${esc(c.name)} 전체 시간표에서 삭제">×</button></span>`).join("")}</div>`;
  document
    .querySelectorAll("[data-refresh-holidays]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          loadHolidayYear(Number(b.dataset.refreshHolidays), true)),
    );
  $("#newCourse").onclick = openCourse;
  $("#prevWeek").onclick = () => {
    weekOffset--;
    render();
  };
  $("#nextWeek").onclick = () => {
    weekOffset++;
    render();
  };
  document.querySelectorAll("[data-date]").forEach(
    (b) =>
      (b.onclick = () => {
        selectedDate = b.dataset.date;
        render();
      }),
  );
  document
    .querySelectorAll("[data-cancel-course]")
    .forEach((b) => (b.onclick = () => openClassCancellation(b.dataset)));
  document.querySelectorAll("[data-restore]").forEach(
    (b) =>
      (b.onclick = () => {
        const next = structuredClone(db);
        next.cancelledSessions = next.cancelledSessions.filter(
          (c) => c.id !== b.dataset.restore,
        );
        if (save(next)) {
          render();
          toast("해당 날짜의 수업을 복원하고 학습 계획을 갱신했어요.");
        }
      }),
  );
  document.querySelectorAll("[data-delete-course]").forEach(
    (b) =>
      (b.onclick = () => {
        if (
          !confirm(
            "이 과목을 모든 주의 시간표에서 삭제할까요? 하루만 휴강하려면 시간표의 수업을 눌러주세요.",
          )
        )
          return;
        const next = structuredClone(db);
        next.courses = next.courses.filter(
          (c) => c.id !== b.dataset.deleteCourse,
        );
        next.cancelledSessions = next.cancelledSessions.filter(
          (c) => c.courseId !== b.dataset.deleteCourse,
        );
        if (save(next)) render();
      }),
  );
}
// 현재 휴강 확인 창에서 처리할 수업 정보입니다.
let pendingCancellation = null;
// 선택한 날짜의 수업을 휴강 처리하는 확인 창을 엽니다.
function openClassCancellation(data) {
  pendingCancellation = {
    courseId: data.cancelCourse,
    date: data.classDate,
    start: +data.classStart,
    end: +data.classEnd,
  };
  const c = db.courses.find((c) => c.id === data.cancelCourse);
  $("#cancelClassInfo").textContent =
    `${c.name} · ${fmtDate(data.classDate + "T00:00")} ${E.time(+data.classStart)}–${E.time(+data.classEnd)}`;
  $("#cancelClassDialog").showModal();
}
$("#closeCancelClass").onclick = $("#keepClass").onclick = () =>
  $("#cancelClassDialog").close();
$("#confirmCancelClass").onclick = () => {
  if (!pendingCancellation) return;
  const next = structuredClone(db);
  if (
    !next.cancelledSessions.some(
      (c) =>
        c.courseId === pendingCancellation.courseId &&
        c.date === pendingCancellation.date &&
        c.start === pendingCancellation.start &&
        c.end === pendingCancellation.end,
    )
  )
    next.cancelledSessions.push({
      ...pendingCancellation,
      id: crypto.randomUUID(),
    });
  if (save(next)) {
    $("#cancelClassDialog").close();
    pendingCancellation = null;
    render();
    toast("이 날짜만 휴강 처리했어요. 비워진 시간을 학습 계획에 반영했어요.");
  }
};
// 과제·시험 목록을 필터별로 렌더링합니다.
function tasks() {
  const list = db.tasks.filter((t) =>
    filter === "done"
      ? t.remaining === 0
      : t.remaining > 0 && (filter === "all" || t.type === filter),
  );
  $("#content").innerHTML =
    heading("과제와 시험", "해야 할 일을 꺼내놓으면, 시작할 순서가 보여요.") +
    `<div class="toolbar">${[
      ["all", "전체"],
      ["assignment", "과제"],
      ["exam", "시험"],
      ["done", "완료"],
    ]
      .map(
        ([v, t]) =>
          `<button class="button ${v === filter ? "primary" : ""}" data-filter="${v}">${t}</button>`,
      )
      .join(
        "",
      )}</div><div class="task-grid">${list.map((t) => `<article class="panel task-card"><div class="card-top"><span class="pill">${t.type === "exam" ? "시험" : "과제"} · ${esc(t.subject)}</span><span class="pill ${t.remaining > 0 ? "urgent" : ""}">${t.remaining === 0 ? "완료" : remainingLabel(t)}</span></div><h3>${esc(t.title)}</h3><div class="meta">기한 ${fmtDate(t.deadline)} ${fmtTime(t.deadline)}<br>난이도 ${t.difficulty === 1 ? "쉬움" : t.difficulty === 1.4 ? "어려움" : "보통"} · 예상 ${t.remaining}분 남음</div><div class="actions"><button class="button" data-edit-task="${t.id}">정보 수정</button>${t.remaining > 0 ? `<button class="button primary" data-done="${t.id}">완료 처리</button>` : ""}</div></article>`).join("") || `<div class="panel empty"><h2>${filter === "done" ? "완료한 학습이 없어요." : "남아 있는 학습이 없어요."}</h2><p>${filter === "done" ? "완료 처리한 과제와 시험은 여기에 모여요." : "새로운 과제나 시험을 학습 등록에서 추가해 보세요."}</p></div>`}</div>`;
  document.querySelectorAll("[data-filter]").forEach(
    (b) =>
      (b.onclick = () => {
        filter = b.dataset.filter;
        render();
      }),
  );
  document
    .querySelectorAll("[data-edit-task]")
    .forEach((b) => (b.onclick = () => openTask(b.dataset.editTask)));
  document.querySelectorAll("[data-done]").forEach(
    (b) =>
      (b.onclick = () => {
        const next = structuredClone(db);
        next.tasks.find((t) => t.id === b.dataset.done).remaining = 0;
        if (save(next)) {
          render();
          toast("완료했어요. 수고했어요!");
        }
      }),
  );
}
// 계산된 학습 계획과 우선순위를 날짜별로 렌더링합니다.
function planView() {
  const p = currentPlan,
    groups = {};
  for (const b of p.blocks)
    (groups[E.dateKey(new Date(b.start))] ??= []).push(b);
  $("#content").innerHTML =
    heading(
      "나에게 맞춘 학습 계획",
      "우선순위를 정하고, 가능한 시간에 나누어 배정했어요.",
      `<button class="button" data-settings>가능 시간 설정</button>`,
    ) +
    `<div class="toolbar"><label style="margin:0">계획 기준일 <input id="baseDate" type="date" value="${baseDate}"></label><span class="sub">기준일부터 4주 · 목표는 기한 하루 전 완료<br>목표일이 지났다면 실제 기한까지 배정해요.</span></div>${p.missing.length ? `<div class="notice"><b>계획 조정이 필요해요</b><br>${p.missing.map((m) => `${esc(m.title)}: ${m.minutes}분 ${m.expired ? "(기한 지남)" : "미배정"}`).join("<br>")}<br>가능 시간을 늘리거나 예상 남은 시간을 조정해 주세요.</div>` : ""}<section class="panel priority-panel"><div class="panel-head"><h2>학습 우선순위</h2></div>${p.ranked.map((t, i) => `<div class="priority-item"><span class="rank">${i + 1}</span><div><strong>${esc(t.title)}</strong><small>${esc(t.subject)} · ${t.remaining}분 남음</small></div></div>`).join("") || '<p class="hint">등록한 학습이 없어요.</p>'}</section><section class="panel">${
      Object.entries(groups)
        .map(
          ([day, blocks]) =>
            `<div class="plan-day"><h3>${fmtDate(day + "T00:00")} · ${dayNames[new Date(day + "T00:00").getDay()]}요일 <span class="pill">${blocks.reduce((n, b) => n + b.minutes, 0)}분</span></h3>${blocks.map((b) => `<div class="plan-slot"><time>${fmtTime(b.start)}–${fmtTime(b.end)}</time><b>${esc(b.title)}</b><span>${b.minutes}분</span></div>`).join("")}</div>`,
        )
        .join("") ||
      `<div class="empty"><h2>${!db.courses.length ? "시간표를 먼저 등록해 주세요." : "배정된 학습이 없어요."}</h2><p>수업과 학습 항목, 공부 가능 시간을 확인해 주세요.</p></div>`
    }</section><p class="hint">추천은 남은 시간 ÷ 확보 가능한 시간 × 난이도로 계산해요. 실제 진척에 맞춰 학습 정보를 수정하면 계획이 다시 계산돼요.</p>`;
  $("#baseDate").onchange = (e) => {
    if (e.target.value) {
      baseDate = e.target.value;
      render();
    }
  };
}
// 수업 등록 폼에 추가할 요일·시작·종료 입력 행을 생성합니다.
function sessionRow() {
  return `<div class="session-row"><label>요일<select class="day">${[1, 2, 3, 4, 5, 6, 0].map((v) => `<option value="${v}">${dayNames[v]}요일</option>`).join("")}</select></label><label>시작<input class="start" type="text" readonly aria-haspopup="dialog" value="09:00" required></label><label>종료<input class="end" type="text" readonly aria-haspopup="dialog" value="10:30" required></label></div>`;
}
// 분할 수업의 시간 연동 상태를 폼에 반영합니다.
function syncSessionTimes() {
  const rows = [...$("#sessionRows").children],
    linked = $("#split").checked && !$("#individualTimes").checked;
  for (const [i, row] of rows.entries()) {
    for (const field of ["start", "end"]) {
      const input = row.querySelector("." + field);
      input.readOnly = true;
      input.dataset.linked = linked && i > 0 ? "true" : "false";
      input.setAttribute("aria-disabled", String(linked && i > 0));
      if (linked && i > 0)
        input.value = rows[0].querySelector("." + field).value;
    }
  }
  $("#syncHint").classList.toggle("hidden", !linked);
}
// 새 수업 등록 폼을 초기화하고 엽니다.
function openCourse() {
  $("#courseForm").reset();
  $("#courseError").textContent = "";
  $("#sessionRows").innerHTML = sessionRow();
  $("#addSession").classList.add("hidden");
  $("#individualWrap").classList.add("hidden");
  $("#syncHint").classList.add("hidden");
  $("#courseDialog").showModal();
}
// 수업 등록 폼에 분할 수업 시간 행을 하나 추가합니다.
function appendSession() {
  const rows = $("#sessionRows");
  if (rows.children.length >= 7) return;
  const first = rows.firstElementChild;
  rows.insertAdjacentHTML("beforeend", sessionRow());
  const last = rows.lastElementChild;
  for (const field of ["start", "end"])
    last.querySelector("." + field).value = first.querySelector(
      "." + field,
    ).value;
  const used = [...rows.children]
    .slice(0, -1)
    .map((r) => +r.querySelector(".day").value);
  last.querySelector(".day").value = String(
    [3, 1, 2, 4, 5, 6, 0].find((d) => !used.includes(d)) ?? 1,
  );
  syncSessionTimes();
}
// 분할 수업 및 요일별 개별 시간 설정 이벤트입니다.
$("#split").onchange = (e) => {
  if (e.target.checked) {
    appendSession();
  } else {
    while ($("#sessionRows").children.length > 1)
      $("#sessionRows").lastElementChild.remove();
    $("#individualTimes").checked = false;
  }
  $("#addSession").classList.toggle("hidden", !e.target.checked);
  $("#individualWrap").classList.toggle("hidden", !e.target.checked);
  syncSessionTimes();
};
$("#addSession").onclick = appendSession;
$("#individualTimes").onchange = syncSessionTimes;
$("#sessionRows").addEventListener("input", (e) => {
  if (
    e.target.closest(".session-row") === $("#sessionRows").firstElementChild &&
    (e.target.matches(".start") || e.target.matches(".end"))
  )
    syncSessionTimes();
});
// 수업 등록 폼의 입력값을 검증하고 저장합니다.
$("#courseForm").onsubmit = (e) => {
  e.preventDefault();
  const n = {
    id: crypto.randomUUID(),
    name: new FormData(e.target).get("name").trim(),
    sessions: [...document.querySelectorAll(".session-row")].map((r) => ({
      day: +r.querySelector(".day").value,
      start: E.minutes(r.querySelector(".start").value),
      end: E.minutes(r.querySelector(".end").value),
    })),
  };
  try {
    E.validateCourse(n, db.courses);
    const next = structuredClone(db);
    next.courses.push(n);
    if (save(next)) {
      $("#courseDialog").close();
      navigate("timetable");
      toast(`${n.sessions.length}개 수업 시간을 등록했어요.`);
    }
  } catch (err) {
    $("#courseError").textContent = err.message;
  }
};
// 현재 수정 중인 학습 항목의 ID입니다. 신규 등록이면 null입니다.
let editingTask = null;
// 학습 등록·수정 폼을 초기화하고 엽니다.
function openTask(id = null) {
  editingTask = id;
  $("#taskForm").reset();
  $("#taskError").textContent = "";
  const subjects = [...new Set(db.courses.map((c) => c.name))];
  $("#subjects").innerHTML =
    '<option value="">' +
    (subjects.length
      ? "과목을 선택해 주세요"
      : "시간표에 수업을 먼저 등록해 주세요") +
    "</option>" +
    subjects
      .map((name) => `<option value="${esc(name)}">${esc(name)}</option>`)
      .join("");
  $("#subjects").disabled = !subjects.length;
  $('#taskForm button[type="submit"]').disabled = !subjects.length;
  if (!subjects.length)
    $("#taskError").textContent =
      "나의 시간표에서 수업을 등록하면 과목을 선택할 수 있어요.";
  if (id) {
    const t = db.tasks.find((x) => x.id === id);
    for (const k of ["type", "subject", "title", "difficulty", "remaining"])
      $("#taskForm").elements[k].value = t[k];
    $("#taskForm").elements.deadlineDate.value = t.deadline.slice(0, 10);
    $("#taskForm").elements.deadlineTime.value = t.deadline.slice(11, 16);
    if (!subjects.includes(t.subject)) {
      $("#subjects").value = "";
      $("#taskError").textContent =
        "기존 과목이 시간표에 없어요. 현재 등록된 과목을 선택해 주세요.";
    }
  } else {
    $("#taskForm").elements.deadlineDate.value = deadline(3).slice(0, 10);
    $("#taskForm").elements.deadlineTime.value = "23:55";
  }
  $("#taskDialog").showModal();
}
// 학습 등록·수정 폼의 입력값을 검증하고 저장합니다.
$("#taskForm").onsubmit = (e) => {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  f.deadline = f.deadlineDate + "T" + f.deadlineTime;
  delete f.deadlineDate;
  delete f.deadlineTime;
  const t = {
    ...f,
    id: editingTask || crypto.randomUUID(),
    subject: (f.subject || "").trim(),
    title: f.title.trim(),
    difficulty: +f.difficulty,
    remaining: +f.remaining,
  };
  if (
    !t.title ||
    !db.courses.some((c) => c.name === t.subject) ||
    !Number.isInteger(t.remaining) ||
    t.remaining <= 0 ||
    t.remaining > 10000 ||
    !Number.isFinite(new Date(t.deadline).getTime()) ||
    new Date(t.deadline) <= new Date()
  ) {
    $("#taskError").textContent =
      "과목·이름, 미래의 기한, 1~10000분의 남은 시간을 확인해 주세요.";
    return;
  }
  const next = structuredClone(db);
  if (editingTask)
    next.tasks = next.tasks.map((x) => (x.id === editingTask ? t : x));
  else next.tasks.push(t);
  if (save(next)) {
    $("#taskDialog").close();
    render();
    toast("학습 정보를 저장했어요. 계획에도 반영했어요.");
  }
};
// 평일·주말 공부 가능 시간 설정 폼을 엽니다.
function openSettings() {
  const f = $("#settingsForm");
  for (const k of ["weekday", "weekend"]) {
    const v = E.daySettings(db.settings, k === "weekday" ? 1 : 6);
    f.elements[k + "Start"].value = E.time(v.start);
    f.elements[k + "End"].value = E.time(v.end);
    f.elements[k + "Enabled"].checked = v.enabled;
  }
  $("#settingsError").textContent = "";
  $("#settingsDialog").showModal();
}
// 공부 가능 시간 설정을 검증하고 저장합니다.
$("#settingsForm").onsubmit = (e) => {
  e.preventDefault();
  const f = e.target,
    settings = {};
  for (const k of ["weekday", "weekend"]) {
    const start = E.minutes(f.elements[k + "Start"].value),
      end = E.minutes(f.elements[k + "End"].value),
      enabled = f.elements[k + "Enabled"].checked;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
      $("#settingsError").textContent =
        (k === "weekday" ? "평일" : "주말") +
        " 종료 시간은 시작보다 늦어야 해요.";
      return;
    }
    settings[k] = { start, end, enabled };
  }
  const next = structuredClone(db);
  next.settings = settings;
  if (save(next)) {
    $("#settingsDialog").close();
    render();
    toast("평일·주말 공부 가능 시간을 저장했어요.");
  }
};
// 시간 선택 목록에서 현재 선택 항목이 보이도록 스크롤합니다.
function centerTimeChoice(list, choice) {
  if (choice)
    list.scrollTop =
      choice.offsetTop - list.clientHeight / 2 + choice.clientHeight / 2;
}
// 시간 선택 창의 대상 입력 요소와 현재 선택한 시입니다.
let pickerTarget = null,
  pickerHour = 9;
// 선택한 시와 분을 미리보기와 시간 버튼에 반영합니다.
function pickerHours() {
  for (const b of $("#hourChoices").children)
    b.setAttribute("aria-pressed", String(+b.dataset.hour === pickerHour));
  $("#timePreview").textContent =
    String(pickerHour).padStart(2, "0") +
    ":" +
    (pickerTarget.value.split(":")[1] || "00");
}
// 텍스트 입력 대신 사용할 시간 선택 창을 엽니다.
function openTime(input) {
  if (input.dataset.linked === "true") {
    toast("연동된 시간이에요. 첫 시간을 바꾸거나 개별 설정을 켜주세요.");
    return;
  }
  pickerTarget = input;
  pickerHour = Math.floor(E.minutes(input.value) / 60) || 0;
  $("#hourChoices").innerHTML = Array.from(
    { length: 24 },
    (_, h) =>
      `<button type="button" data-hour="${h}" aria-label="${h}시">${String(h).padStart(2, "0")}</button>`,
  ).join("");
  const minuteStep = input.name === "deadlineTime" ? 1 : 5;
  $("#minuteChoices").innerHTML = Array.from(
    { length: 60 / minuteStep },
    (_, i) =>
      `<button type="button" data-minute="${i * minuteStep}" aria-label="${i * minuteStep}분">${String(i * minuteStep).padStart(2, "0")}</button>`,
  ).join("");
  pickerHours();
  $("#timePicker").showModal();
  centerTimeChoice($("#hourChoices"), $('#hourChoices [aria-pressed="true"]'));
  const minute = +input.value.split(":")[1];
  for (const b of $("#minuteChoices").children)
    b.setAttribute("aria-pressed", String(+b.dataset.minute === minute));
  centerTimeChoice(
    $("#minuteChoices"),
    $('#minuteChoices [aria-pressed="true"]'),
  );
}
// 클릭으로 시간 입력 요소를 선택할 수 있도록 연결합니다.
document.addEventListener("click", (e) => {
  const input = e.target.closest(
    ".session-row .start,.session-row .end,.time-input",
  );
  if (input) openTime(input);
});
// 키보드 Enter·Space로도 시간 선택 창을 열 수 있게 합니다.
document.addEventListener("keydown", (e) => {
  if (
    (e.key === "Enter" || e.key === " ") &&
    e.target.matches(".session-row .start,.session-row .end,.time-input")
  ) {
    e.preventDefault();
    openTime(e.target);
  }
});
// 시간 선택 창의 시 버튼 이벤트입니다.
$("#hourChoices").onclick = (e) => {
  const b = e.target.closest("[data-hour]");
  if (b) {
    pickerHour = +b.dataset.hour;
    pickerHours();
    centerTimeChoice($("#hourChoices"), b);
  }
};
// 시간 선택 창의 분 버튼 이벤트로 값을 입력 요소에 적용합니다.
$("#minuteChoices").onclick = (e) => {
  const b = e.target.closest("[data-minute]");
  if (!b) return;
  const n = pickerHour * 60 + +b.dataset.minute;
  pickerTarget.value = E.time(n);
  if (pickerTarget.matches(".start")) {
    pickerTarget.closest(".session-row").querySelector(".end").value = E.time(
      E.defaultEnd(n),
    );
    if (n + 90 > 1435)
      $("#courseError").textContent =
        "자정을 넘는 수업은 등록할 수 없어 종료를 23:55로 설정했어요.";
    else $("#courseError").textContent = "";
  }
  pickerTarget.dispatchEvent(new Event("input", { bubbles: true }));
  $("#timePicker").close();
  pickerTarget.focus();
};
// 시간 선택 창의 닫기 버튼을 연결합니다.
$("#closePicker").onclick = () => $("#timePicker").close();
// 선택한 학습 항목에 대한 집중 타이머를 시작합니다.
function start(id, minutes) {
  if (!Number.isInteger(minutes) || minutes < 1) {
    toast("집중 시간은 1분 이상의 정수로 입력해 주세요.");
    return;
  }
  const task = db.tasks.find((t) => t.id === id),
    now = Date.now(),
    s = E.slots(db, new Date()).find(
      (s) => s.start <= Math.ceil(now / 60000) * 60000 && s.end > now,
    );
  if (
    !task ||
    task.remaining <= 0 ||
    !s ||
    Math.min(s.end, new Date(task.deadline).getTime()) - now < minutes * 60000
  ) {
    toast("지금은 선택한 시간만큼 여유가 없어요. 계획을 확인해 주세요.");
    render();
    return;
  }
  timer = {
    id,
    total: minutes * 60,
    remaining: minutes * 60,
    anchor: Date.now(),
    paused: false,
    spent: 0,
  };
  $("#timerTitle").textContent = task.title;
  $("#finishForm").classList.add("hidden");
  $(".timer-actions").classList.remove("hidden");
  $("#pauseTimer").textContent = "일시정지";
  $("#timerStatus").textContent = "지금, 한 가지에만 집중해요";
  $("#timerDialog").showModal();
  tick();
  timerTick = setInterval(tick, 250);
}
// 집중 타이머의 남은 시간을 갱신하고 종료 여부를 확인합니다.
function tick() {
  if (!timer) return;
  const elapsed = timer.paused ? 0 : (Date.now() - timer.anchor) / 1000;
  const left = Math.max(0, timer.remaining - elapsed);
  $("#timerClock").textContent =
    `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(Math.floor(left % 60)).padStart(2, "0")}`;
  if (left <= 0) {
    timer.spent += timer.remaining;
    timer.remaining = 0;
    timer.paused = true;
    finish();
  }
}
// 집중 타이머를 일시정지하거나 다시 시작합니다.
$("#pauseTimer").onclick = () => {
  if (!timer) return;
  if (!timer.paused) {
    const elapsed = (Date.now() - timer.anchor) / 1000;
    timer.remaining = Math.max(0, timer.remaining - elapsed);
    timer.spent += elapsed;
    timer.paused = true;
    $("#pauseTimer").textContent = "계속하기";
    $("#timerStatus").textContent = "잠시 쉬어가도 괜찮아요";
  } else {
    timer.anchor = Date.now();
    timer.paused = false;
    $("#pauseTimer").textContent = "일시정지";
    $("#timerStatus").textContent = "지금, 한 가지에만 집중해요";
  }
};
// 집중 타이머를 멈추고 실제 남은 시간 입력 단계로 전환합니다.
function finish() {
  if (!timer) return;
  clearInterval(timerTick);
  if (!timer.paused) {
    const elapsed = Math.min(
      timer.remaining,
      (Date.now() - timer.anchor) / 1000,
    );
    timer.spent += elapsed;
    timer.remaining -= elapsed;
    timer.paused = true;
  }
  $("#timerStatus").textContent = "시작한 만큼, 한 걸음 나아갔어요";
  $(".timer-actions").classList.add("hidden");
  $("#finishForm").classList.remove("hidden");
  $("#remainingInput").value = db.tasks.find(
    (t) => t.id === timer.id,
  ).remaining;
}
$("#finishTimer").onclick = finish;
$("#timerDialog").addEventListener("cancel", (e) => {
  e.preventDefault();
  finish();
});
// 집중 결과와 실제 남은 학습 시간을 저장합니다.
$("#finishForm").onsubmit = (e) => {
  e.preventDefault();
  const remain = +$("#remainingInput").value;
  if (!Number.isInteger(remain) || remain < 0 || remain > 10000) return;
  const next = structuredClone(db);
  next.tasks.find((t) => t.id === timer.id).remaining = remain;
  next.records.push({
    id: crypto.randomUUID(),
    taskId: timer.id,
    day: E.dateKey(new Date()),
    minutes: Math.floor(timer.spent / 60),
    seconds: Math.floor(timer.spent),
  });
  if (save(next)) {
    timer = null;
    clearInterval(timerTick);
    $("#timerDialog").close();
    render();
    toast("작은 시작을 기록했어요. 다음 계획도 갱신했어요.");
  }
};
// 공통 닫기·취소 버튼을 각 다이얼로그에 연결합니다.
for (const d of ["courseDialog", "taskDialog", "settingsDialog"]) {
  document
    .querySelectorAll(`#${d} .close,#${d} .cancel`)
    .forEach((b) => (b.onclick = () => $("#" + d).close()));
}
// 사이드 메뉴의 화면 전환 이벤트를 연결합니다.
document
  .querySelectorAll("[data-view]")
  .forEach((b) => (b.onclick = () => navigate(b.dataset.view)));
// 브랜드 로고를 누르면 홈 화면으로 이동합니다.
$(".brand").onclick = (e) => {
  e.preventDefault();
  navigate("home");
};
// 상단 학습 등록 버튼으로 신규 학습 폼을 엽니다.
$("#addTask").onclick = () => openTask();
// 애플리케이션을 최초 화면으로 시작합니다.
render();

(function (root) {
  // 날짜를 애플리케이션의 YYYY-MM-DD 형식으로 변환합니다.
  const dateKey = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  // HH:MM 문자열을 분 단위 숫자로 변환하고 잘못된 값은 NaN으로 처리합니다.
  const minutes = (s) => {
    if (!/^\d{2}:\d{2}$/.test(s)) return NaN;
    const [h, m] = s.split(":").map(Number);
    return h < 24 && m < 60 ? h * 60 + m : NaN;
  };
  // 분 단위 숫자를 HH:MM 문자열로 변환합니다.
  const time = (m) =>
    `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  function validSession(session) {
    return (
      Number.isInteger(session.day) &&
      session.day >= 0 &&
      session.day <= 6 &&
      Number.isFinite(session.start) &&
      Number.isFinite(session.end) &&
      session.start >= 0 &&
      session.end <= 1435 &&
      session.start % 5 === 0 &&
      session.end % 5 === 0 &&
      session.start < session.end
    );
  }
  function overlaps(left, right) {
    return (
      left.day === right.day &&
      left.start < right.end &&
      left.end > right.start
    );
  }
  // 수업명·시간·중복 여부를 검증합니다.
  function validateCourse(course, existing) {
    if (!course.name.trim()) throw Error("수업명을 입력해 주세요.");
    if (!course.sessions.length) throw Error("수업 시간을 입력해 주세요.");
    const sessionsByDay = new Map();
    for (const c of existing) {
      for (const session of c.sessions) {
        const sessions = sessionsByDay.get(session.day) || [];
        sessions.push(session);
        sessionsByDay.set(session.day, sessions);
      }
    }
    for (const s of course.sessions) {
      if (!validSession(s))
        throw Error(
          "수업은 00:00~23:55에서 5분 단위로, 종료가 시작보다 늦어야 해요.",
        );
      const sessions = sessionsByDay.get(s.day) || [];
      for (const t of sessions)
        if (overlaps(s, t))
          throw Error(
            "같은 요일에 겹치는 수업이 있어요. 시간을 확인해 주세요.",
          );
      sessions.push(s);
      sessionsByDay.set(s.day, sessions);
    }
    return true;
  }
  // 과목 이름과 선택한 반복 수업을 수정합니다.
  function updateSession(db, courseId, previous, changes) {
    const course = db.courses.find((c) => c.id === courseId);
    const index = course?.sessions.findIndex(
      (s) =>
        s.day === previous.day &&
        s.start === previous.start &&
        s.end === previous.end,
    );
    if (index == null || index < 0)
      throw Error("수업을 찾을 수 없어요. 시간표에서 다시 선택해 주세요.");

    const { name = course.name, day = previous.day, start, end } = changes;
    const sessions = [...course.sessions];
    sessions[index] = { ...sessions[index], day, start, end };
    const updated = { ...course, name: name.trim(), sessions };
    validateCourse(updated, db.courses.filter((c) => c.id !== courseId));
    const renameTasks =
      updated.name !== course.name &&
      !db.courses.some((c) => c.id !== courseId && c.name === course.name);
    return {
      ...db,
      courses: db.courses.map((c) => (c.id === courseId ? updated : c)),
      tasks: renameTasks
        ? db.tasks?.map((t) =>
            t.subject === course.name ? { ...t, subject: updated.name } : t,
          )
        : db.tasks,
      cancelledSessions: (db.cancelledSessions || []).flatMap((c) => {
        const matches =
          c.courseId === courseId &&
          c.start === previous.start &&
          c.end === previous.end &&
          new Date(c.date + "T00:00:00").getDay() === previous.day;
        if (!matches) return [c];
        return day === previous.day ? [{ ...c, start, end }] : [];
      }),
    };
  }
  // 평일·주말 또는 요일별 단일 시간 설정을 구간 목록으로 변환합니다.
  function normalizeSettings(s = {}) {
    const normalizePeriod = (period, fallback) => ({
      start: Number.isFinite(period?.start) ? period.start : fallback.start,
      end: Number.isFinite(period?.end) ? period.end : fallback.end,
      enabled:
        typeof period?.enabled === "boolean" ? period.enabled : fallback.enabled,
    });
    const shared = normalizePeriod(s, { start: 540, end: 1080, enabled: true });
    const weekday = normalizePeriod(s.weekday, shared);
    const weekend = normalizePeriod(s.weekend, {
      ...shared,
      enabled: s.weekend !== false,
    });
    const days = Array.from({ length: 7 }, (_, day) => {
      const fallback = day === 0 || day === 6 ? weekend : weekday;
      const config = s.days?.[day];
      const { start, end, enabled } = normalizePeriod(config, fallback);
      const periods = Array.isArray(config?.periods)
        ? config.periods
            .filter(
              (p) =>
                Number.isInteger(p?.start) &&
                Number.isInteger(p?.end) &&
                p.start >= 0 &&
                p.end <= 1439 &&
                p.start < p.end,
            )
            .map(({ start, end }) => ({ start, end }))
            .sort((a, b) => a.start - b.start)
        : [];
      return {
        enabled,
        periods: periods.length ? periods : [{ start, end }],
      };
    });
    return { days };
  }
  // 요일에 맞는 공부 가능 시간 설정을 반환합니다.
  function daySettings(s, day) {
    return normalizeSettings(s).days[day];
  }
  // 시작 시각으로부터 기본 수업 종료 시각을 계산합니다.
  function defaultEnd(start) {
    return Math.min(start + 90, 1435);
  }
  // 특정 날짜와 시간의 수업이 휴강 처리되었는지 확인합니다.
  function isCancelled(db, course, session, date, cancellationKeys) {
    if (cancellationKeys)
      return cancellationKeys.has(
        `${course.id}|${date}|${session.start}|${session.end}`,
      );
    return (db.cancelledSessions || []).some(
      (cancellation) =>
        cancellation.courseId === course.id &&
        cancellation.date === date &&
        cancellation.start === session.start &&
        cancellation.end === session.end,
    );
  }
  // 특정 날짜에 진행되는 모든 수업을 조회합니다.
  function sessionsOn(db, date, cancellationKeys) {
    const d = typeof date === "string" ? new Date(date + "T00:00:00") : date,
      key = dateKey(d);
    return db.courses.flatMap((c, color) =>
      c.sessions
        .filter(
          (s) =>
            s.day === d.getDay() &&
            !isCancelled(db, c, s, key, cancellationKeys),
        )
        .map((s) => ({ ...s, courseId: c.id, title: c.name, color })),
    );
  }
  // 수업을 제외한 공부 가능 시간대를 여러 날짜에 걸쳐 계산합니다.
  function slots(db, base, days = 28) {
    const out = [];
    const settings = normalizeSettings(db.settings).days;
    const sessionsByDay = Array.from({ length: 7 }, () => []);
    for (const [color, course] of db.courses.entries()) {
      for (const session of course.sessions) {
        sessionsByDay[session.day].push({
          ...session,
          courseId: course.id,
          title: course.name,
          color,
        });
      }
    }
    const cancellationKeys = new Set(
      (db.cancelledSessions || []).map(
        (c) => `${c.courseId}|${c.date}|${c.start}|${c.end}`,
      ),
    );
    for (let i = 0; i < days; i++) {
      const d = new Date(base);
      d.setDate(d.getDate() + i);
      const dow = d.getDay();
      const config = settings[dow];
      if (!config.enabled) continue;
      const date = dateKey(d);
      const classes = sessionsByDay[dow]
        .filter(
          (session) =>
            !cancellationKeys.has(
              `${session.courseId}|${date}|${session.start}|${session.end}`,
            ),
        )
        .sort((a, b) => a.start - b.start);
      const add = (a, b) => {
        const from = new Date(d);
        from.setHours(Math.floor(a / 60), a % 60, 0, 0);
        const to = new Date(d);
        to.setHours(Math.floor(b / 60), b % 60, 0, 0);
        const actual = Math.max(from.getTime(), base.getTime());
        const rounded = Math.ceil(actual / 60000) * 60000;
        if (to.getTime() > rounded)
          out.push({ start: rounded, end: to.getTime() });
      };
      const windows = [];
      for (const period of config.periods) {
        const last = windows.at(-1);
        if (last && period.start <= last.end)
          last.end = Math.max(last.end, period.end);
        else windows.push({ ...period });
      }
      for (const { start, end } of windows) {
        let cursor = start;
        for (const c of classes) {
          if (c.end <= start || c.start >= end) continue;
          if (c.start > cursor) add(cursor, Math.min(c.start, end));
          cursor = Math.max(cursor, c.end);
        }
        if (cursor < end) add(cursor, end);
      }
    }
    return out;
  }
  // 과제 우선순위를 계산하고 가능한 시간에 학습 블록을 배정합니다.
  function plan(db, base = new Date()) {
    if (!db.courses.length)
      return { blocks: [], ranked: [], missing: [], slots: [] };
    const free = slots(db, base);
    const prefixCapacity = [0];
    for (const slot of free) {
      const minutes = Math.max(0, slot.end - slot.start) / 60000;
      prefixCapacity.push(prefixCapacity[prefixCapacity.length - 1] + minutes);
    }
    const capacityBefore = (target) => {
      let low = 0;
      let high = free.length;
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (free[middle].end <= target) low = middle + 1;
        else high = middle;
      }
      let capacity = prefixCapacity[low];
      if (low < free.length) {
        const slot = free[low];
        if (slot.start < target)
          capacity += Math.max(0, Math.min(slot.end, target) - slot.start) / 60000;
      }
      return capacity;
    };
    const ranked = db.tasks
      .filter((t) => t.remaining > 0)
      .map((t) => {
        const deadline = new Date(t.deadline).getTime();
        const goal = deadline - 86400000;
        const target = goal > base.getTime() ? goal : deadline;
        const capacity = capacityBefore(target);
        return {
          ...t,
          target,
          deadlineMs: deadline,
          score:
            capacity > 0 ? (t.remaining / capacity) * t.difficulty : Infinity,
          capacity,
        };
      })
      .sort(
        (a, b) =>
          b.score - a.score ||
          a.deadlineMs - b.deadlineMs ||
          a.remaining - b.remaining,
      );
    const available = free.map((s) => ({ ...s })),
      blocks = [],
      missing = [];
    let nextSlot = 0;
    for (const t of ranked) {
      let left = t.remaining;
      if (t.deadlineMs <= base.getTime()) {
        missing.push({
          id: t.id,
          title: t.title,
          minutes: left,
          expired: true,
        });
        continue;
      }
      for (let slotIndex = nextSlot; slotIndex < available.length && left > 0; ) {
        const s = available[slotIndex];
        if (s.start >= s.end) {
          slotIndex++;
          nextSlot = slotIndex;
          continue;
        }
        const cap = Math.floor((Math.min(s.end, t.target) - s.start) / 60000);
        if (cap <= 0) break;
        const amount = Math.min(left, cap);
        blocks.push({
          taskId: t.id,
          title: t.title,
          subject: t.subject,
          start: s.start,
          end: s.start + amount * 60000,
          minutes: amount,
        });
        s.start += amount * 60000;
        left -= amount;
        if (left <= 0) break;
        if (s.start >= s.end) {
          slotIndex++;
          nextSlot = slotIndex;
        } else if (s.start >= t.target) {
          break;
        }
      }
      if (left > 0) missing.push({ id: t.id, title: t.title, minutes: left });
    }
    return {
      blocks: blocks.sort((a, b) => a.start - b.start),
      ranked,
      missing,
      slots: free,
    };
  }
  // UI와 웹 워커에서 공통으로 사용하는 엔진 API입니다.
  const api = {
    dateKey,
    minutes,
    time,
    validateCourse,
    updateSession,
    normalizeSettings,
    daySettings,
    defaultEnd,
    isCancelled,
    sessionsOn,
    slots,
    plan,
  };
  root.StartFit = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);

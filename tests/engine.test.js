const {
  validateCourse,
  updateSession,
  normalizeSettings,
  sessionsOn,
  slots,
  plan,
} = require("../engine");

const FIXED_NOW = new Date(2026, 10, 23, 9, 0, 0);

function settings() {
  return {
    weekday: { start: 540, end: 1080, enabled: true },
    weekend: { start: 540, end: 1080, enabled: true },
  };
}

beforeAll(() => {
  jest.useFakeTimers();
  jest.setSystemTime(FIXED_NOW);
});

afterAll(() => {
  jest.useRealTimers();
});

describe("validateCourse", () => {
  test("분할수업을 정상적으로 등록한다", () => {
    const course = {
      name: "수학",
      sessions: [
        { day: 1, start: 540, end: 630 },
        { day: 3, start: 780, end: 870 },
      ],
    };

    expect(validateCourse(course, [])).toBe(true);
  });

  test.each(["기초수학", "  기초 수학", "기초  수학"])(
    "공백을 제외한 수업명이 같으면 %p을 중복으로 처리한다",
    (name) => {
      const existing = [
        { name: "기초 수학  ", sessions: [{ day: 1, start: 540, end: 600 }] },
      ];
      const course = {
        name,
        sessions: [{ day: 2, start: 540, end: 600 }],
      };

      expect(() => validateCourse(course, existing)).toThrow(
        "중복된 수업이 있습니다",
      );
      expect(validateCourse({ ...course, name: "응용 수학" }, existing)).toBe(true);
    },
  );

  test("종료와 시간이 같은 인접 수업은 허용한다", () => {
    const existing = [
      {
        name: "영어",
        sessions: [{ day: 1, start: 540, end: 600 }],
      },
    ];
    const course = {
      name: "수학",
      sessions: [{ day: 1, start: 600, end: 660 }],
    };

    expect(validateCourse(course, existing)).toBe(true);
  });

  test("겹치는 수업 시간은 예외를 발생시킨다", () => {
    const existing = [
      {
        name: "영어",
        sessions: [{ day: 1, start: 540, end: 610 }],
      },
    ];
    const course = {
      name: "수학",
      sessions: [{ day: 1, start: 600, end: 660 }],
    };

    expect(() => validateCourse(course, existing)).toThrow(
      "같은 요일에 겹치는 수업이 있어요",
    );
  });

  test("빈 시간표는 수업 시간을 입력하라는 예외를 발생시킨다", () => {
    expect(() =>
      validateCourse({ name: "수학", sessions: [] }, []),
    ).toThrow("수업 시간을 입력해 주세요.");
  });
});

describe("slots", () => {
  test("수업을 제외한 공부 공간을 계산한다", () => {
    const db = {
      settings: settings(),
      courses: [
        {
          id: "course-1",
          name: "수학",
          sessions: [{ day: 1, start: 600, end: 660 }],
        },
      ],
      cancelledSessions: [],
      tasks: [],
    };

    const result = slots(db, FIXED_NOW, 1);

    expect(result).toHaveLength(2);
    expect(new Date(result[0].start)).toEqual(FIXED_NOW);
    expect(new Date(result[0].end).getHours()).toBe(10);
    expect(new Date(result[1].start).getHours()).toBe(11);
    expect(new Date(result[1].end).getHours()).toBe(18);
  });

  test("요일별로 설정한 시간과 공부 계획 사용 여부를 적용한다", () => {
    const { days } = normalizeSettings(settings());
    days[1] = { enabled: true, periods: [{ start: 570, end: 600 }] };
    days[2].enabled = false;
    days[3] = { enabled: true, periods: [{ start: 780, end: 840 }] };

    const result = slots({ courses: [], settings: { days } }, FIXED_NOW, 3);

    expect(result).toEqual([
      {
        start: new Date(2026, 10, 23, 9, 30).getTime(),
        end: new Date(2026, 10, 23, 10).getTime(),
      },
      {
        start: new Date(2026, 10, 25, 13).getTime(),
        end: new Date(2026, 10, 25, 14).getTime(),
      },
    ]);
  });

  test("맞닿은 공부 시간은 타이머에서 연속으로 사용할 수 있다", () => {
    const { days } = normalizeSettings(settings());
    days[1].periods = [{ start: 540, end: 600 }, { start: 600, end: 660 }];

    expect(slots({ courses: [], settings: { days } }, FIXED_NOW, 1)).toEqual([
      { start: FIXED_NOW.getTime(), end: new Date(2026, 10, 23, 11).getTime() },
    ]);
  });
});

test("기존 평일·주말 설정을 각 요일로 옮긴다", () => {
  const weekday = { start: 540, end: 960, enabled: true };
  const weekend = { start: 660, end: 780, enabled: false };

  const workday = { enabled: true, periods: [{ start: 540, end: 960 }] };
  const dayOff = { enabled: false, periods: [{ start: 660, end: 780 }] };
  expect(normalizeSettings({ weekday, weekend }).days).toEqual([
    dayOff, workday, workday, workday, workday, workday, dayOff,
  ]);
  expect(normalizeSettings({ start: 600, end: 900, weekend: false }).days[6])
    .toEqual({ enabled: false, periods: [{ start: 600, end: 900 }] });
  expect(normalizeSettings({ days: [weekend, weekday] }).days.slice(0, 2))
    .toEqual([dayOff, workday]);
});

test("수업 시간을 수정할 때 다른 요일의 수업과 휴강 기록을 구분한다", () => {
  const monday = { day: 1, start: 540, end: 600 };
  const wednesday = { day: 3, start: 540, end: 600 };
  const db = {
    courses: [{ id: "math", name: "수학", sessions: [monday, wednesday] }],
    cancelledSessions: [
      { id: "mon", courseId: "math", date: "2026-11-23", start: 540, end: 600 },
      { id: "wed", courseId: "math", date: "2026-11-25", start: 540, end: 600 },
    ],
  };

  const updated = updateSession(db, "math", monday, { start: 600, end: 660 });

  expect(updated.courses[0].sessions).toEqual([
    { day: 1, start: 600, end: 660 },
    wednesday,
  ]);
  expect(updated.cancelledSessions[0]).toMatchObject({ id: "mon", start: 600, end: 660 });
  expect(updated.cancelledSessions[1]).toEqual(db.cancelledSessions[1]);
  expect(sessionsOn(updated, "2026-11-23")).toEqual([]);
  expect(sessionsOn(updated, "2026-11-30")[0].start).toBe(600);
  expect(db.courses[0].sessions[0]).toEqual({ day: 1, start: 540, end: 600 });
});

test("같은 과목의 다른 수업과 겹치는 수정은 거부한다", () => {
  const session = { day: 1, start: 540, end: 600 };
  const db = {
    courses: [{
      id: "math",
      name: "수학",
      sessions: [session, { day: 1, start: 660, end: 720 }],
    }],
  };

  expect(() => updateSession(db, "math", session, { start: 600, end: 690 }))
    .toThrow("같은 요일에 겹치는 수업이 있어요");
});

test("다른 수업과 같아지는 수업명 수정은 거부한다", () => {
  const session = { day: 1, start: 540, end: 600 };
  const db = {
    courses: [
      { id: "math", name: "수학", sessions: [session] },
      { id: "english", name: "영어", sessions: [{ ...session, day: 2 }] },
    ],
  };

  expect(() =>
    updateSession(db, "math", session, { name: " 영 어 ", start: 540, end: 600 }),
  ).toThrow("중복된 수업이 있습니다");
});

test("과목명을 바꾸고 선택한 수업을 다른 요일로 옮긴다", () => {
  const monday = { day: 1, start: 540, end: 600 };
  const wednesday = { day: 3, start: 540, end: 600 };
  const db = {
    courses: [{ id: "math", name: "수학", sessions: [monday, wednesday] }],
    tasks: [{ id: "homework", subject: "수학", remaining: 60 }],
    cancelledSessions: [
      { id: "mon", courseId: "math", date: "2026-11-23", start: 540, end: 600 },
      { id: "wed", courseId: "math", date: "2026-11-25", start: 540, end: 600 },
    ],
  };
  const updated = updateSession(db, "math", monday, {
    name: "기초 수학",
    day: 2,
    start: 600,
    end: 660,
  });

  expect(updated.courses[0]).toMatchObject({
    name: "기초 수학",
    sessions: [{ day: 2, start: 600, end: 660 }, wednesday],
  });
  expect(updated.tasks[0]).toEqual({
    id: "homework", subject: "기초 수학", remaining: 60,
  });
  expect(updated.cancelledSessions).toEqual([db.cancelledSessions[1]]);
  expect(sessionsOn(updated, "2026-11-24")[0].title).toBe("기초 수학");
});

describe("plan", () => {
  test("학습은 설정한 구간 안에서만 배정하고 중간 휴식 및 수업 시간을 비운다", () => {
    const { days } = normalizeSettings(settings());
    days[1].periods = [{ start: 840, end: 1080 }, { start: 540, end: 720 }];
    const db = {
      settings: { days },
      courses: [{
        id: "math",
        name: "수학",
        sessions: [{ day: 1, start: 900, end: 960 }],
      }],
      tasks: [{
        id: "homework",
        title: "복습",
        subject: "수학",
        remaining: 400,
        difficulty: 1,
        deadline: new Date(2026, 10, 24, 18).toISOString(),
      }],
    };

    const result = plan(db, FIXED_NOW);

    expect(result.blocks.map(({ start, end }) => [
      new Date(start).getHours(), new Date(end).getHours(),
    ])).toEqual([[9, 12], [14, 15], [16, 18]]);
    expect(result.missing[0].minutes).toBe(40);
  });

  test("빈 시간표면 계획과 배정 목록이 비어 있다", () => {
    const result = plan(
      {
        settings: settings(),
        courses: [],
        cancelledSessions: [],
        tasks: [{ id: "task-1", title: "복습", remaining: 30 }],
      },
      FIXED_NOW,
    );

    expect(result.blocks).toEqual([]);
    expect(result.ranked).toEqual([]);
    expect(result.missing).toEqual([]);
  });

  test("공부 시간이 부족하면 미배정 시간을 missing에 표시한다", () => {
    const deadline = new Date(2026, 10, 24, 18, 0, 0);
    const db = {
      settings: settings(),
      courses: [
        {
          id: "course-1",
          name: "수학",
          sessions: [
            { day: 0, start: 540, end: 1080 },
            { day: 1, start: 540, end: 1080 },
            { day: 2, start: 540, end: 1080 },
            { day: 3, start: 540, end: 1080 },
            { day: 4, start: 540, end: 1080 },
            { day: 5, start: 540, end: 1080 },
            { day: 6, start: 540, end: 1080 },
          ],
        },
      ],
      cancelledSessions: [],
      tasks: [
        {
          id: "task-1",
          title: "시험 공부",
          subject: "수학",
          difficulty: 3,
          remaining: 60,
          deadline: deadline.toISOString(),
        },
      ],
    };

    const result = plan(db, FIXED_NOW);

    expect(result.missing).toEqual([
      expect.objectContaining({
        id: "task-1",
        title: "시험 공부",
        minutes: 60,
      }),
    ]);
  });
});

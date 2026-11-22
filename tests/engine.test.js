const {
  validateCourse,
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
});

describe("plan", () => {
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

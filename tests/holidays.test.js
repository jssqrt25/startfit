require("../holidays");
const { validate } = global.StartFitHolidays;

function holiday(date) {
  return {
    countryCode: "KR",
    date,
    localName: "테스트 공휴일",
    types: ["Public"],
  };
}

describe("holidays validate", () => {
  test("2028-02-29 윤년 날짜를 허용한다", () => {
    expect(validate([holiday("2028-02-29")], 2028)).toEqual([
      {
        date: "2028-02-29",
        name: "테스트 공휴일",
        public: true,
      },
    ]);
  });

  test("2027-02-29는 예외를 발생시킨다", () => {
    expect(() => validate([holiday("2027-02-29")], 2027)).toThrow(
      "Invalid holiday",
    );
  });

  test("2027-02-30은 예외를 발생시킨다", () => {
    expect(() => validate([holiday("2027-02-30")], 2027)).toThrow(
      "Invalid holiday",
    );
  });
});

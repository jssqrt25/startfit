// Public holiday data is separate from the user's timetable and never cancels classes.
(function (root) {
  // 공휴일 메모리 캐시, 진행 중 요청, 캐시 유효 기간입니다.
  const memory = new Map(),
    pending = new Map(),
    TTL = 86400000;
  // 외부 API 응답이 한국의 해당 연도 공휴일 데이터인지 검증합니다.
  function validate(rows, year) {
    if (!Array.isArray(rows) || !rows.length)
      throw Error("Invalid holiday response");
    return rows
      .map((h) => {
        let normalizedDate = "";
        if (
          typeof h.date === "string" &&
          /^\d{4}-\d{2}-\d{2}$/.test(h.date)
        ) {
          const parsed = new Date(h.date);
          if (Number.isFinite(parsed.getTime()))
            normalizedDate = parsed.toISOString().slice(0, 10);
        }
        if (
          h.countryCode !== "KR" ||
          !/^\d{4}-\d{2}-\d{2}$/.test(h.date) ||
          !h.date.startsWith(year + "-") ||
          normalizedDate !== h.date ||
          typeof h.localName !== "string" ||
          !Array.isArray(h.types)
        )
          throw Error("Invalid holiday");
        return {
          date: h.date,
          name: h.localName,
          public: h.types.includes("Public"),
        };
      })
      .filter((h) => h.public)
      .sort((a, b) => a.date.localeCompare(b.date));
  }
  // localStorage에 저장된 공휴일 캐시를 읽습니다.
  function cached(year) {
    try {
      const c = JSON.parse(
        localStorage.getItem("startfit-holidays-KR-" + year),
      );
      if (c && Number.isFinite(c.updatedAt))
        return {
          items: validate(
            c.items.map((h) => ({
              date: h.date,
              localName: h.name,
              countryCode: "KR",
              types: ["Public"],
            })),
            year,
          ),
          updatedAt: c.updatedAt,
        };
    } catch {}
    return null;
  }
  // 캐시 또는 Nager.Date API에서 공휴일을 불러옵니다.
  async function load(year, force = false) {
    if (pending.has(year)) return pending.get(year);
    const previous = memory.get(year);
    const old = previous?.updatedAt ? previous : cached(year);
    if (!force && old && Date.now() - old.updatedAt < TTL) {
      const result = { ...old, status: "ready" };
      memory.set(year, result);
      return result;
    }
    // 요청 제한 시간과 실패 시 이전 캐시를 사용하는 작업입니다.
    const job = (async () => {
      const controller = new AbortController(),
        timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch(
          `https://date.nager.at/api/v3/PublicHolidays/${year}/KR`,
          { signal: controller.signal, credentials: "omit" },
        );
        if (!response.ok) throw Error("HTTP " + response.status);
        const items = validate(await response.json(), year),
          result = { items, updatedAt: Date.now(), status: "ready" };
        memory.set(year, result);
        try {
          localStorage.setItem(
            "startfit-holidays-KR-" + year,
            JSON.stringify(result),
          );
        } catch {}
        return result;
      } catch {
        const result = {
          items: old?.items || [],
          updatedAt: old?.updatedAt || null,
          status: old ? "stale" : "error",
        };
        memory.set(year, result);
        return result;
      } finally {
        clearTimeout(timeout);
        pending.delete(year);
      }
    })();
    pending.set(year, job);
    return job;
  }
  // 앱에서 사용할 공휴일 API를 전역 객체에 공개합니다.
  root.StartFitHolidays = { load, validate };
})(typeof window !== "undefined" ? window : globalThis);

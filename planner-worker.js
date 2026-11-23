// 계획 계산 엔진을 웹 워커 환경에 불러옵니다.
importScripts("engine.js?v=timetable8");
// 메인 스레드에서 보낸 계획 계산 요청을 처리합니다.
self.onmessage = ({ data }) => {
  try {
    self.postMessage({
      id: data.id,
      result: StartFit.plan(data.db, new Date(data.base)),
    });
  } catch (e) {
    self.postMessage({ id: data.id, error: e.message });
  }
};

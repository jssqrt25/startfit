// HTTP 환경에서는 계획 계산을 UI 스레드 밖의 웹 워커에서 실행합니다.
// 파일 미리보기 환경에서는 메인 스레드 계산으로 안전하게 대체합니다.
// 워커 인스턴스, 요청 일련번호, 대기 중인 계산 작업입니다.
let planWorker = null,
  planSequence = 0;
const pendingPlans = new Map();
// 워커를 종료하고 대기 중인 요청을 메인 스레드 대체 계산으로 넘깁니다.
function stopPlanWorker() {
  if (planWorker) planWorker.terminate();
  planWorker = null;
  for (const job of pendingPlans.values()) {
    clearTimeout(job.timeout);
    job.fallback();
  }
  pendingPlans.clear();
}
// HTML에 내장된 워커 코드가 있는지 확인합니다.
const embeddedPlanner = document.getElementById("plannerSource")?.textContent;
if (
  typeof Worker !== "undefined" &&
  (embeddedPlanner || location.protocol !== "file:")
) {
  try {
    const workerURL = embeddedPlanner
      ? URL.createObjectURL(
          new Blob([embeddedPlanner], { type: "text/javascript" }),
        )
      : "planner-worker.js?v=timetable10";
    planWorker = new Worker(workerURL);
    if (embeddedPlanner) URL.revokeObjectURL(workerURL);
    // 워커가 계산 결과를 보내면 해당 Promise를 완료합니다.
    planWorker.onmessage = ({ data }) => {
      const job = pendingPlans.get(data.id);
      if (!job) return;
      pendingPlans.delete(data.id);
      clearTimeout(job.timeout);
      if (data.error) job.fallback();
      else job.resolve(data.result);
    };
    planWorker.onerror = stopPlanWorker;
  } catch {
    planWorker = null;
  }
}
// 워커 또는 메인 스레드에서 학습 계획을 계산합니다.
function calculatePlan(db, base) {
  return new Promise((resolve, reject) => {
    const fallback = () =>
      setTimeout(() => {
        try {
          resolve(StartFit.plan(db, base));
        } catch (e) {
          reject(e);
        }
      }, 0);
    if (!planWorker) {
      fallback();
      return;
    }
    const id = ++planSequence,
      timeout = setTimeout(() => {
        pendingPlans.delete(id);
        fallback();
      }, 5000);
    pendingPlans.set(id, { resolve, fallback, timeout });
    try {
      planWorker.postMessage({ id, db, base: base.toISOString() });
    } catch {
      pendingPlans.delete(id);
      clearTimeout(timeout);
      fallback();
    }
  });
}

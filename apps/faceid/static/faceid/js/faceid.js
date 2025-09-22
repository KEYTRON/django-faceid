// Русские комментарии для ясности.
// MVP: берём видеопоток, MediaPipe FaceLandmarker -> лэндмарки,
// считаем грубые yaw/pitch/blink, рисуем оверлей, отправляем прогресс на WebSocket.
// Когда челлендж выполнен — собираем 3–5 лучших кадров и шлём в Django.

import { FaceLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest";

const $ = (sel) => document.querySelector(sel);
const video = $("#cam");
const canvas = $("#overlay");
const ctx = canvas.getContext("2d");
const stepsBox = $("#steps");
const startBtn = $("#start");
const saveBtn = $("#save");
const loginBtn = $("#login");
const usernameInput = $("#username");

const MODE = window.FACEID_MODE || "enroll";
const CSRF = document.querySelector('meta[name="csrf-token"]').content;

// Подключение WS
let ws = null;
let plan = [];
let index = 0;
let framesForServer = []; // массив Blob (JPEG) — 3..5 кадров

// MediaPipe загрузка
let landmarker = null;
let lastTs = 0;
let blinkState = { l: false, r: false, lastBlink: 0 };

async function setupLandmarker() {
  const filesetResolver = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
  );
  landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
    baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task" },
    outputFaceBlendshapes: true,   // для blink через blendshapes
    outputFacialTransformationMatrixes: true, // пригодится для позы
    numFaces: 1,
    runningMode: "VIDEO",
  });
}

async function setupCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
  video.srcObject = stream;
  await video.play();
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
}

function drawLandmarks(landmarks) {
  // Рисуем 2–3 ключевые области: контур, глаза, нос — чисто визуализация
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  ctx.lineWidth = 2;

  const pts = (idxs, color = "#00FF88") => {
    ctx.beginPath();
    for (let i = 0; i < idxs.length; i++) {
      const p = landmarks[idxs[i]];
      const x = p.x * canvas.width;
      const y = p.y * canvas.height;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.strokeStyle = color;
    ctx.stroke();
  };

  // Контур лица (простая выборка индексов)
  pts([10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109, 10], "#00FF88");

  // Левый/правый глаз — примитивно, для красоты
  pts([33,7,163,144,145,153,154,155,133], "#55BBFF");
  pts([263,249,390,373,374,380,381,382,362], "#55BBFF");
}

function estimatePose(landmarks) {
  // Грубая оценка поворотов головы (yaw/pitch) без OpenCV.
  // Идея: сравниваем относительные расстояния "нос — левый/правый висок" и "нос — верх/низ".
  // Это не миллиметровая точность, но для челленджа хватает.

  const L = (i) => landmarks[i];
  // ключевые точки (mediapipe indices)
  const NOSE = 1;    // нос
  const LEFT = 234;  // левый висок
  const RIGHT = 454; // правый висок
  const TOP = 10;    // верх лба
  const BTM = 152;   // подбородок

  const dxL = (L(LEFT).x - L(NOSE).x);
  const dxR = (L(RIGHT).x - L(NOSE).x);
  // yaw: если нос ближе к левому виску (dxL маленький) — смотрим влево (yaw отриц.)
  const yaw = (dxR - dxL) * 100; // масштабирование до «градусоподобной» метрики

  const dyT = (L(TOP).y - L(NOSE).y);
  const dyB = (L(BTM).y - L(NOSE).y);
  // pitch: если нос ближе к подбородку (dyB маленький) — поднят вверх (pitch отриц.)
  const pitch = (dyB - dyT) * 100;

  return { yaw, pitch };
}

function detectBlink(blendshapes) {
  // Ищем blendshape с именем "eyeBlinkLeft"/"eyeBlinkRight"
  const get = (name) => blendshapes.find(b => b.categoryName === name)?.score || 0;
  const l = get("eyeBlinkLeft");
  const r = get("eyeBlinkRight");
  const blink = (l > 0.5 && r > 0.5); // порог эмпирический
  return blink;
}

function renderSteps() {
  stepsBox.innerHTML = "";
  plan.forEach((s, i) => {
    const el = document.createElement("div");
    el.className = "step " + (i < index ? "ok" : "");
    const label = s.type === "blink"
      ? `Моргание ×${s.count||1}`
      : (s.type === "yaw" ? `Поверни ${s.dir}` : `Подними/опусти ${s.dir}`);
    el.textContent = label;
    stepsBox.appendChild(el);
  });
}

function captureFrameBlob(quality=0.9) {
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), "image/jpeg", quality);
  });
}

async function loop(ts) {
  if (!landmarker) return;
  if (!lastTs) lastTs = ts;
  const results = await landmarker.detectForVideo(video, ts);

  if (results && results.faceLandmarks && results.faceLandmarks.length > 0) {
    const lm = results.faceLandmarks[0];
    drawLandmarks(lm);

    const pose = estimatePose(lm);
    const blink = results.faceBlendshapes?.length ? detectBlink(results.faceBlendshapes[0].categories) : false;

    // Шлем метрики на сервер (если есть активный WS)
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ kind: "metrics", yaw: pose.yaw, pitch: pose.pitch, blink }));
    }

    // Если челлендж идёт — сохраняем пару кадров для сервера после успеха
    if (index > 0 && framesForServer.length < 5) {
      const blob = await captureFrameBlob(0.92);
      framesForServer.push(blob);
    }
  }

  requestAnimationFrame(loop);
}

function connectWS() {
  const sid = Math.random().toString(36).slice(2);
  ws = new WebSocket(`ws://${location.host}/ws/faceid/${sid}/`);
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.kind === "challenge_plan") {
      plan = msg.plan;
      index = 0;
      renderSteps();
    }
    if (msg.kind === "step") {
      if (msg.passed) {
        index = msg.index + 1;
        renderSteps();
      }
    }
    if (msg.kind === "done" && msg.passed) {
      // Разрешаем сохранение/вход
      if (MODE === "enroll") saveBtn.disabled = false;
      if (MODE === "verify") loginBtn.disabled = false;
    }
  }
}

async function postEnroll() {
  // Отправляем 3–5 кадров
  const fd = new FormData();
  framesForServer.slice(0, 5).forEach((b, i) => fd.append("files[]", b, `frame_${i}.jpg`));

  const r = await fetch("/faceid/api/enroll", {
    method: "POST",
    headers: { "X-CSRFToken": CSRF },
    body: fd
  });
  const j = await r.json();
  alert(j.ok ? "Шаблон сохранён" : `Ошибка: ${j.error||"unknown"}`);
}

async function postVerify() {
  const fd = new FormData();
  fd.append("username", usernameInput?.value || "");
  const b = framesForServer[0] || await captureFrameBlob(0.92);
  fd.append("file", b, "probe.jpg");

  const r = await fetch("/faceid/api/verify", { method: "POST", headers: { "X-CSRFToken": CSRF }, body: fd });
  const j = await r.json();
  if (j.ok && j.passed) {
    alert(`OK, score=${j.score.toFixed(3)} ✅`);
    // Здесь можно дернуть реальный login flow (сессия/токен), это MVP
  } else {
    alert(`FAIL, score=${(j.score||0).toFixed(3)} ❌`);
  }
}

startBtn?.addEventListener("click", () => {
  connectWS();
  framesForServer = [];
});

saveBtn?.addEventListener("click", postEnroll);
loginBtn?.addEventListener("click", postVerify);

// Инициализация
(async () => {
  await setupCamera();
  await setupLandmarker();
  requestAnimationFrame(loop);
})();

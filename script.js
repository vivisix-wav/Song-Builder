// ----- Metronome -----
let ctx = null;
let nextNoteTime = 0;
let timerId = null;

let bpm = 120;
let beatsPerBar = 4;
let beatIndex = 0;

const bpmSlider = document.getElementById("bpm");
const bpmLabel = document.getElementById("bpmLabel");
const tsLabel = document.getElementById("tsLabel");

function ensureAudio() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
}

function click(accent = false) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "square";
  osc.frequency.value = accent ? 1200 : 800;

  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.001);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.03);

  osc.connect(gain).connect(ctx.destination);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.05);
}

function schedule() {
  const lookahead = 0.1;
  const interval = 25;
  const secondsPerBeat = 60 / bpm;

  while (nextNoteTime < ctx.currentTime + lookahead) {
    const accent = (beatIndex % beatsPerBar) === 0;
    click(accent);

    nextNoteTime += secondsPerBeat;
    beatIndex = (beatIndex + 1) % beatsPerBar;
  }

  timerId = setTimeout(schedule, interval);
}

function start() {
  ensureAudio();

  ctx.resume().then(() => {
    // audible confirmation click
    click(true);

    beatIndex = 0;
    nextNoteTime = ctx.currentTime + 0.05;
    schedule();

    document.getElementById("startBtn").disabled = true;
    document.getElementById("stopBtn").disabled = false;
  }).catch((err) => {
    console.error("Audio resume failed:", err);
  });
}

function stop() {
  if (timerId) clearTimeout(timerId);
  timerId = null;

  document.getElementById("startBtn").disabled = false;
  document.getElementById("stopBtn").disabled = true;
}

document.getElementById("startBtn").addEventListener("click", start);
document.getElementById("stopBtn").addEventListener("click", stop);

bpmSlider.addEventListener("input", (e) => {
  bpm = Number(e.target.value);
  bpmLabel.textContent = String(bpm);
});

document.querySelectorAll(".ts").forEach((btn) => {
  btn.addEventListener("click", () => {
    const ts = Number(btn.dataset.ts);
    beatsPerBar = ts;
    tsLabel.textContent = ts === 6 ? "6/8" : `${ts}/4`;
    beatIndex = 0;
  });
});

// ----- Song structure timeline -----
const timelineEl = document.getElementById("timeline");
const sectionSelect = document.getElementById("sectionSelect");
const measuresInput = document.getElementById("measuresInput");
const addSectionBtn = document.getElementById("addSectionBtn");

let structure = [];

function renderTimeline() {
  if (structure.length === 0) {
    timelineEl.innerHTML = `<div style="opacity:0.75;">No sections yet. Add one above.</div>`;
    return;
  }

  timelineEl.innerHTML = structure.map((s, i) => {
    return `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; padding:10px; margin-bottom:8px;
                  background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.10); border-radius:12px;">
        <div style="display:flex; gap:10px; align-items:baseline;">
          <div style="font-weight:650;">${i+1}.</div>
          <div>${s.name}</div>
          <div style="opacity:0.8;">(${s.measures} bars)</div>
        </div>
        <div style="display:flex; gap:6px;">
          <button data-act="up" data-i="${i}" ${i===0 ? "disabled" : ""}>↑</button>
          <button data-act="down" data-i="${i}" ${i===structure.length-1 ? "disabled" : ""}>↓</button>
          <button data-act="del" data-i="${i}">Delete</button>
        </div>
      </div>
    `;
  }).join("");
}

addSectionBtn.addEventListener("click", () => {
  const name = sectionSelect.value;
  const measures = Math.max(1, Math.min(128, Number(measuresInput.value || 1)));
  structure.push({ name, measures });
  renderTimeline();
});

timelineEl.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;

  const act = btn.dataset.act;
  const i = Number(btn.dataset.i);
  if (Number.isNaN(i)) return;

  if (act === "del") structure.splice(i, 1);
  if (act === "up" && i > 0) [structure[i-1], structure[i]] = [structure[i], structure[i-1]];
  if (act === "down" && i < structure.length - 1) [structure[i+1], structure[i]] = [structure[i], structure[i+1]];

  renderTimeline();
});

renderTimeline();

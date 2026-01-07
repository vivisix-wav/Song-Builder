// ----- Metronome -----
let ctx = null;
let nextNoteTime = 0;
let timerId = null;

let bpm = 120;
let beatsPerBar = 4;
let beatIndex = 0;

function ensureAudio() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
}

// consistent click: accent = slightly louder + higher pitch, others identical
function click(accent = false) {
  const t = ctx.currentTime;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "square";
  osc.frequency.setValueAtTime(accent ? 1400 : 900, t);

  const peak = accent ? 0.18 : 0.12;
  const attack = 0.002;
  const decay = 0.025;

  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(peak, t + attack);
  gain.gain.linearRampToValueAtTime(0.0001, t + attack + decay);

  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + attack + decay + 0.01);
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
    // confirmation click (proves audio is unlocked)
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

// ----- Song structure timeline -----
let structure = [];

function renderTimeline() {
  const timelineEl = document.getElementById("timeline");
  if (!timelineEl) return;

  if (structure.length === 0) {
    timelineEl.innerHTML = `<div style="opacity:0.75;">No sections yet. Add one above.</div>`;
    return;
  }

  timelineEl.innerHTML = structure.map((s, i) => {
    return `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; padding:10px; margin-bottom:8px;
                  background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.10); border-radius:12px;">
        <div style="display:flex; gap:10px; align-items:baseline; flex-wrap:wrap;">
          <div style="font-weight:650;">${i+1}.</div>
          <div>${s.name}</div>
          <div style="opacity:0.8;">(${s.measures} bars)</div>
        </div>
        <div style="display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end;">
          <button data-act="drums" data-i="${i}">Edit drums</button>
          <button data-act="up" data-i="${i}" ${i===0 ? "disabled" : ""}>↑</button>
          <button data-act="down" data-i="${i}" ${i===structure.length-1 ? "disabled" : ""}>↓</button>
          <button data-act="del" data-i="${i}">Delete</button>
        </div>
      </div>
    `;
  }).join("");
}
const DRUMS = ["Kick", "Snare", "Open Hat", "Closed Hat", "Crash"];

function stepsPerMeasure() {
  // follows selected time signature
  // beatsPerBar is 4 for 4/4, 3 for 3/4, 6 for 6/8
  // For /4 meters: 16ths -> 4 steps per beat
  // For 6/8: treat each beat as an 8th -> 2 steps per beat (16th-of-8th)
  return beatsPerBar * (beatsPerBar === 6 ? 2 : 4);
}

function ensurePattern(section) {
  const steps = section.measures * stepsPerMeasure();
  if (!section.pattern) section.pattern = {};
  for (const d of DRUMS) {
    if (!Array.isArray(section.pattern[d])) section.pattern[d] = [];
    if (section.pattern[d].length < steps) {
      section.pattern[d].length = steps;
      section.pattern[d].fill(false, 0);
    } else if (section.pattern[d].length > steps) {
      section.pattern[d].length = steps;
    }
  }
  section._steps = steps;
}

function wireUI() {
  const startBtn = document.getElementById("startBtn");
  const stopBtn = document.getElementById("stopBtn");
  const bpmSlider = document.getElementById("bpm");
  const bpmLabel = document.getElementById("bpmLabel");
  const tsLabel = document.getElementById("tsLabel");

  // If these are null, the script is loading too early or IDs changed.
  if (!startBtn || !stopBtn || !bpmSlider || !bpmLabel || !tsLabel) {
    console.error("Missing expected elements. Check IDs in index.html.");
    return;
  }

  startBtn.addEventListener("click", start);
  stopBtn.addEventListener("click", stop);

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

  const sectionSelect = document.getElementById("sectionSelect");
  const measuresInput = document.getElementById("measuresInput");
  const addSectionBtn = document.getElementById("addSectionBtn");
  const timelineEl = document.getElementById("timeline");

  if (addSectionBtn && sectionSelect && measuresInput) {
    addSectionBtn.addEventListener("click", () => {
      const name = sectionSelect.value;
      const measures = Math.max(1, Math.min(128, Number(measuresInput.value || 1)));
      const section = { name, measures, pattern: {} };
      ensurePattern(section);
      structure.push(section);

      renderTimeline();
    });
  }

  if (timelineEl) {
    timelineEl.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;

      const act = btn.dataset.act;
      const i = Number(btn.dataset.i);
      if (Number.isNaN(i)) return;

      if (act === "drums") {
      openDrumEditor(i);
      return;
    }
 
      if (act === "del") structure.splice(i, 1);
      if (act === "up" && i > 0) [structure[i-1], structure[i]] = [structure[i], structure[i-1]];
      if (act === "down" && i < structure.length - 1) [structure[i+1], structure[i]] = [structure[i], structure[i+1]];

      renderTimeline();
    });
  }

  renderTimeline();
}

document.addEventListener("DOMContentLoaded", wireUI);

function openDrumEditor(i) {
  const ed = document.getElementById("drumEditor");
  if (!ed) return;

  const section = structure[i];
  ensurePattern(section);

  const steps = section._steps;
  const spm = stepsPerMeasure();

  ed.style.display = "block";
  ed.innerHTML = `
    <div class="drumTop">
      <div><strong>${section.name}</strong> • ${section.measures} bars • ${beatsPerBar === 6 ? "6/8" : beatsPerBar + "/4"}</div>
      <button id="closeDrumsBtn">Close</button>
    </div>
    <div class="grid" id="grid"
      style="grid-template-columns: 90px repeat(${steps}, 18px);">
      ${DRUMS.map((d) => {
        return `
          <div class="gridRowLabel">${d}</div>
          ${Array.from({ length: steps }).map((_, c) => {
            const on = section.pattern[d][c] ? "on" : "";
            const downbeat = (c % spm === 0) ? "downbeat" : "";
            return `<div class="cell ${on} ${downbeat}" data-drum="${d}" data-step="${c}"></div>`;
          }).join("")}
        `;
      }).join("")}
    </div>
  `;

  document.getElementById("closeDrumsBtn").addEventListener("click", () => {
    ed.style.display = "none";
  });

  ed.querySelector("#grid").addEventListener("click", (e) => {
    const cell = e.target.closest(".cell");
    if (!cell) return;

    const drum = cell.dataset.drum;
    const step = Number(cell.dataset.step);

    section.pattern[drum][step] = !section.pattern[drum][step];
    cell.classList.toggle("on");
  });
}

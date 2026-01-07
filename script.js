// ----- Audio / Metronome / Drums -----
let ctx = null;

let nextTickTime = 0;
let timerId = null;

let bpm = 120;

// current UI time sig (used for display + new sections)
let beatsPerBar = 4;

// playback state
let playTs = 4;              // time signature for playback (from active section)
let stepsPerBeat = 4;        // 4 for /4 meters, 2 for 6/8
let stepsPerMeasure = 16;    // playTs * stepsPerBeat
let tickInMeasure = 0;

let activeSectionIndex = null;
let sectionStepPos = 0;      // step position within active section loop
let sectionTotalSteps = 0;

const DRUMS = ["Kick", "Snare", "Open Hat", "Closed Hat", "Crash"];
const SAMPLE_URLS = {
  "Kick": "audio/kick.wav",
  "Snare": "audio/snare.wav",
  "Open Hat": "audio/ohat.wav",
  "Closed Hat": "audio/chat.wav",
  "Crash": "audio/crash.wav",
};

let samplesLoaded = false;
let drumBuffers = {}; // { "Kick": AudioBuffer, ... }

function ensureAudio() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
}

async function loadSamplesOnce() {
  if (samplesLoaded) return;

  ensureAudio();
  const entries = Object.entries(SAMPLE_URLS);

  for (const [name, url] of entries) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ${url} (${res.status})`);
    const arr = await res.arrayBuffer();
    drumBuffers[name] = await ctx.decodeAudioData(arr);
  }

  samplesLoaded = true;
  console.log("Samples loaded:", Object.keys(drumBuffers));
}

function playSample(name, time) {
  const buf = drumBuffers[name];
  if (!buf) return;

  const src = ctx.createBufferSource();
  src.buffer = buf;

  // tiny gain to avoid clipping if many hits stack
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.9, time);

  src.connect(g).connect(ctx.destination);
  src.start(time);
}

// consistent metronome click (accent only on bar 1)
function click(accent, time) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "square";
  osc.frequency.setValueAtTime(accent ? 1400 : 900, time);

  const peak = accent ? 0.18 : 0.12;
  const attack = 0.002;
  const decay = 0.025;

  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.linearRampToValueAtTime(peak, time + attack);
  gain.gain.linearRampToValueAtTime(0.0001, time + attack + decay);

  osc.connect(gain).connect(ctx.destination);
  osc.start(time);
  osc.stop(time + attack + decay + 0.01);
}

function getStepsPerBeat(ts) {
  return ts === 6 ? 2 : 4;
}

function getStepsPerMeasure(ts) {
  return ts * getStepsPerBeat(ts);
}

// ----- Song structure + patterns -----
let structure = [];

function ensurePattern(section) {
  const spm = getStepsPerMeasure(section.ts);
  const steps = section.measures * spm;

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
  section._spm = spm;
}

function renderTimeline() {
  const timelineEl = document.getElementById("timeline");
  if (!timelineEl) return;

  if (structure.length === 0) {
    timelineEl.innerHTML = `<div style="opacity:0.75;">No sections yet. Add one above.</div>`;
    return;
  }

  timelineEl.innerHTML = structure.map((s, i) => {
    const tsText = (s.ts === 6) ? "6/8" : `${s.ts}/4`;
    const isActive = (i === activeSectionIndex);
    return `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; padding:10px; margin-bottom:8px;
                  background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.10); border-radius:12px;">
        <div style="display:flex; gap:10px; align-items:baseline; flex-wrap:wrap;">
          <div style="font-weight:650;">${i+1}.</div>
          <div>${s.name}</div>
          <div style="opacity:0.8;">(${s.measures} bars • ${tsText})</div>
          ${isActive ? `<div style="opacity:0.9; font-size:12px;">• active</div>` : ``}
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

function openDrumEditor(i) {
  const ed = document.getElementById("drumEditor");
  if (!ed) return;

  activeSectionIndex = i;

  const section = structure[i];
  ensurePattern(section);

  const steps = section._steps;
  const spm = section._spm;
  const tsText = (section.ts === 6) ? "6/8" : `${section.ts}/4`;

  ed.style.display = "block";
  ed.innerHTML = `
    <div class="drumTop">
      <div><strong>${section.name}</strong> • ${section.measures} bars • ${tsText}</div>
      <button id="closeDrumsBtn">Close</button>
    </div>

    <div class="grid" id="grid" style="grid-template-columns: 90px repeat(${steps}, 18px);">
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

  renderTimeline(); // show “active”
}

// ----- Playback scheduler (tick = smallest grid step) -----
function preparePlaybackFromActiveSection() {
  if (activeSectionIndex === null || !structure[activeSectionIndex]) {
    // no section selected, still allow metronome with current UI time signature
    playTs = beatsPerBar;
    stepsPerBeat = getStepsPerBeat(playTs);
    stepsPerMeasure = getStepsPerMeasure(playTs);
    sectionTotalSteps = 0;
    sectionStepPos = 0;
    tickInMeasure = 0;
    return;
  }

  const section = structure[activeSectionIndex];
  ensurePattern(section);

  playTs = section.ts;
  stepsPerBeat = getStepsPerBeat(playTs);
  stepsPerMeasure = getStepsPerMeasure(playTs);

  sectionTotalSteps = section._steps;
  sectionStepPos = 0;
  tickInMeasure = 0;
}

function schedule() {
  const lookahead = 0.12;
  const interval = 25;

  const secondsPerBeat = 60 / bpm;
  const secondsPerStep = secondsPerBeat / stepsPerBeat;

  while (nextTickTime < ctx.currentTime + lookahead) {
    const t = nextTickTime;

    // metronome click on beat boundaries only
    const isBeat = (tickInMeasure % stepsPerBeat) === 0;
    if (isBeat) {
      const isBarStart = tickInMeasure === 0;
      click(isBarStart, t);
    }

    // drum hits on every step (if pattern says so)
    if (sectionTotalSteps > 0 && activeSectionIndex !== null) {
      const section = structure[activeSectionIndex];
      for (const d of DRUMS) {
        if (section.pattern[d][sectionStepPos]) {
          playSample(d, t);
        }
      }

      sectionStepPos = (sectionStepPos + 1) % sectionTotalSteps;
    }

    // advance tick counters
    nextTickTime += secondsPerStep;
    tickInMeasure = (tickInMeasure + 1) % stepsPerMeasure;
  }

  timerId = setTimeout(schedule, interval);
}

async function start() {
  ensureAudio();

  try {
    await ctx.resume();
    await loadSamplesOnce();

    preparePlaybackFromActiveSection();

    // tiny confirmation tick (unlocks + shows samples are okay)
    click(true, ctx.currentTime);

    nextTickTime = ctx.currentTime + 0.05;
    schedule();

    document.getElementById("startBtn").disabled = true;
    document.getElementById("stopBtn").disabled = false;
  } catch (err) {
    console.error(err);
    alert(String(err));
  }
}

function stop() {
  if (timerId) clearTimeout(timerId);
  timerId = null;

  tickInMeasure = 0;
  sectionStepPos = 0;

  document.getElementById("startBtn").disabled = false;
  document.getElementById("stopBtn").disabled = true;
}

// ----- UI wiring -----
function wireUI() {
  const startBtn = document.getElementById("startBtn");
  const stopBtn = document.getElementById("stopBtn");
  const bpmSlider = document.getElementById("bpm");
  const bpmLabel = document.getElementById("bpmLabel");
  const tsLabel = document.getElementById("tsLabel");

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
      tickInMeasure = 0;
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

      const section = { name, measures, ts: beatsPerBar, pattern: {} };
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

      // if you delete/reorder the active section, reset active selection safely
      if (activeSectionIndex !== null) {
        if (structure.length === 0) activeSectionIndex = null;
        else if (activeSectionIndex >= structure.length) activeSectionIndex = structure.length - 1;
      }

      renderTimeline();
    });
  }

  renderTimeline();
}

document.addEventListener("DOMContentLoaded", wireUI);

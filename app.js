const COLORS = ["#ff5d4d", "#ffb703", "#7c3aed", "#22c55e", "#38bdf8", "#fb7185", "#f97316", "#eab308"];
const LOOPS = 20;
const PLACES = ["hàng trăm", "hàng chục", "hàng đơn vị"];

const PRIZES = [
  { id: "ba", name: "Giải Ba", short: "GIẢI BA", cheer: "Giải Ba đã có chủ!" },
  { id: "nhi", name: "Giải Nhì", short: "GIẢI NHÌ", cheer: "Giải Nhì thật rực rỡ!" },
  { id: "nhat", name: "Giải Nhất", short: "GIẢI NHẤT", cheer: "Nhà vô địch đêm Trung Thu!" },
];

const els = {
  machine: document.getElementById("machine"),
  lever: document.getElementById("lever"),
  spin: document.getElementById("btn-spin"),
  spinKicker: document.getElementById("spin-kicker"),
  spinLabel: document.getElementById("spin-label"),
  sound: document.getElementById("btn-sound"),
  musicBtn: document.getElementById("btn-music"),
  bgm: document.getElementById("bgm"),
  full: document.getElementById("btn-full"),
  reset: document.getElementById("btn-reset"),
  hint: document.getElementById("hint"),
  afterActions: document.getElementById("after-actions"),
  accept: document.getElementById("btn-accept"),
  discard: document.getElementById("btn-discard"),
  confetti: document.getElementById("confetti"),
  reels: [
    document.getElementById("reel-100"),
    document.getElementById("reel-10"),
    document.getElementById("reel-1"),
  ],
  cells: [
    document.getElementById("cell-100"),
    document.getElementById("cell-10"),
    document.getElementById("cell-1"),
  ],
  nums: {
    ba: document.getElementById("num-ba"),
    nhi: document.getElementById("num-nhi"),
    nhat: document.getElementById("num-nhat"),
  },
  cards: {
    ba: document.getElementById("card-ba"),
    nhi: document.getElementById("card-nhi"),
    nhat: document.getElementById("card-nhat"),
  },
};

const state = {
  pool: [],
  winners: { ba: null, nhi: null, nhat: null },
  step: 0,
  digit: 0,
  pending: null,
  awaiting: false,
  spinning: false,
  soundOn: true,
  musicOn: false,
  hasTrack: false,
  audio: null,
  tuneTimer: 0,
  shown: [0, 0, 0],
};

function toDigits(n) {
  const v = Math.max(0, Math.min(999, Math.trunc(Number(n) || 0)));
  return [Math.floor(v / 100), Math.floor(v / 10) % 10, v % 10];
}

function maskDigits(digits, revealed) {
  return digits.map((d, i) => (i < revealed ? String(d) : "•")).join("");
}

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem("trungthu-settings") || "{}");
    if (saved.soundOn != null) state.soundOn = saved.soundOn;
  } catch { /* ponytail: ignore broken localStorage */ }
  els.sound.textContent = state.soundOn ? "🔊" : "🔇";
  els.sound.setAttribute("aria-pressed", String(state.soundOn));
}

function saveSettings() {
  localStorage.setItem("trungthu-settings", JSON.stringify({ soundOn: state.soundOn }));
}

function createPool(min, max) {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
}

function pickIndex(len) {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % len;
}

function buildStrips() {
  els.reels.forEach((strip) => {
    strip.innerHTML = "";
    for (let i = 0; i < LOOPS * 10 + 10; i++) {
      const s = document.createElement("span");
      s.textContent = String(i % 10);
      strip.appendChild(s);
    }
  });
}

function cellSize() {
  return els.reels[0].parentElement.clientHeight;
}

function setReel(strip, digit, ms, loops) {
  const y = -((loops * 10 + digit) * cellSize());
  strip.style.transition = ms ? `transform ${ms}ms cubic-bezier(0.12, 0.82, 0.08, 1)` : "none";
  strip.style.transform = `translateY(${y}px)`;
}

function snapTo(digits) {
  els.reels.forEach((strip, i) => setReel(strip, digits[i], 0, 0));
  state.shown = digits.slice();
}

function removeFromPool(n) {
  const at = state.pool.indexOf(n);
  if (at >= 0) state.pool.splice(at, 1);
}

function takenNumbers() {
  return new Set(Object.values(state.winners).filter((v) => v != null));
}

function pickUniqueNumber() {
  const taken = takenNumbers();
  const open = state.pool.filter((n) => !taken.has(n));
  if (!open.length) return null;
  return open[pickIndex(open.length)];
}

function showConfirm(show) {
  state.awaiting = show;
  if (els.afterActions) els.afterActions.hidden = !show;
  els.machine.classList.toggle("awaiting", show);
  els.spin.disabled = show || state.spinning || !PRIZES[state.step];
}

function resetNight() {
  state.pool = createPool(0, 999);
  state.winners = { ba: null, nhi: null, nhat: null };
  state.step = 0;
  state.digit = 0;
  state.pending = null;
  state.awaiting = false;
  for (const id of ["ba", "nhi", "nhat"]) {
    els.nums[id].textContent = "•••";
    els.cards[id].classList.remove("won", "current");
  }
  snapTo([0, 0, 0]);
  els.machine.classList.remove("win");
  els.cells.forEach((c) => c.classList.remove("active", "landed"));
  showConfirm(false);
  updateStage();
}

function setHint(text) {
  if (els.hint) els.hint.textContent = text;
}

function updateStage() {
  const prize = PRIZES[state.step];
  for (const id of ["ba", "nhi", "nhat"]) {
    els.cards[id].classList.toggle("current", Boolean(prize) && prize.id === id && !state.awaiting);
  }
  els.cells.forEach((c, i) => c.classList.toggle("active", Boolean(prize) && i === state.digit && !state.spinning && !state.awaiting));
  if (!prize) {
    setHint("Đã trao đủ 3 giải! Mở cài đặt để quay lại từ Giải Ba.");
    els.spinKicker.textContent = "Đêm hội";
    els.spinLabel.textContent = "XONG";
    els.spin.disabled = true;
    showConfirm(false);
    return;
  }
  if (state.awaiting) {
    els.spin.disabled = true;
    return;
  }
  els.spin.disabled = false;
  els.spinKicker.textContent = `Lần ${state.digit + 1} / 3`;
  els.spinLabel.textContent = prize.short;
  setHint(`Gạt lần ${state.digit + 1}: ${PLACES[state.digit]} của ${prize.name}.`);
}

function audioCtx() {
  if (!state.audio) state.audio = new (window.AudioContext || window.webkitAudioContext)();
  if (state.audio.state === "suspended") state.audio.resume();
  return state.audio;
}

function beep(freq, dur, type = "sine", gain = 0.08) {
  if (!state.soundOn) return;
  const ctx = audioCtx();
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.value = gain;
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
  o.connect(g).connect(ctx.destination);
  o.start();
  o.stop(ctx.currentTime + dur);
}

function tone(freq, dur, gain = 0.045) {
  if (!state.musicOn) return;
  const ctx = audioCtx();
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "triangle";
  o.frequency.value = freq;
  g.gain.value = gain;
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
  o.connect(g).connect(ctx.destination);
  o.start();
  o.stop(ctx.currentTime + dur);
}

function fanfare(big) {
  const notes = big ? [523, 659, 784, 1046, 1318] : [523, 659, 784, 1046];
  notes.forEach((f, i) => setTimeout(() => beep(f, 0.35, "triangle", 0.1), i * 90));
}

const TUNE = [392, 440, 523, 440, 392, 349, 392, 0, 523, 587, 659, 587, 523, 440, 392, 0];
function playTuneStep(i) {
  if (!state.musicOn || state.hasTrack) return;
  const f = TUNE[i % TUNE.length];
  if (f) tone(f, 0.28);
  state.tuneTimer = setTimeout(() => playTuneStep(i + 1), 320);
}

function startMusic() {
  state.musicOn = true;
  els.musicBtn.classList.add("on");
  els.musicBtn.setAttribute("aria-pressed", "true");
  audioCtx();
  clearTimeout(state.tuneTimer);
  if (state.hasTrack) {
    els.bgm.volume = 0.38;
    els.bgm.play().catch(() => playTuneStep(0));
  } else {
    playTuneStep(0);
  }
}

function stopMusic() {
  state.musicOn = false;
  els.musicBtn.classList.remove("on");
  els.musicBtn.setAttribute("aria-pressed", "false");
  els.bgm.pause();
  clearTimeout(state.tuneTimer);
}

function pullLever() {
  els.lever.classList.remove("pull");
  void els.lever.offsetWidth;
  els.lever.classList.add("pull");
  beep(170, 0.1, "square", 0.05);
  setTimeout(() => els.lever.classList.remove("pull"), 420);
}

function pull() {
  if (state.spinning || state.awaiting || !PRIZES[state.step]) return;
  ensureMusicPlaying();
  if (!state.pending && state.pool.filter((n) => !takenNumbers().has(n)).length < 1) {
    setHint("Hết số hợp lệ. Bấm 🔄 để làm mới đêm hội.");
    return;
  }

  if (!state.pending) {
    const n = pickUniqueNumber();
    if (n == null) {
      setHint("Không còn số mới để quay.");
      return;
    }
    state.pending = { n, digits: toDigits(n) };
    snapTo([0, 0, 0]);
  }

  const prize = PRIZES[state.step];
  const place = state.digit;
  const digit = state.pending.digits[place];
  const dur = 1600 + place * 180;

  state.spinning = true;
  els.spin.disabled = true;
  els.machine.classList.remove("win");
  els.cells.forEach((c, i) => c.classList.toggle("active", i === place));
  pullLever();
  updateStage();

  const strip = els.reels[place];
  setReel(strip, state.shown[place], 0, 0);
  requestAnimationFrame(() => setReel(strip, digit, dur, 8 + place * 2));

  setTimeout(() => {
    state.shown[place] = digit;
    els.cells[place].classList.remove("active");
    els.cells[place].classList.add("landed");
    setTimeout(() => els.cells[place].classList.remove("landed"), 400);
    els.nums[prize.id].textContent = maskDigits(state.pending.digits, place + 1);
    beep(480 + place * 140, 0.16, "triangle", 0.07);
    fireworks("pop", els.cells[place]);
    state.digit += 1;

    if (state.digit >= 3) finishReveal(prize);
    else {
      state.spinning = false;
      updateStage();
    }
  }, dur + 40);
}

function finishReveal(prize) {
  const pending = state.pending;
  if (!pending) {
    state.spinning = false;
    updateStage();
    return;
  }
  const { n, digits } = pending;
  removeFromPool(n);
  state.winners[prize.id] = n;
  els.nums[prize.id].textContent = String(n).padStart(3, "0");
  els.cards[prize.id].classList.add("won");
  els.machine.classList.add("win");
  state.spinning = false;
  snapTo(digits);
  els.spinKicker.textContent = prize.name;
  els.spinLabel.textContent = String(n).padStart(3, "0");
  const last = prize.id === "nhat";
  els.accept.textContent = last
    ? "Chúc mừng bé trúng giải!"
    : "Chúc mừng bé trúng giải — Quay giải tiếp!";
  setHint(last
    ? `Giải Nhất: ${String(n).padStart(3, "0")} — có bé nhận không?`
    : `Số ${String(n).padStart(3, "0")} — có bé nhận không?`);
  showConfirm(true);
  fanfare(last);
  fireworks(last ? "finale" : "show");
}

function acceptWinner() {
  if (!state.awaiting) return;
  const prize = PRIZES[state.step];
  if (!prize) return;
  const n = state.winners[prize.id];
  const last = prize.id === "nhat";
  removeFromPool(n);
  state.pending = null;
  state.digit = 0;
  state.step += 1;
  showConfirm(false);
  els.machine.classList.remove("win");
  updateStage();
  if (last) {
    setHint(`Chúc mừng bé trúng Giải Nhất số ${String(n).padStart(3, "0")}! Đêm hội đã trao đủ 3 giải.`);
    els.spinKicker.textContent = "Chúc mừng";
    els.spinLabel.textContent = String(n).padStart(3, "0");
    fireworks("finale");
    fanfare(true);
  } else {
    const next = PRIZES[state.step];
    setHint(`${prize.cheer} Gạt cho ${next.name} nhé!`);
    els.spinKicker.textContent = "Tiếp theo";
    els.spinLabel.textContent = next.short;
    snapTo([0, 0, 0]);
  }
  beep(660, 0.15, "triangle", 0.08);
}

function discardAndRedraw() {
  if (!state.awaiting) return;
  const prize = PRIZES[state.step];
  if (!prize) return;
  const n = state.winners[prize.id];
  removeFromPool(n);
  state.winners[prize.id] = null;
  els.nums[prize.id].textContent = "•••";
  els.cards[prize.id].classList.remove("won");
  state.pending = null;
  state.digit = 0;
  showConfirm(false);
  els.machine.classList.remove("win");
  snapTo([0, 0, 0]);
  updateStage();
  setHint(`Đã bỏ ${String(n).padStart(3, "0")}. Quay lại ${prize.name} — số này không dùng nữa.`);
  beep(220, 0.12, "square", 0.05);
}

const FX_CAP = 220;
const fxParts = [];
let fxRaf = 0;
let fxShellTimers = [];

function clearFxTimers() {
  fxShellTimers.forEach(clearTimeout);
  fxShellTimers = [];
}

function fxCtx() {
  const c = els.confetti;
  const w = innerWidth;
  const h = innerHeight;
  // ponytail: 1x canvas = nhiều hạt hơn mà vẫn mượt trên máy chiếu
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
  return c.getContext("2d", { alpha: true });
}

function spawnShell(ox, oy, sparks, speed) {
  const room = FX_CAP - fxParts.length;
  if (room <= 0) return;
  const n = Math.min(sparks, room);
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n + Math.random() * 0.35;
    const sp = speed * (0.45 + Math.random() * 0.7);
    fxParts.push({
      x: ox,
      y: oy,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      g: 0.055,
      drag: 0.982,
      life: 32 + ((Math.random() * 28) | 0),
      s: 2 + Math.random() * 3.2,
      color: COLORS[i % COLORS.length],
    });
  }
  if (!fxRaf) fxRaf = requestAnimationFrame(tickFx);
}

function tickFx() {
  const ctx = fxCtx();
  const w = els.confetti.width;
  const h = els.confetti.height;
  ctx.clearRect(0, 0, w, h);

  let write = 0;
  for (let i = 0; i < fxParts.length; i++) {
    const p = fxParts[i];
    p.life -= 1;
    if (p.life <= 0) continue;
    p.vx *= p.drag;
    p.vy = p.vy * p.drag + p.g;
    p.x += p.vx;
    p.y += p.vy;
    if (p.y > h + 40 || p.x < -40 || p.x > w + 40) continue;

    ctx.globalAlpha = p.life < 12 ? p.life / 12 : 0.95;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, p.s, p.s);
    // core sáng — 1 rect thêm, vẫn rẻ hơn emoji/rotate
    if (p.life > 18) {
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = "#fff6c8";
      ctx.fillRect(p.x + 0.6, p.y + 0.6, p.s * 0.45, p.s * 0.45);
    }
    fxParts[write++] = p;
  }
  fxParts.length = write;
  ctx.globalAlpha = 1;

  if (fxParts.length || fxShellTimers.length) fxRaf = requestAnimationFrame(tickFx);
  else {
    ctx.clearRect(0, 0, w, h);
    fxRaf = 0;
  }
}

function pointFrom(around) {
  if (around) {
    const r = around.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  return { x: innerWidth * 0.5, y: innerHeight * 0.32 };
}

/** mode: "pop" | "show" | "finale" */
function fireworks(mode, around) {
  const base = pointFrom(around);
  if (mode === "pop") {
    spawnShell(base.x, base.y, 28, 5.5);
    return;
  }

  clearFxTimers();
  const shells = mode === "finale" ? 8 : 5;
  const sparks = mode === "finale" ? 52 : 40;
  const speed = mode === "finale" ? 8.5 : 7;

  for (let s = 0; s < shells; s++) {
    const t = setTimeout(() => {
      spawnShell(
        base.x + (Math.random() - 0.5) * innerWidth * 0.62,
        base.y + (Math.random() - 0.5) * innerHeight * 0.28,
        sparks,
        speed + Math.random() * 2
      );
      // vài hạt vàng rơi thêm cho cảm giác dày
      spawnShell(
        base.x + (Math.random() - 0.5) * innerWidth * 0.4,
        base.y + 40 + Math.random() * 60,
        18,
        3.5
      );
    }, s * 110);
    fxShellTimers.push(t);
  }
  // dọn danh sách timer sau đợt cuối
  const done = setTimeout(() => { fxShellTimers = []; }, shells * 110 + 50);
  fxShellTimers.push(done);
}

function decorateSky() {
  const sky = document.getElementById("stars");
  for (let i = 0; i < 70; i++) {
    const s = document.createElement("span");
    s.style.left = Math.random() * 100 + "%";
    s.style.top = Math.random() * 100 + "%";
    s.style.animationDelay = Math.random() * 2.8 + "s";
    sky.appendChild(s);
  }
  const flies = document.getElementById("fireflies");
  for (let i = 0; i < 14; i++) {
    const f = document.createElement("i");
    f.style.left = Math.random() * 100 + "%";
    f.style.top = 20 + Math.random() * 60 + "%";
    f.style.animationDelay = Math.random() * 5 + "s";
    flies.appendChild(f);
  }
  const box = document.getElementById("lanterns");
  for (let i = 0; i < 12; i++) {
    const l = document.createElement("div");
    l.className = "lantern paper-lantern";
    l.style.left = Math.random() * 100 + "%";
    l.style.animationDuration = 11 + Math.random() * 10 + "s";
    l.style.animationDelay = Math.random() * 8 + "s";
    l.style.transform = `scale(${0.7 + Math.random() * 0.7})`;
    box.appendChild(l);
  }
  const floaters = document.getElementById("floaters");
  ["🐇", "🥮", "🦁", "⭐", "🌸", "🐰", "🏮", "🌕"].forEach((ch, i) => {
    const el = document.createElement("div");
    el.className = "floater";
    el.textContent = ch;
    el.style.left = (i * 12 + 4) + "%";
    el.style.animationDuration = 12 + i + "s";
    el.style.animationDelay = (i * 1.1) + "s";
    floaters.appendChild(el);
  });
}

function bindMusic() {
  els.bgm.volume = 0.4;
  els.bgm.src = "music/trungthu.mp3";
  els.bgm.addEventListener("canplay", () => { state.hasTrack = true; });
  els.bgm.addEventListener("error", () => {
    state.hasTrack = false;
    console.warn("Không phát được music/trungthu.mp3 — kiểm tra file nhạc trong thư mục music/");
  });
}

function ensureMusicPlaying() {
  if (!state.musicOn) startMusic();
  else if (els.bgm.paused && state.hasTrack) els.bgm.play().catch(() => {});
}

function tryAutoMusic() {
  startMusic();
  const unlock = () => {
    ensureMusicPlaying();
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
}

els.spin.addEventListener("click", pull);
els.lever.addEventListener("click", pull);
els.accept.addEventListener("click", acceptWinner);
els.discard.addEventListener("click", discardAndRedraw);
els.reset.addEventListener("click", () => {
  if (state.spinning) return;
  resetNight();
});
els.sound.addEventListener("click", () => {
  state.soundOn = !state.soundOn;
  els.sound.textContent = state.soundOn ? "🔊" : "🔇";
  els.sound.setAttribute("aria-pressed", String(state.soundOn));
  saveSettings();
  if (state.soundOn) fanfare(false);
});
els.musicBtn.addEventListener("click", () => {
  if (state.musicOn) stopMusic();
  else startMusic();
});
els.full.addEventListener("click", () => {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
  else document.exitFullscreen();
});
window.addEventListener("keydown", (e) => {
  if (e.code === "Space" && !state.spinning && !state.awaiting) {
    e.preventDefault();
    pull();
  }
});
window.addEventListener("resize", () => snapTo(state.shown));

decorateSky();
buildStrips();
loadSettings();
bindMusic();
resetNight();
tryAutoMusic();
requestAnimationFrame(() => snapTo(state.shown));

(function () {
  'use strict';

  // Soft Music v5 — a gentle, non-looping-feeling musical bed generated with Web Audio API.
  // It uses a small major-7 / suspended chord palette and a quiet pentatonic melody.
  const state = {
    ctx: null,
    master: null,
    filter: null,
    playing: false,
    mode: 'soft-music',
    volume: 0.10,
    scheduler: null,
    nextStepTime: 0,
    step: 0,
    activeNodes: new Set(),
  };

  const BPM = 62;
  const BEAT = 60 / BPM;
  const STEP = BEAT * 2; // slow half-note pulse
  const LOOK_AHEAD = 0.15;
  const SCHEDULE_AHEAD = 0.8;

  const progression = [
    [261.63, 329.63, 392.00, 493.88], // Cmaj7
    [220.00, 261.63, 329.63, 392.00], // Am7
    [174.61, 261.63, 329.63, 392.00], // Fmaj7
    [196.00, 246.94, 293.66, 392.00], // Gsus2/add4
  ];

  // C major pentatonic, kept mostly in the middle register.
  const melody = [
    523.25, 587.33, 659.25, 587.33,
    523.25, 493.88, 440.00, 493.88,
    523.25, 659.25, 698.46, 659.25,
    587.33, 523.25, 493.88, 440.00,
  ];

  function safeStorageGet(key, fallback) {
    try { return localStorage.getItem(key) || fallback; } catch (_) { return fallback; }
  }

  function safeStorageSet(key, value) {
    try { localStorage.setItem(key, value); } catch (_) {}
  }

  function createWidget() {
    if (document.getElementById('wellbeingDock')) return;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <div class="scroll-progress" aria-hidden="true"><span id="scrollProgressBar"></span></div>
      <button class="back-top" id="backTop" type="button" aria-label="Lên đầu trang" title="Lên đầu trang">↑</button>
      <aside class="wellbeing-dock" id="wellbeingDock">
        <button class="sound-trigger" id="soundTrigger" type="button" aria-expanded="false" aria-controls="soundPanel">
          <span class="sound-icon">♫</span>
          <span class="sound-trigger-text">Nâng cấp trải nghiệm</span>
          <span class="sound-status-dot" id="soundDot" aria-hidden="true"></span>
        </button>
        <div class="sound-panel" id="soundPanel" hidden>
          <div class="sound-panel-head">
            <div>
              <span class="sound-kicker">TRẢI NGHIỆM</span>
              <h3>Nhạc nền nhẹ</h3>
            </div>
            <button class="sound-close" id="soundClose" type="button" aria-label="Đóng bảng âm thanh">×</button>
          </div>

          <div class="sound-mode-row">
            <button class="sound-mode active" data-sound-mode="soft-music" type="button">
              <b>Piano nhẹ</b><span>Chậm · êm · có giai điệu</span>
            </button>
            <button class="sound-mode" data-sound-mode="ambient" type="button">
              <b>Ambient</b><span>Tần số 432 Hz · Thiền định</span>
            </button>
          </div>

          <div class="sound-controls">
            <button class="sound-play" id="soundPlay" type="button"><span>▶</span> Phát nhạc</button>
            <label class="sound-volume"><span>Âm lượng</span><input id="soundVolume" type="range" min="0" max="0.22" step="0.01" value="0.10" /></label>
          </div>

          <div class="sound-state" id="soundState" aria-live="polite">Đang tắt</div>
          <p class="sound-note">Đây là tính năng hỗ trợ nhằm tăng trải nghiệm thư giãn cho người dùng.</p>
          <button class="focus-toggle" id="focusToggle" type="button"><span>☼</span> Chế độ tập trung</button>
        </div>
      </aside>
    `;
    document.body.appendChild(wrapper);
  }

  function track(node) {
    state.activeNodes.add(node);
    node.addEventListener('ended', () => state.activeNodes.delete(node));
    return node;
  }

  function createVoice(time, frequency, options = {}) {
    const {
      gainValue = 0.035,
      duration = 2.8,
      type = 'sine',
      attack = 0.10,
      release = 1.8,
      detune = 0,
      pan = 0,
    } = options;

    const osc = track(state.ctx.createOscillator());
    const gain = state.ctx.createGain();
    const panner = state.ctx.createStereoPanner ? state.ctx.createStereoPanner() : null;

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, time);
    osc.detune.setValueAtTime(detune, time);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, gainValue), time + attack);
    gain.gain.setValueAtTime(Math.max(0.0002, gainValue), time + Math.max(attack + 0.05, duration - release));
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    osc.connect(gain);
    if (panner) {
      panner.pan.setValueAtTime(pan, time);
      gain.connect(panner).connect(state.filter);
    } else {
      gain.connect(state.filter);
    }

    osc.start(time);
    osc.stop(time + duration + 0.08);
    return osc;
  }

  function scheduleSoftMusic(time, step) {
    const chord = progression[Math.floor(step / 4) % progression.length];

    // Warm chord bed: two very quiet voices, spread slightly left/right.
    createVoice(time, chord[0], { gainValue: 0.025, duration: STEP * 1.9, type: 'sine', attack: 0.35, release: 1.3, pan: -0.10 });
    createVoice(time, chord[2], { gainValue: 0.018, duration: STEP * 1.9, type: 'sine', attack: 0.45, release: 1.4, pan: 0.10 });

    // Small bell/piano-like melody. The envelope keeps it soft rather than percussive.
    const note = melody[step % melody.length];
    createVoice(time + 0.05, note, {
      gainValue: 0.026,
      duration: 2.25,
      type: 'triangle',
      attack: 0.025,
      release: 1.65,
      detune: step % 3 === 0 ? -2 : 1,
      pan: step % 2 ? 0.08 : -0.06,
    });
  }

  function scheduleAmbient(time, step) {
    const chord = progression[Math.floor(step / 4) % progression.length];
    createVoice(time, chord[0] / 2, { gainValue: 0.025, duration: STEP * 1.95, type: 'sine', attack: 0.7, release: 1.8, pan: -0.08 });
    createVoice(time, chord[2] / 2, { gainValue: 0.018, duration: STEP * 1.95, type: 'sine', attack: 0.8, release: 1.8, pan: 0.08 });
  }

  function scheduler() {
    if (!state.playing || !state.ctx) return;
    while (state.nextStepTime < state.ctx.currentTime + SCHEDULE_AHEAD) {
      if (state.mode === 'soft-music') scheduleSoftMusic(state.nextStepTime, state.step);
      else scheduleAmbient(state.nextStepTime, state.step);
      state.nextStepTime += STEP;
      state.step += 1;
    }
  }

  function startScheduler() {
    if (state.scheduler) window.clearInterval(state.scheduler);
    state.nextStepTime = state.ctx.currentTime + 0.08;
    state.step = 0;
    scheduler();
    state.scheduler = window.setInterval(scheduler, LOOK_AHEAD * 1000);
  }

  function stopScheduler() {
    if (state.scheduler) window.clearInterval(state.scheduler);
    state.scheduler = null;
  }

  function stopNodes() {
    stopScheduler();
    state.activeNodes.forEach((node) => {
      try { node.stop(); } catch (_) {}
      try { node.disconnect(); } catch (_) {}
    });
    state.activeNodes.clear();
  }

  async function ensureAudio() {
    if (!state.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) throw new Error('Web Audio API is not supported in this browser.');
      state.ctx = new AudioCtx();
      state.master = state.ctx.createGain();
      state.filter = state.ctx.createBiquadFilter();
      state.filter.type = 'lowpass';
      state.filter.frequency.value = 2200;
      state.filter.Q.value = 0.25;
      state.master.gain.value = 0;
      state.filter.connect(state.master).connect(state.ctx.destination);
    }
    if (state.ctx.state === 'suspended') await state.ctx.resume();
  }

  function setMaster(value, duration = 1.2) {
    if (!state.master || !state.ctx) return;
    const now = state.ctx.currentTime;
    state.master.gain.cancelScheduledValues(now);
    state.master.gain.setValueAtTime(Math.max(0.0001, state.master.gain.value), now);
    state.master.gain.exponentialRampToValueAtTime(Math.max(0.0001, value), now + duration);
  }

  async function toggleSound() {
    const playButton = document.getElementById('soundPlay');
    const stateLabel = document.getElementById('soundState');
    const dot = document.getElementById('soundDot');

    try {
      if (!state.playing) {
        await ensureAudio();
        state.playing = true;
        setMaster(state.volume, 1.8);
        startScheduler();
        playButton.innerHTML = '<span>Ⅱ</span> Tạm dừng';
        stateLabel.textContent = state.mode === 'soft-music' ? 'Đang phát · Piano nhẹ' : 'Đang phát · Ambient';
        dot.classList.add('on');
      } else {
        setMaster(0.0001, 0.9);
        state.playing = false;
        playButton.innerHTML = '<span>▶</span> Phát nhạc';
        stateLabel.textContent = 'Đang tắt';
        dot.classList.remove('on');
        window.setTimeout(() => {
          if (!state.playing) stopNodes();
        }, 1000);
      }
    } catch (error) {
      stateLabel.textContent = 'Trình duyệt không hỗ trợ âm thanh Web Audio.';
    }
  }

  async function changeMode(mode) {
    state.mode = mode;
    safeStorageSet('iw-sound-mode', mode);
    document.querySelectorAll('.sound-mode').forEach((btn) => btn.classList.toggle('active', btn.dataset.soundMode === mode));
    const stateLabel = document.getElementById('soundState');

    if (state.playing) {
      await ensureAudio();
      stopNodes();
      startScheduler();
      stateLabel.textContent = mode === 'soft-music' ? 'Đang phát · Piano nhẹ' : 'Đang phát · Ambient';
    } else {
      stateLabel.textContent = mode === 'soft-music' ? 'Sẵn sàng · Piano nhẹ' : 'Sẵn sàng · Ambient';
    }
  }

  function bindUi() {
    const trigger = document.getElementById('soundTrigger');
    const panel = document.getElementById('soundPanel');
    const close = document.getElementById('soundClose');
    const play = document.getElementById('soundPlay');
    const volume = document.getElementById('soundVolume');
    const focus = document.getElementById('focusToggle');
    const backTop = document.getElementById('backTop');

    trigger.addEventListener('click', () => {
      const next = panel.hasAttribute('hidden');
      if (next) panel.removeAttribute('hidden'); else panel.setAttribute('hidden', '');
      trigger.setAttribute('aria-expanded', String(next));
    });
    close.addEventListener('click', () => {
      panel.setAttribute('hidden', '');
      trigger.setAttribute('aria-expanded', 'false');
    });
    play.addEventListener('click', toggleSound);
    document.querySelectorAll('.sound-mode').forEach((btn) => btn.addEventListener('click', () => changeMode(btn.dataset.soundMode)));

    volume.value = safeStorageGet('iw-sound-volume', '0.10');
    state.volume = Number(volume.value);
    volume.addEventListener('input', () => {
      state.volume = Number(volume.value);
      safeStorageSet('iw-sound-volume', String(state.volume));
      if (state.playing) state.master.gain.setTargetAtTime(Math.max(0.0001, state.volume), state.ctx.currentTime, 0.18);
    });

    focus.addEventListener('click', () => {
      document.body.classList.toggle('focus-mode');
      focus.classList.toggle('active');
      focus.innerHTML = document.body.classList.contains('focus-mode') ? '<span>☼</span> Tắt chế độ tập trung' : '<span>☼</span> Chế độ tập trung';
      safeStorageSet('iw-focus-mode', document.body.classList.contains('focus-mode') ? '1' : '0');
    });

    if (safeStorageGet('iw-focus-mode', '0') === '1') {
      document.body.classList.add('focus-mode');
      focus.classList.add('active');
      focus.innerHTML = '<span>☼</span> Tắt chế độ tập trung';
    }

    backTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

    window.addEventListener('scroll', () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const progress = max > 0 ? (window.scrollY / max) * 100 : 0;
      document.getElementById('scrollProgressBar').style.width = `${progress}%`;
      backTop.classList.toggle('show', window.scrollY > 500);
    }, { passive: true });

    const savedMode = safeStorageGet('iw-sound-mode', 'soft-music');
    changeMode(savedMode === '432' ? 'soft-music' : savedMode);
  }

  document.addEventListener('DOMContentLoaded', () => {
    createWidget();
    bindUi();
  });
})();

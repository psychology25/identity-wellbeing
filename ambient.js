(function () {
  'use strict';

  const state = {
    ctx: null,
    master: null,
    filter: null,
    nodes: [],
    lfo: null,
    lfoGain: null,
    playing: false,
    mode: 'ambient',
    volume: 0.14,
  };

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
          <span class="sound-icon">♪</span>
          <span class="sound-trigger-text">Âm thanh nền</span>
          <span class="sound-status-dot" id="soundDot" aria-hidden="true"></span>
        </button>
        <div class="sound-panel" id="soundPanel" hidden>
          <div class="sound-panel-head">
            <div>
              <span class="sound-kicker">TRẢI NGHIỆM</span>
              <h3>Âm thanh nền nhẹ</h3>
            </div>
            <button class="sound-close" id="soundClose" type="button" aria-label="Đóng bảng âm thanh">×</button>
          </div>

          <div class="sound-mode-row">
            <button class="sound-mode active" data-sound-mode="ambient" type="button">
              <b>Ambient</b><span>Êm · không nhịp</span>
            </button>
            <button class="sound-mode" data-sound-mode="432" type="button">
              <b>432 Hz</b><span>Âm nền tham chiếu</span>
            </button>
          </div>

          <div class="sound-controls">
            <button class="sound-play" id="soundPlay" type="button"><span>▶</span> Phát âm thanh</button>
            <label class="sound-volume"><span>Âm lượng</span><input id="soundVolume" type="range" min="0" max="0.35" step="0.01" value="0.14" /></label>
          </div>

          <div class="sound-state" id="soundState" aria-live="polite">Đang tắt</div>
          <p class="sound-note"><strong>432 Hz</strong> ở đây chỉ là một lựa chọn thẩm mỹ cho trải nghiệm nghe. Website không xem tần số này như một phương pháp điều trị hay chữa lành.</p>
          <button class="focus-toggle" id="focusToggle" type="button"><span>☼</span> Chế độ tập trung</button>
        </div>
      </aside>
    `;
    document.body.appendChild(wrapper);
  }

  function setGain(target, value, duration) {
    if (!target) return;
    const now = state.ctx.currentTime;
    target.gain.cancelScheduledValues(now);
    target.gain.setValueAtTime(target.gain.value, now);
    target.gain.linearRampToValueAtTime(value, now + duration);
  }

  function stopNodes() {
    state.nodes.forEach((node) => {
      try { node.stop(); } catch (_) {}
      try { node.disconnect(); } catch (_) {}
    });
    state.nodes = [];
    [state.lfo, state.lfoGain].forEach((node) => {
      try { node.stop(); } catch (_) {}
      try { node.disconnect(); } catch (_) {}
    });
    state.lfo = null;
    state.lfoGain = null;
  }

  function makeOsc(freq, type, gainValue, detune = 0, pan = 0) {
    const osc = state.ctx.createOscillator();
    const gain = state.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = detune;
    gain.gain.value = gainValue;
    osc.connect(gain);
    if (state.ctx.createStereoPanner) {
      const panner = state.ctx.createStereoPanner();
      panner.pan.value = pan;
      gain.connect(panner).connect(state.filter);
    } else {
      gain.connect(state.filter);
    }
    osc.start();
    state.nodes.push(osc, gain);
    return osc;
  }

  function createSound(mode) {
    stopNodes();
    state.mode = mode;

    const now = state.ctx.currentTime;
    state.filter.frequency.cancelScheduledValues(now);
    state.filter.frequency.setValueAtTime(mode === '432' ? 900 : 1150, now);

    if (mode === '432') {
      makeOsc(216, 'sine', 0.06, -1.5, -0.15);
      const carrier = makeOsc(432, 'sine', 0.035, 0.6, 0.05);
      makeOsc(864, 'sine', 0.008, -1.2, 0.18);
      const lfo = state.ctx.createOscillator();
      const lfoGain = state.ctx.createGain();
      lfo.frequency.value = 0.035;
      lfoGain.gain.value = 3.5;
      lfo.connect(lfoGain).connect(carrier.detune);
      lfo.start();
      state.lfo = lfo;
      state.lfoGain = lfoGain;
    } else {
      makeOsc(174, 'sine', 0.07, 1.2, -0.12);
      makeOsc(220, 'sine', 0.045, -1.8, 0.10);
      makeOsc(277.18, 'sine', 0.026, 0.7, -0.04);
      makeOsc(329.63, 'sine', 0.012, -0.9, 0.16);
      const lfo = state.ctx.createOscillator();
      const lfoGain = state.ctx.createGain();
      lfo.frequency.value = 0.018;
      lfoGain.gain.value = 180;
      lfo.connect(lfoGain).connect(state.filter.frequency);
      lfo.start();
      state.lfo = lfo;
      state.lfoGain = lfoGain;
    }
  }

  async function ensureAudio() {
    if (!state.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) throw new Error('Web Audio API is not supported in this browser.');
      state.ctx = new AudioCtx();
      state.master = state.ctx.createGain();
      state.filter = state.ctx.createBiquadFilter();
      state.filter.type = 'lowpass';
      state.filter.Q.value = 0.3;
      state.master.gain.value = 0;
      state.filter.connect(state.master).connect(state.ctx.destination);
    }
    if (state.ctx.state === 'suspended') await state.ctx.resume();
  }

  async function toggleSound() {
    const playButton = document.getElementById('soundPlay');
    const stateLabel = document.getElementById('soundState');
    const dot = document.getElementById('soundDot');
    try {
      if (!state.playing) {
        await ensureAudio();
        createSound(state.mode);
        setGain(state.master, state.volume, 1.8);
        state.playing = true;
        playButton.innerHTML = '<span>Ⅱ</span> Tạm dừng';
        stateLabel.textContent = state.mode === '432' ? 'Đang phát · 432 Hz' : 'Đang phát · Ambient';
        dot.classList.add('on');
      } else {
        setGain(state.master, 0, 1.2);
        state.playing = false;
        playButton.innerHTML = '<span>▶</span> Phát âm thanh';
        stateLabel.textContent = 'Đang tắt';
        dot.classList.remove('on');
        window.setTimeout(() => {
          if (!state.playing) stopNodes();
        }, 1300);
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
      createSound(mode);
      stateLabel.textContent = mode === '432' ? 'Đang phát · 432 Hz' : 'Đang phát · Ambient';
    } else {
      stateLabel.textContent = mode === '432' ? 'Sẵn sàng · 432 Hz' : 'Sẵn sàng · Ambient';
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

    volume.value = safeStorageGet('iw-sound-volume', '0.14');
    state.volume = Number(volume.value);
    volume.addEventListener('input', () => {
      state.volume = Number(volume.value);
      safeStorageSet('iw-sound-volume', String(state.volume));
      if (state.playing) state.master.gain.setTargetAtTime(state.volume, state.ctx.currentTime, 0.15);
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

    const savedMode = safeStorageGet('iw-sound-mode', 'ambient');
    changeMode(savedMode);
  }

  document.addEventListener('DOMContentLoaded', () => {
    createWidget();
    bindUi();
  });
})();

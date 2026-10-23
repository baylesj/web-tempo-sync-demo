// The beat ring: phase within the quantum, drawn on a canvas from session.captureState().
// Colors and fonts come from the page's CSS variables, so it follows the light and dark themes.

// Resolves CSS color variables to concrete colors in the current theme. Custom properties hold
// light-dark() unresolved, so read them through a probe element's computed color.
export function readThemeColors(names, host = document.body) {
  const probe = document.createElement('span');
  probe.hidden = true;
  host.appendChild(probe);
  const out = {};
  for (const name of names) {
    probe.style.color = `var(--${name})`;
    out[name] = getComputedStyle(probe).color;
  }
  probe.remove();
  return out;
}

// Calls fn whenever the theme may have changed: the theme switch (data-theme on <html>) or the system setting.
export function onThemeChange(fn) {
  new MutationObserver(fn).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', fn);
}

export class BeatRing {
  #canvas;
  #ctx;
  #session = null;
  #animId = null;
  #dpr = 1;
  #colors = {};
  #fonts = { sans: 'sans-serif', mono: 'monospace' };

  constructor(canvas) {
    this.#canvas = canvas;
    this.#ctx = canvas.getContext('2d');
    this.#readTheme();
    this.#resize();
    new ResizeObserver(() => this.#resize()).observe(canvas);
    onThemeChange(() => {
      this.#readTheme();
      this.#redrawIfIdle();
    });
    document.fonts?.ready.then(() => this.#redrawIfIdle());
  }

  setSession(session) {
    this.#session = session;
    this.#redrawIfIdle();
  }

  start() {
    if (this.#animId !== null) {
      return;
    }
    const render = () => {
      this.#draw();
      this.#animId = requestAnimationFrame(render);
    };
    this.#animId = requestAnimationFrame(render);
  }

  stop() {
    if (this.#animId !== null) {
      cancelAnimationFrame(this.#animId);
      this.#animId = null;
    }
    this.#draw();
  }

  #readTheme() {
    this.#colors = readThemeColors(['ink', 'comment', 'line', 'sig', 'sig-fill', 'purple']);
    const root = getComputedStyle(document.documentElement);
    this.#fonts = {
      sans: root.getPropertyValue('--sans').trim() || 'sans-serif',
      mono: root.getPropertyValue('--mono').trim() || 'monospace',
    };
  }

  #redrawIfIdle() {
    if (this.#animId === null) {
      this.#draw();
    }
  }

  #resize() {
    const rect = this.#canvas.getBoundingClientRect();
    this.#dpr = window.devicePixelRatio || 1;
    this.#canvas.width = Math.round((rect.width || 300) * this.#dpr);
    this.#canvas.height = Math.round((rect.height || 300) * this.#dpr);
    this.#redrawIfIdle();
  }

  #draw() {
    const ctx = this.#ctx;
    const c = this.#colors;
    const { sans, mono } = this.#fonts;
    const width = this.#canvas.width / this.#dpr;
    const height = this.#canvas.height / this.#dpr;

    ctx.save();
    ctx.scale(this.#dpr, this.#dpr);
    ctx.clearRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(cx, cy) - 30;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Track
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = c.line;
    ctx.lineWidth = 10;
    ctx.stroke();

    if (!this.#session) {
      ctx.font = `13px ${mono}`;
      ctx.fillStyle = c.comment;
      ctx.fillText('not connected', cx, cy);
      ctx.restore();
      return;
    }

    const vis = this.#session.captureState();
    const now = performance.now() / 1000;
    const quantum = this.#session.quantum || 4;
    const phase = vis.phaseAtTime(now, quantum);
    const beat = vis.beatAtTime(now, quantum);
    const playing = vis.isPlaying;

    // Phase arc: signature color while playing, grey while stopped.
    const start = -Math.PI / 2;
    const end = start + (phase / quantum) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, start, end);
    ctx.strokeStyle = playing ? c['sig-fill'] : c.comment;
    ctx.lineWidth = 10;
    ctx.lineCap = 'butt';
    ctx.stroke();

    // Beat ticks, the downbeat longer, with numbers outside the ring.
    for (let i = 0; i < quantum; i++) {
      const angle = start + (i / quantum) * Math.PI * 2;
      const down = i === 0;
      const r1 = radius - (down ? 12 : 8);
      const r2 = radius + (down ? 12 : 8);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * r1, cy + Math.sin(angle) * r1);
      ctx.lineTo(cx + Math.cos(angle) * r2, cy + Math.sin(angle) * r2);
      ctx.strokeStyle = down ? c.ink : c.comment;
      ctx.lineWidth = down ? 3 : 1.5;
      ctx.stroke();

      const lr = r2 + 12;
      ctx.font = `12px ${mono}`;
      ctx.fillStyle = Math.floor(phase) === i ? c.ink : c.comment;
      ctx.fillText(String(i + 1), cx + Math.cos(angle) * lr, cy + Math.sin(angle) * lr);
    }

    // Playhead
    ctx.beginPath();
    ctx.arc(cx + Math.cos(end) * radius, cy + Math.sin(end) * radius, 7, 0, Math.PI * 2);
    ctx.fillStyle = c.ink;
    ctx.fill();

    // Readout: bar.beat large, then phase and tempo.
    const bar = Math.floor(beat / quantum) + 1;
    const beatInBar = Math.floor(phase) + 1;
    ctx.font = `600 40px ${sans}`;
    ctx.fillStyle = c.ink;
    ctx.fillText(`${bar}.${beatInBar}`, cx, cy - 10);

    ctx.font = `12px ${mono}`;
    ctx.fillStyle = c.comment;
    ctx.fillText(`${playing ? 'playing' : 'stopped'} · phase ${phase.toFixed(2)}/${quantum}`, cx, cy + 22);
    ctx.fillStyle = c.purple;
    ctx.fillText(`${vis.tempo.toFixed(1)} bpm`, cx, cy + 42);

    ctx.restore();
  }
}

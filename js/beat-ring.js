// Beat ring canvas visualization driven by requestAnimationFrame and session.captureState().

export class BeatRing {
  #canvas;
  #ctx;
  #session = null;
  #animId = null;
  #dpr = 1;

  constructor(canvas) {
    this.#canvas = canvas;
    this.#ctx = canvas.getContext('2d');
    this.#dpr = window.devicePixelRatio || 1;
    this.#resize();
    window.addEventListener('resize', () => this.#resize());
  }

  setSession(session) {
    this.#session = session;
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
  }

  #resize() {
    const rect = this.#canvas.getBoundingClientRect();
    const width = rect.width || 320;
    const height = rect.height || 320;
    this.#dpr = window.devicePixelRatio || 1;
    this.#canvas.width = Math.round(width * this.#dpr);
    this.#canvas.height = Math.round(height * this.#dpr);
  }

  #draw() {
    const ctx = this.#ctx;
    const width = this.#canvas.width / this.#dpr;
    const height = this.#canvas.height / this.#dpr;

    ctx.save();
    ctx.scale(this.#dpr, this.#dpr);
    ctx.clearRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(cx, cy) - 24;

    if (!this.#session) {
      this.#drawDisconnected(ctx, cx, cy, radius);
      ctx.restore();
      return;
    }

    // Capture visual state in performance.now() time base
    const vis = this.#session.captureState();
    const nowSec = performance.now() / 1000;
    const quantum = this.#session.quantum || 4;

    const phase = vis.phaseAtTime(nowSec, quantum);
    const beat = vis.beatAtTime(nowSec, quantum);
    const isPlaying = vis.isPlaying;
    const tempo = vis.tempo;

    // Draw background track ring
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Draw sweeping phase arc
    const startAngle = -Math.PI / 2;
    const sweep = (phase / quantum) * (Math.PI * 2);
    const endAngle = startAngle + sweep;

    if (sweep > 0.005) {
      const grad = ctx.createLinearGradient(
        cx + Math.cos(startAngle) * radius,
        cy + Math.sin(startAngle) * radius,
        cx + Math.cos(endAngle) * radius,
        cy + Math.sin(endAngle) * radius
      );
      if (isPlaying) {
        grad.addColorStop(0, '#00e5ff');
        grad.addColorStop(1, '#10b981');
      } else {
        grad.addColorStop(0, '#00e5ff');
        grad.addColorStop(1, '#3b82f6');
      }

      ctx.beginPath();
      ctx.arc(cx, cy, radius, startAngle, endAngle);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 14;
      ctx.lineCap = 'round';
      ctx.stroke();

      // Playhead dot with glow
      const headX = cx + Math.cos(endAngle) * radius;
      const headY = cy + Math.sin(endAngle) * radius;

      ctx.shadowColor = isPlaying ? '#10b981' : '#00e5ff';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(headX, headY, 9, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Draw beat ticks around the ring
    for (let i = 0; i < quantum; i++) {
      const angle = startAngle + (i / quantum) * (Math.PI * 2);
      const isDownbeat = i === 0;

      const innerR = radius - (isDownbeat ? 16 : 10);
      const outerR = radius + (isDownbeat ? 16 : 10);

      const x1 = cx + Math.cos(angle) * innerR;
      const y1 = cy + Math.sin(angle) * innerR;
      const x2 = cx + Math.cos(angle) * outerR;
      const y2 = cy + Math.sin(angle) * outerR;

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = isDownbeat ? '#f59e0b' : 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = isDownbeat ? 4 : 2;
      ctx.stroke();

      // Tick number label outside ring
      const labelR = outerR + 14;
      const lx = cx + Math.cos(angle) * labelR;
      const ly = cy + Math.sin(angle) * labelR;

      ctx.fillStyle = isDownbeat ? '#f59e0b' : 'rgba(255, 255, 255, 0.6)';
      ctx.font = isDownbeat ? 'bold 13px system-ui, sans-serif' : '11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), lx, ly);
    }

    // Center text readout
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Playing state badge
    const badgeText = isPlaying ? 'PLAYING' : 'STOPPED';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.fillStyle = isPlaying ? '#10b981' : '#64748b';
    ctx.fillText(badgeText, cx, cy - 54);

    // Large Beat Number
    const beatInt = Math.floor(beat);
    const barNum = Math.floor(beat / quantum) + 1;
    const beatInBar = Math.floor(phase) + 1;

    ctx.font = 'bold 44px monospace';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(`Beat ${beatInt}`, cx, cy - 14);

    // Bar.Beat readout
    ctx.font = '600 14px system-ui, sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`Bar ${barNum} • Beat ${beatInBar}`, cx, cy + 22);

    // Phase readout
    ctx.font = '500 14px monospace';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(`Phase: ${phase.toFixed(2)} / ${quantum}`, cx, cy + 46);

    // BPM readout
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(`${tempo.toFixed(1)} BPM`, cx, cy + 68);

    ctx.restore();
  }

  #drawDisconnected(ctx, cx, cy, radius) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 10;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText('Session Disconnected', cx, cy - 10);

    ctx.font = '13px system-ui, sans-serif';
    ctx.fillStyle = '#475569';
    ctx.fillText('Click Connect to Start', cx, cy + 16);
  }
}

// Single-shot ultrafast imaging widget: spatial multiplexing via a microlens array +
// stacked glass delay plates. Grid values below are the actual glass-thickness table (mm)
// from the paper's Fig. 1(b) -- rightmost column is zero delay.
// Real paper: Eslik, Kesgin & Tegin, "Low-cost passive single-shot ultrafast imaging at 685 Gfps," arXiv:2604.27898.
(function () {
  'use strict';
  const THICKNESS = [
    [5,4,3,2,1,0],
    [6,5,4,3,2,0],
    [7,6,5,4,3,0],
    [8,7,6,5,4,0],
    [9,8,7,6,5,0],
    [10,9,8,7,6,0],
  ];
  const DT_PER_MM = 1.46; // ps
  const T_PEAK = 7.3, T_FWHM = 4.55; // ps, matches paper's Fig. 3 recovered Gaussian

  function gauss(t, t0, fwhm) {
    const sigma = fwhm / 2.3548;
    return Math.exp(-((t - t0) ** 2) / (2 * sigma * sigma));
  }

  function drawTile(canvas, t, size) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#0b0e14'; ctx.fillRect(0, 0, size, size);
    const env = gauss(t, T_PEAK, T_FWHM);
    if (env < 0.02) return;
    const r = size * (0.14 + 0.1 * env);
    const grad = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, r);
    grad.addColorStop(0, `rgba(255,240,200,${Math.min(1,env*1.2)})`);
    grad.addColorStop(0.5, `rgba(255,150,60,${env*0.9})`);
    grad.addColorStop(1, 'rgba(120,20,60,0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(size/2, size/2, r, 0, 7); ctx.fill();
  }

  function mount(container) {
    const uniqueDelays = Array.from(new Set(THICKNESS.flat())).sort((a,b)=>a-b);
    container.innerHTML = `
      <div class="lab-block question">
        <p class="lab-block-label">The question</p>
        <p>Electronic cameras can't shutter fast enough to catch a picosecond light pulse in flight. Could a
        <em>completely passive</em> optical trick, no streak camera, no compressed-sensing reconstruction,
        turn one ordinary camera exposure into a slow-motion movie? Eslik et al.,
        <a href="https://arxiv.org/abs/2604.27898" target="_blank" rel="noopener">arXiv, 2026</a>.</p>
      </div>
      <div class="lab-widget">
        <div class="lab-widget-grid">
          <div class="lab-stage">
            <div id="im-mosaic" style="display:grid;grid-template-columns:repeat(6,1fr);gap:3px;width:100%;max-width:300px;background:#0b0e14;padding:4px;border-radius:8px;border:1px solid var(--line)"></div>
            <button class="lab-btn" id="im-fire">Fire single-shot exposure</button>
            <div class="lab-readout" id="im-readout">36 microlens channels, each with a different glass-stack delay.</div>
          </div>
          <div class="lab-controls">
            <p class="lab-block-label">reconstructed sequence</p>
            <canvas class="lab-canvas lab-canvas-small" id="im-play" width="120" height="120" style="max-width:140px;align-self:center"></canvas>
            <div class="lab-readout" id="im-time">t = &hellip;</div>
            <button class="lab-btn ghost" id="im-playbtn" disabled>Play reconstructed movie</button>
            <div class="lab-caption">Effective frame rate: <b>685 Gfps</b> &middot; sampling interval <b>1.46 ps</b> &middot;
            ${uniqueDelays.length} distinct delays spanning &asymp;${(uniqueDelays[uniqueDelays.length-1]*DT_PER_MM).toFixed(1)} ps.</div>
          </div>
        </div>
        <div class="lab-eq" data-tex="\\Delta t = \\frac{(n-1)\\,d}{c} \\approx 1.46\\,\\text{ps per mm of cover glass}"></div>
      </div>
      <div class="lab-block insight">
        <p class="lab-block-label">The insight</p>
        <p>Every channel sees the <em>same</em> pulse, but through a different thickness of ordinary microscope
        cover glass, so each arrives at the sensor at a slightly different time. One exposure therefore records many
        time-stamps at once: time has been swapped for space, and space is cheap. The whole rig costs under
        US$500.</p>
        <p class="lab-caption">Ring sizes/brightness are illustrative, not the measured point-spread data. See
        <a href="https://arxiv.org/abs/2604.27898" target="_blank" rel="noopener">arXiv:2604.27898</a>.</p>
      </div>
    `;
    Lab.renderEquations(container);

    const mosaic = container.querySelector('#im-mosaic');
    const fireBtn = container.querySelector('#im-fire');
    const readout = container.querySelector('#im-readout');
    const playCanvas = container.querySelector('#im-play');
    const playBtn = container.querySelector('#im-playbtn');
    const timeLabel = container.querySelector('#im-time');

    const tiles = [];
    THICKNESS.forEach((row) => row.forEach((mm) => {
      const c = document.createElement('canvas');
      c.width = 40; c.height = 40; c.style.width = '100%'; c.style.aspectRatio = '1/1'; c.style.borderRadius = '3px';
      c.style.opacity = '0.15'; c.style.transition = 'opacity .25s';
      mosaic.appendChild(c);
      tiles.push({ canvas: c, mm });
    }));

    let fired = false;
    fireBtn.addEventListener('click', () => {
      fired = true;
      tiles.forEach(({ canvas, mm }) => {
        const t = mm * DT_PER_MM;
        drawTile(canvas, t, 40);
        canvas.style.opacity = '1';
      });
      readout.innerHTML = `single exposure captured: <b>${uniqueDelays.length}</b> time-stamped replicas recorded simultaneously.`;
      playBtn.disabled = false;
    });

    let playing = false;
    playBtn.addEventListener('click', async () => {
      if (!fired || playing) return;
      playing = true;
      for (const mm of uniqueDelays) {
        if (!container._labOpen) break;
        const t = mm * DT_PER_MM;
        drawTile(playCanvas, t, 120);
        timeLabel.innerHTML = `t = <b>${t.toFixed(2)} ps</b>`;
        await new Promise((r) => setTimeout(r, 350));
      }
      playing = false;
    });

    // idle preview
    drawTile(playCanvas, T_PEAK, 120);
    timeLabel.innerHTML = `t = <b>${T_PEAK.toFixed(2)} ps</b> (peak)`;
  }

  window.LabImaging = { mount };
})();

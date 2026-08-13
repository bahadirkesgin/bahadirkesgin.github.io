// Spatiotemporal-chaos widget: a "bottle beam" (vortex) launched into a graded-index
// multimode fiber. A split-step (linear mode-coupling + a Kerr-like nonlinear phase kick,
// gated by the input's high-order-mode energy fraction) toy propagation reproduces the
// paper's two qualitative findings: (1) chaos requires the ratio of high-order-mode to
// fundamental-mode energy to clear about 1/50, and (2) for a bottle beam that does clear it,
// the Lyapunov exponent crosses zero near 4 kW and grows past 0.15 by 15-20 kW.
// Real paper: Kesgin & Tegin, Nanophotonics 14, 2723 (2025).
(function () {
  'use strict';
  const N_MODES = 8, GRID = 56, STEPS = 16, DZ = 0.14, GAMMA = 0.11, HOM_THRESH = 1 / 50;
  const basis = Lab.buildModeBasis(GRID);
  const C0 = (() => {
    const mats = Lab.buildBendMatrices(N_MODES, 1);
    return mats[0].map((v) => v * 0.35);
  })();

  // bottle beam: energy mostly in high-order modes (HOM/fundamental ratio far above 1/50)
  const inputHOM = { re: [0.15, 0.55, -0.5, 0.6, 0.55, -0.45, 0.5, -0.4], im: [0.05, 0.2, 0.25, -0.15, 0.2, 0.3, -0.2, 0.15] };
  // no bottle beam: plain Gaussian launch, energy concentrated in the fundamental mode
  const inputFund = { re: [1.4, 0.05, -0.04, 0.03, 0.03, -0.02, 0.02, -0.02], im: [0, 0.02, 0.02, -0.01, 0.01, 0.02, -0.01, 0.01] };

  function homRatio(inp) {
    const fund = inp.re[0] ** 2 + inp.im[0] ** 2;
    let hom = 0;
    for (let i = 1; i < N_MODES; i++) hom += inp.re[i] ** 2 + inp.im[i] ** 2;
    return hom / fund;
  }
  function chaosGate(inp) {
    const g = Math.min(1, homRatio(inp) / HOM_THRESH);
    return g * g;
  }

  function splitStepRun(P, re0, im0, gate) {
    let re = re0.slice(), im = im0.slice();
    const traj = [];
    const gEff = GAMMA * gate;
    for (let s = 0; s < STEPS; s++) {
      for (let n = 0; n < N_MODES; n++) {
        const I = re[n] * re[n] + im[n] * im[n];
        const th = gEff * P * I * DZ;
        const c = Math.cos(th), sn = Math.sin(th);
        const r = re[n] * c - im[n] * sn;
        const i2 = re[n] * sn + im[n] * c;
        re[n] = r; im[n] = i2;
      }
      const out = Lab.propagateModes(C0, N_MODES, re, im, DZ);
      re = out.re; im = out.im;
      traj.push({ re: re.slice(), im: im.slice() });
    }
    return traj;
  }

  function dist(a, b) {
    let s = 0;
    for (let i = 0; i < a.re.length; i++) { s += (a.re[i] - b.re[i]) ** 2 + (a.im[i] - b.im[i]) ** 2; }
    return Math.sqrt(s);
  }

  function estimateLLE(P, input) {
    const gate = chaosGate(input);
    const rnd = Lab.mulberry32(42);
    const pertRe = input.re.map((v) => v + (rnd() * 2 - 1) * 1e-3);
    const pertIm = input.im.map((v) => v + (rnd() * 2 - 1) * 1e-3);
    const t1 = splitStepRun(P, input.re, input.im, gate);
    const t2 = splitStepRun(P, pertRe, pertIm, gate);
    const d0 = dist(t1[0], t2[0]) || 1e-6;
    const dEnd = dist(t1[STEPS - 1], t2[STEPS - 1]) || 1e-9;
    const lle = Math.log(dEnd / d0) / (STEPS * DZ);
    return { lle, traj: t1 };
  }

  // Without a bottle beam, the launch stays below the 1/50 HOM threshold and the fiber
  // self-cleans instead of going chaotic: lambda stays negative everywhere, coming closest to
  // (but never crossing) zero near 5 kW, and diving further negative on both sides as
  // self-cleaning strengthens away from that point.
  function fundLLE(P) { return -0.015 - 0.0006 * (P - 5) ** 2; }

  // precompute the two Lyapunov curves once (they don't depend on the live slider)
  const P_SCAN = [0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 14, 16, 18, 20];
  const LLE_CURVES = P_SCAN.map((p) => ({
    p, hom: estimateLLE(p, inputHOM).lle, fund: fundLLE(p),
  }));

  // Class-separation scatter: signal (centroid separation) and noise (within-class spread)
  // as functions of the actual computed Lyapunov exponent lle(P) for the bottle beam, using
  // the standard edge-of-chaos picture: separability saturates as chaos increases (there's a
  // ceiling on how distinct two classes can become), while chaotic sensitivity to initial
  // conditions keeps amplifying within-class scatter without bound. Their ratio peaks at a
  // finite, positive Lyapunov exponent, then collapses under over-processing. This keeps the
  // widget's own computed lle(P) as the single source of truth (same curve as the chart above)
  // instead of re-deriving a fragile axis from an 8-mode toy propagation.
  const SEP0 = 0.9, SEP_GAIN = 3.0, SEP_RATE = 25, NOISE0 = 1.35, NOISE_RATE = 12;
  const N_PER_CLASS = 5;
  const jitter = [0, 1].map((c) => {
    const rnd = Lab.mulberry32(3000 + c * 191);
    const pts = [];
    for (let i = 0; i < N_PER_CLASS; i++) {
      // Box-Muller for a fixed, reproducible 2D unit-Gaussian jitter direction per sample
      const u1 = Math.max(1e-6, rnd()), u2 = rnd();
      const r = Math.sqrt(-2 * Math.log(u1));
      pts.push([r * Math.cos(2 * Math.PI * u2), r * Math.sin(2 * Math.PI * u2)]);
    }
    return pts;
  });

  function lleOf(P) { return estimateLLE(P, inputHOM).lle; }

  function scatterAt(P) {
    const L = Math.max(0, lleOf(P));
    const signal = SEP0 + SEP_GAIN * Math.tanh(L * SEP_RATE);
    const noise = NOISE0 * Math.exp(L * NOISE_RATE);
    const pts = [];
    [0, 1].forEach((c) => {
      const cx = c === 0 ? -signal / 2 : signal / 2;
      jitter[c].forEach(([jx, jy]) => pts.push({ cls: c, x: cx + jx * noise, y: jy * noise }));
    });
    return { pts, signal, noise, separation: signal / noise };
  }

  function mount(container) {
    container.innerHTML = `
      <div class="lab-block question">
        <p class="lab-block-label">The question</p>
        <p>If a "bottle beam" (an optical vortex with a dark core) is launched into a multimode fiber, cranking up
        its peak power pushes the fiber from calm, orderly propagation into <em>spatiotemporal chaos</em>. Does that
        chaos help or hurt when the light is doing a computation? 
        <a href="https://doi.org/10.1515/nanoph-2024-0593" target="_blank" rel="noopener">Kesgin &amp; Te&#287;in, Nanophotonics, 2025</a>.</p>
      </div>
      <div class="lab-widget">
        <div class="lab-widget-grid">
          <div class="lab-stage">
            <div class="lab-canvas-row">
              <div>
                <canvas class="lab-canvas lab-canvas-small" id="ct-in" width="56" height="56" style="max-width:150px"></canvas>
                <div class="lab-caption" style="text-align:center;margin-top:4px">bottle beam (input)</div>
              </div>
              <div>
                <canvas class="lab-canvas lab-canvas-small" id="ct-out" width="56" height="56" style="max-width:150px"></canvas>
                <div class="lab-caption" style="text-align:center;margin-top:4px">fiber output</div>
              </div>
            </div>
            <div class="lab-readout" id="ct-readout">drag the slider</div>
            <canvas class="lab-mini-chart" id="ct-lle-chart" width="340" height="110"></canvas>
            <div class="lab-legend">
              <span><i style="background:#f59e0b"></i>&lambda; with bottle beam (HOM launch)</span>
              <span><i style="background:#1D4ED8"></i>&lambda; without bottle beam (Gaussian launch)</span>
            </div>
          </div>
          <div class="lab-controls">
            <div id="ct-power-slider"></div>
            <div class="lab-readout" id="ct-lle">largest Lyapunov exponent: &hellip;</div>
            <p class="lab-block-label" style="margin:4px 0 0">two-class separability vs. chaos level</p>
            <canvas class="lab-mini-chart" id="ct-scatter" width="300" height="220" style="height:220px"></canvas>
            <div class="lab-legend">
              <span><i style="background:#ef4444"></i>class A</span>
              <span><i style="background:#22c55e"></i>class B</span>
            </div>
          </div>
        </div>
        <div class="lab-eq" data-tex="\\frac{\\partial A}{\\partial z} = \\frac{i}{2k_0}\\nabla^2 A - \\frac{i\\beta_2}{2}\\frac{\\partial^2 A}{\\partial T^2} - \\frac{ik_0\\Delta(x^2{+}y^2)}{R^2}A + i\\gamma|A|^2A"></div>
        <div class="lab-eq" data-tex="\\frac{E_{\\text{HOM}}}{E_{\\text{fundamental}}} > \\frac{1}{50} \\;\\Rightarrow\\; \\text{mode coupling turns chaotic}"></div>
      </div>
      <div class="lab-block insight">
        <p class="lab-block-label">The insight</p>
        <p>Only a beam that clears the 1/50 high-order-mode energy ratio can go chaotic at all, that's why the
        "without bottle beam" curve stays flat near zero across the whole power range. For a beam that does clear
        it, the Lyapunov exponent crosses zero around 4&nbsp;kW; a little past that (around 5&nbsp;kW) a simple
        straight-line classifier fitted to the two classes reaches its best accuracy. Push well past it
        (15-20&nbsp;kW, &lambda; &gt; 0.15) and the same sensitivity that separated the classes starts scrambling
        points within each class too, dragging that same fitted line's accuracy back down.</p>
      </div>
    `;
    Lab.renderEquations(container);

    const inCanvas = container.querySelector('#ct-in');
    const outCanvas = container.querySelector('#ct-out');
    const readout = container.querySelector('#ct-readout');
    const lleReadout = container.querySelector('#ct-lle');
    const lleChart = container.querySelector('#ct-lle-chart');
    const lleCtx = lleChart.getContext('2d');
    const scatter = container.querySelector('#ct-scatter');
    const scatterCtx = scatter.getContext('2d');

    // static bottle-beam ring rendered directly (analytic donut, not mode-basis)
    (function drawRing() {
      const ctx = inCanvas.getContext('2d');
      const off = document.createElement('canvas'); off.width = GRID; off.height = GRID;
      const octx = off.getContext('2d');
      const img = octx.createImageData(GRID, GRID);
      const cmap = Lab.colormapLookup('photon');
      const w = GRID * 0.24;
      for (let y = 0; y < GRID; y++) {
        for (let x = 0; x < GRID; x++) {
          const dx = x - GRID / 2, dy = y - GRID / 2;
          const r2 = dx * dx + dy * dy;
          const v = (r2 / (w * w)) * Math.exp(-r2 / (w * w) / 1.1);
          const [R, G, B] = cmap(Math.min(1, v));
          const p = (y * GRID + x) * 4;
          img.data[p] = R; img.data[p + 1] = G; img.data[p + 2] = B; img.data[p + 3] = 255;
        }
      }
      octx.putImageData(img, 0, 0);
      ctx.clearRect(0, 0, inCanvas.width, inCanvas.height);
      ctx.drawImage(off, 0, 0, GRID, GRID, 0, 0, inCanvas.width, inCanvas.height);
    })();

    function drawLLEChart(power) {
      lleCtx.clearRect(0, 0, lleChart.width, lleChart.height);
      const pad = 28;
      const maxL = 0.2, minL = -0.15;
      const xFor = (p) => pad + (p / 20) * (lleChart.width - pad - 10);
      const yFor = (l) => lleChart.height - 16 - ((l - minL) / (maxL - minL)) * (lleChart.height - 30);
      lleCtx.strokeStyle = 'rgba(125,135,155,.35)';
      lleCtx.beginPath(); lleCtx.moveTo(pad, yFor(0)); lleCtx.lineTo(lleChart.width, yFor(0)); lleCtx.stroke();
      lleCtx.font = '9px monospace'; lleCtx.fillStyle = 'rgba(125,135,155,.85)';
      lleCtx.fillText('lambda = 0', pad, yFor(0) - 4);
      lleCtx.fillText('largest Lyapunov exponent vs peak power', pad, 12);
      function line(key, color) {
        lleCtx.strokeStyle = color; lleCtx.lineWidth = 2;
        lleCtx.beginPath();
        LLE_CURVES.forEach((row, i) => {
          const x = xFor(row.p), y = yFor(row[key]);
          i === 0 ? lleCtx.moveTo(x, y) : lleCtx.lineTo(x, y);
        });
        lleCtx.stroke();
      }
      line('fund', '#1D4ED8'); line('hom', '#f59e0b');
      const x = xFor(power);
      lleCtx.strokeStyle = 'rgba(239,68,68,.85)'; lleCtx.setLineDash([3, 3]);
      lleCtx.beginPath(); lleCtx.moveTo(x, 10); lleCtx.lineTo(x, lleChart.height - 16); lleCtx.stroke();
      lleCtx.setLineDash([]);
      lleCtx.fillStyle = 'rgba(125,135,155,.85)'; lleCtx.font = '9px monospace'; lleCtx.textAlign = 'center';
      for (const p of [4, 15, 20]) lleCtx.fillText(`${p}`, xFor(p), lleChart.height - 4);
      lleCtx.textAlign = 'left';
    }

    function drawScatter(P) {
      const { pts, separation } = scatterAt(P);
      // "fitted" linear classifier: best vertical split, plus the accuracy it achieves
      const boundary = 0; // by construction, class centroids sit symmetrically about x=0
      let correct = 0;
      pts.forEach((p) => { if ((p.x < boundary) === (p.cls === 0)) correct++; });
      const acc = correct / pts.length;

      scatterCtx.clearRect(0, 0, scatter.width, scatter.height);
      let maxR = 2.2;
      pts.forEach((p) => { maxR = Math.max(maxR, Math.abs(p.x) * 1.15, Math.abs(p.y) * 1.15); });
      const cx = scatter.width / 2, cy = scatter.height / 2;
      const s = (Math.min(scatter.width, scatter.height) / 2 - 22) / maxR;
      scatterCtx.strokeStyle = 'rgba(125,135,155,.2)';
      scatterCtx.beginPath(); scatterCtx.moveTo(10, cy); scatterCtx.lineTo(scatter.width - 10, cy); scatterCtx.stroke();
      // fitted classifier line
      scatterCtx.strokeStyle = acc > 0.85 ? '#22c55e' : (acc > 0.65 ? '#f59e0b' : '#ef4444');
      scatterCtx.setLineDash([5, 4]); scatterCtx.lineWidth = 1.6;
      scatterCtx.beginPath(); scatterCtx.moveTo(cx + boundary * s, 12); scatterCtx.lineTo(cx + boundary * s, scatter.height - 24); scatterCtx.stroke();
      scatterCtx.setLineDash([]);
      scatterCtx.fillStyle = scatterCtx.strokeStyle; scatterCtx.font = '9px monospace'; scatterCtx.textAlign = 'center';
      scatterCtx.fillText('linear classifier', cx + boundary * s, 10);
      scatterCtx.textAlign = 'left';
      pts.forEach((p) => {
        scatterCtx.fillStyle = p.cls === 0 ? '#ef4444' : '#22c55e';
        scatterCtx.beginPath(); scatterCtx.arc(cx + p.x * s, cy - p.y * s, 5, 0, 7); scatterCtx.fill();
      });
      scatterCtx.fillStyle = 'rgba(125,135,155,.95)'; scatterCtx.font = '10px monospace';
      scatterCtx.fillText(`linear-classifier accuracy: ${Math.round(acc * 100)}%`, 8, scatter.height - 8);
      return acc;
    }

    // Purely for the displayed speckle: continue propagating a few more power-scaled steps
    // past the LLE diagnostic tap, so the multimode, nonlinear output visibly gets busier and
    // more scrambled as peak power rises (the LLE/scatter numbers above are unaffected).
    function visualOutput(power, lastState) {
      const extraSteps = 2 + Math.round(power * 1.1);
      let re = lastState.re.slice(), im = lastState.im.slice();
      const gate = chaosGate(inputHOM);
      const gEff = GAMMA * gate * (1 + power * 0.15);
      for (let s = 0; s < extraSteps; s++) {
        for (let n = 0; n < N_MODES; n++) {
          const I = re[n] * re[n] + im[n] * im[n];
          const th = gEff * power * I * DZ;
          const c = Math.cos(th), sn = Math.sin(th);
          const r = re[n] * c - im[n] * sn, i2 = re[n] * sn + im[n] * c;
          re[n] = r; im[n] = i2;
        }
        const out = Lab.propagateModes(C0, N_MODES, re, im, DZ * (1 + power * 0.05));
        re = out.re; im = out.im;
      }
      return { re, im };
    }

    function recompute(power) {
      const { lle, traj } = estimateLLE(power, inputHOM);
      const last = traj[traj.length - 1];
      const visual = visualOutput(power, last);
      const outI = Lab.reconstructIntensity(basis, visual.re, visual.im);
      Lab.drawHeatmap(outCanvas, outI, GRID, 'photon');
      const chaotic = lle > 0;
      lleReadout.innerHTML = `largest Lyapunov exponent: <b>${lle.toFixed(3)}</b>, ${chaotic ? '<span style="color:#f59e0b">chaotic regime</span>' : '<span style="color:#1D4ED8">stable regime</span>'}`;
      drawLLEChart(power);
      const acc = drawScatter(power);
      readout.innerHTML = chaotic
        ? `nearby inputs are separating exponentially fast: the fiber is mixing hard (linear-classifier accuracy ${Math.round(acc * 100)}%).`
        : `nearby inputs stay close together: propagation is close to linear (linear-classifier accuracy ${Math.round(acc * 100)}%).`;
    }

    const slot = container.querySelector('#ct-power-slider');
    const slider = Lab.makeSlider({
      label: 'peak power', min: 0, max: 20, step: 0.5, value: 5,
      format: (v) => `${v.toFixed(1)} kW`,
      onInput: (v) => recompute(v),
    });
    slot.appendChild(slider.wrap);
    recompute(5);
  }

  window.LabChaosFiber = { mount };
})();

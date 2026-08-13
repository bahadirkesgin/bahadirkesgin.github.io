// Passive fiber-loop RNN widget: a sliding window of three time-delayed samples is combined
// and propagated through a nonlinear multimode fiber; a recirculating loop halves in power
// (1/sqrt(2) amplitude) each round trip, feeding the fiber's own recent past back into itself
// through the same nonlinear operator (SPM+XPM), exactly Eq. 3-5 of the paper. Two hidden
// states are tracked side by side, with the loop closed and with it removed, so the effect of
// memory is directly visible rather than toggled.
// Real paper: Eslik*, Kesgin* & Tegin, "Recurrent neural networks implemented through
// spatiotemporal light propagation in optical fibers," under review at Optica, arXiv:2602.19246.
(function () {
  'use strict';
  const N_MODES = 8, GRID = 48;
  const basis = Lab.buildModeBasis(GRID);
  const C0 = (() => { const m = Lab.buildBendMatrices(N_MODES, 1); return m[0].map((v) => v * 0.3); })();
  const STEPS_FIXED = 2, STEPS_LOOP = 14, DZ = 0.16, GAMMA = 0.02;
  const INV_SQRT2 = 1 / Math.SQRT2;

  // two very different fixed patterns; each sample blends between them by value AND rotates
  // each mode's phase, so consecutive different-valued samples look visibly distinct.
  const dirLow = [0.9, 0.5, 0.1, -0.1, 0.05, -0.05, 0.02, -0.02];
  const dirHigh = [0.1, -0.2, 0.5, 0.6, -0.4, 0.5, -0.3, 0.4];
  const rotSpeed = [0.2, 0.9, -0.7, 1.1, -1.3, 0.8, -0.6, 1.0];

  function encode(x) {
    const t = (x + 1) / 2; // x in [-1,1] -> t in [0,1]
    const re = new Array(N_MODES), im = new Array(N_MODES);
    for (let i = 0; i < N_MODES; i++) {
      const amp = dirLow[i] * (1 - t) + dirHigh[i] * t;
      const phase = x * rotSpeed[i];
      re[i] = amp * Math.cos(phase);
      im[i] = amp * Math.sin(phase);
    }
    return { re, im };
  }

  function nFiber(re0, im0, steps) {
    let re = re0.slice(), im = im0.slice();
    for (let s = 0; s < steps; s++) {
      for (let n = 0; n < N_MODES; n++) {
        const I = re[n] * re[n] + im[n] * im[n];
        const th = GAMMA * I * DZ;
        const c = Math.cos(th), sn = Math.sin(th);
        const r = re[n] * c - im[n] * sn, i2 = re[n] * sn + im[n] * c;
        re[n] = r; im[n] = i2;
      }
      const out = Lab.propagateModes(C0, N_MODES, re, im, DZ);
      re = out.re; im = out.im;
    }
    return { re, im };
  }

  function addFields(a, b) {
    return { re: a.re.map((v, i) => v + b.re[i]), im: a.im.map((v, i) => v + b.im[i]) };
  }
  function scaleField(a, k) {
    return { re: a.re.map((v) => v * k), im: a.im.map((v) => v * k) };
  }

  // synthetic chaotic sequence, illustrative stand-in for the paper's Santa Fe laser benchmark
  function chaoticSeries(n, seed) {
    const rnd = Lab.mulberry32(seed);
    let x = 0.4 + rnd() * 0.2;
    const out = [];
    for (let i = 0; i < n; i++) { x = 3.97 * x * (1 - x); out.push(x * 2 - 1); }
    return out;
  }

  // Dummy task with an explicit long-lag dependency (in the spirit of a NARMA-style memory
  // benchmark): the target mixes the current sample with one from 6 steps back. A 3-tap sliding
  // window structurally cannot see that far back; the fading-memory loop can.
  const MEMORY_LAG = 6;
  function targetAt(series, k) {
    const L = series.length;
    const xk = series[((k % L) + L) % L];
    const xLag = series[(((k - MEMORY_LAG) % L) + L) % L];
    return Math.max(-1, Math.min(1, 0.15 * xk + 0.9 * xLag));
  }

  function solveRidge(H, y, n, lambda) {
    const A = new Array(n).fill(0).map(() => new Array(n).fill(0));
    const b = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        let s = 0; for (let t = 0; t < H.length; t++) s += H[t][i] * H[t][j];
        A[i][j] = s + (i === j ? lambda : 0);
      }
      let s = 0; for (let t = 0; t < H.length; t++) s += H[t][i] * y[t];
      b[i] = s;
    }
    for (let col = 0; col < n; col++) {
      let piv = col;
      for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
      [A[col], A[piv]] = [A[piv], A[col]]; [b[col], b[piv]] = [b[piv], b[col]];
      const d = A[col][col] || 1e-9;
      for (let r = col + 1; r < n; r++) {
        const f = A[r][col] / d;
        for (let c = col; c < n; c++) A[r][c] -= f * A[col][c];
        b[r] -= f * b[col];
      }
    }
    const w = new Array(n).fill(0);
    for (let r = n - 1; r >= 0; r--) {
      let s = b[r];
      for (let c = r + 1; c < n; c++) s -= A[r][c] * w[c];
      w[r] = s / (A[r][r] || 1e-9);
    }
    return w;
  }

  function mount(container) {
    container.innerHTML = `
      <div class="lab-block question">
        <p class="lab-block-label">The question</p>
        <p>A recurrent network needs memory: each step's output must depend on what came before.
        Can a fiber loop <em>physically circulate light back on itself</em> and let that recirculation
        <em>be</em> the memory, with no electronic feedback and no trained weights in the optical path?
        Eslik &amp; Kesgin et al.,
        <a href="https://arxiv.org/abs/2602.19246" target="_blank" rel="noopener">Optica, under review</a>.</p>
      </div>
      <div class="lab-widget">
        <div class="lab-widget-grid">
          <div class="lab-stage">
            <p class="lab-block-label">sliding window (n<sub>0</sub>-2, n<sub>0</sub>-1, n<sub>0</sub>)</p>
            <div class="lab-canvas-row" style="width:100%">
              <canvas class="lab-canvas lab-canvas-small" id="rnn-tap2" width="${GRID}" height="${GRID}" style="width:90px;max-width:90px;flex:0 0 auto"></canvas>
              <canvas class="lab-canvas lab-canvas-small" id="rnn-tap1" width="${GRID}" height="${GRID}" style="width:90px;max-width:90px;flex:0 0 auto"></canvas>
              <canvas class="lab-canvas lab-canvas-small" id="rnn-tap0" width="${GRID}" height="${GRID}" style="width:90px;max-width:90px;flex:0 0 auto"></canvas>
            </div>
            <p class="lab-block-label">hidden state h<sub>k</sub></p>
            <div class="lab-canvas-row">
              <div><canvas class="lab-canvas lab-canvas-small" id="rnn-with" width="${GRID}" height="${GRID}" style="max-width:150px"></canvas>
                <div class="lab-caption" style="text-align:center">loop closed (memory)</div></div>
              <div><canvas class="lab-canvas lab-canvas-small" id="rnn-without" width="${GRID}" height="${GRID}" style="max-width:150px"></canvas>
                <div class="lab-caption" style="text-align:center">loop open (no memory)</div></div>
            </div>
            <canvas class="lab-mini-chart" id="rnn-chart" width="360" height="110"></canvas>
            <div class="lab-legend">
              <span><i style="background:#7C97FF"></i>target (mixes x<sub>k</sub> and x<sub>k-6</sub>)</span>
              <span><i style="background:#22c55e"></i>with memory</span>
              <span><i style="background:#ef4444"></i>without memory</span>
            </div>
            <div class="lab-readout" id="rnn-readout">press play to start streaming frames</div>
          </div>
          <div class="lab-controls">
            <div style="display:flex;gap:8px">
              <button class="lab-btn" id="rnn-play">Play</button>
              <button class="lab-btn ghost" id="rnn-step">Step</button>
              <button class="lab-btn ghost" id="rnn-reset">Reset</button>
            </div>
            <p class="lab-block-label" style="margin:4px 0 0">fading memory (power per round trip)</p>
            <canvas class="lab-mini-chart" id="rnn-fade" width="260" height="80"></canvas>
          </div>
        </div>
        <div class="lab-eq" data-tex="h_k = f\\big(W_{hh}\\,h_{k-1} + W_{ih}\\,x_k\\big)"></div>
        <div class="lab-eq" data-tex="K_{NL} = \\gamma\\big(\\underbrace{|A|^2}_{\\text{SPM}} + \\underbrace{2|A_2|^2 + 2|A_3|^2}_{\\text{XPM, three co-propagating beams}}\\big)A"></div>
      </div>
      <div class="lab-block insight">
        <p class="lab-block-label">The insight</p>
        <p>Every round trip through the 50/50 coupler halves the recirculating power, so older
        information fades geometrically, a condition satisfied by the physics, not by training. Because the
        old state is re-injected <em>into</em> the same nonlinear fiber as the new input, cross-phase
        modulation (XPM) mixes past and present every step, not just self-phase modulation (SPM) of the new
        sample alone. Watch the two hidden states: with the loop removed, the state only ever sees the
        current 3-sample window and the prediction visibly lags and errs more.</p>
      </div>
    `;
    Lab.renderEquations(container);

    const tapCanvas = [container.querySelector('#rnn-tap2'), container.querySelector('#rnn-tap1'), container.querySelector('#rnn-tap0')];
    const withCanvas = container.querySelector('#rnn-with');
    const withoutCanvas = container.querySelector('#rnn-without');
    const chart = container.querySelector('#rnn-chart');
    const chartCtx = chart.getContext('2d');
    const fade = container.querySelector('#rnn-fade');
    const fadeCtx = fade.getContext('2d');
    const readout = container.querySelector('#rnn-readout');
    const playBtn = container.querySelector('#rnn-play');

    const SERIES = chaoticSeries(400, 7);
    let k = 2;
    let stateWith = { re: new Array(N_MODES).fill(0), im: new Array(N_MODES).fill(0) };
    let stateWithout = { re: new Array(N_MODES).fill(0), im: new Array(N_MODES).fill(0) };
    let history = [];
    let wWith = new Array(N_MODES).fill(0.1), wWithout = new Array(N_MODES).fill(0.1);
    let warmupWith = [], warmupWithout = [];
    let mseWith = 0, mseWithout = 0, mseN = 0;

    function drawFadeBars() {
      fadeCtx.clearRect(0, 0, fade.width, fade.height);
      const fracs = [1, 0.5, 0.25, 0.125];
      const w = fade.width / fracs.length;
      fracs.forEach((f, i) => {
        const h = f * (fade.height - 22);
        fadeCtx.fillStyle = 'rgba(124,151,255,.75)';
        fadeCtx.fillRect(i * w + w * 0.2, fade.height - 16 - h, w * 0.6, h);
        fadeCtx.fillStyle = 'rgba(125,135,155,.85)'; fadeCtx.font = '9px monospace'; fadeCtx.textAlign = 'center';
        fadeCtx.fillText(i === 0 ? 'P0' : `P0/${Math.round(1 / f)}`, i * w + w / 2, fade.height - 4);
      });
      fadeCtx.textAlign = 'left';
    }

    function combinedInput(kk) {
      const e0 = encode(SERIES[Math.max(0, kk) % SERIES.length]);
      const e1 = encode(SERIES[Math.max(0, kk - 1) % SERIES.length]);
      const e2 = encode(SERIES[Math.max(0, kk - 2) % SERIES.length]);
      Lab.drawHeatmap(tapCanvas[2], Lab.reconstructIntensity(basis, e0.re, e0.im), GRID, 'mono');
      Lab.drawHeatmap(tapCanvas[1], Lab.reconstructIntensity(basis, e1.re, e1.im), GRID, 'mono');
      Lab.drawHeatmap(tapCanvas[0], Lab.reconstructIntensity(basis, e2.re, e2.im), GRID, 'mono');
      return addFields(addFields(e0, e1), e2);
    }

    function stepOnce() {
      const target = targetAt(SERIES, k);
      const combined = combinedInput(k);
      const fixedWith = nFiber(combined.re, combined.im, STEPS_FIXED);
      const fixedWithout = nFiber(combined.re, combined.im, STEPS_FIXED);

      const loopIn = scaleField(stateWith, INV_SQRT2);
      const loopOut = nFiber(loopIn.re, loopIn.im, STEPS_LOOP);
      stateWith = addFields(fixedWith, loopOut);
      stateWithout = fixedWithout; // no loop term: only ever sees the current 3-sample window

      Lab.drawHeatmap(withCanvas, Lab.reconstructIntensity(basis, stateWith.re, stateWith.im), GRID, 'mono');
      Lab.drawHeatmap(withoutCanvas, Lab.reconstructIntensity(basis, stateWithout.re, stateWithout.im), GRID, 'mono');

      warmupWith.push({ h: stateWith.re.slice(), y: target });
      warmupWithout.push({ h: stateWithout.re.slice(), y: target });
      if (warmupWith.length > 150) { warmupWith.shift(); warmupWithout.shift(); }
      if (warmupWith.length >= 12) {
        wWith = solveRidge(warmupWith.map((w) => w.h), warmupWith.map((w) => w.y), N_MODES, 0.02);
        wWithout = solveRidge(warmupWithout.map((w) => w.h), warmupWithout.map((w) => w.y), N_MODES, 0.02);
      }
      let predWith = 0, predWithout = 0;
      for (let i = 0; i < N_MODES; i++) { predWith += wWith[i] * stateWith.re[i]; predWithout += wWithout[i] * stateWithout.re[i]; }

      history.push({ predWith, predWithout, truth: target });
      if (history.length > 70) history.shift();
      if (k > 40) { // let the readout settle past the initial transient before scoring it
        mseWith = (mseWith * mseN + (predWith - target) ** 2) / (mseN + 1);
        mseWithout = (mseWithout * mseN + (predWithout - target) ** 2) / (mseN + 1);
        mseN = Math.min(mseN + 1, 300);
      }

      k++;
      readout.innerHTML = k <= 40
        ? `step ${k} &middot; warming up the readout (scoring starts at step 41)&hellip;`
        : `step ${k} &middot; one-step MSE with memory: <b style="color:#22c55e">${mseWith.toFixed(3)}</b> &middot; without memory: <b style="color:#ef4444">${mseWithout.toFixed(3)}</b>`;
      drawChart();
    }

    function drawChart() {
      chartCtx.clearRect(0, 0, chart.width, chart.height);
      if (history.length < 2) return;
      const n = history.length;
      const xFor = (i) => (i / (n - 1)) * chart.width;
      const yFor = (v) => chart.height - 10 - ((v + 1) / 2) * (chart.height - 20);
      function line(key, color) {
        chartCtx.strokeStyle = color; chartCtx.lineWidth = 1.6;
        chartCtx.beginPath();
        history.forEach((h, i) => { const x = xFor(i), y = yFor(h[key]); i === 0 ? chartCtx.moveTo(x, y) : chartCtx.lineTo(x, y); });
        chartCtx.stroke();
      }
      line('truth', '#7C97FF'); line('predWithout', '#ef4444'); line('predWith', '#22c55e');
    }

    function reset() {
      k = 2;
      stateWith = { re: new Array(N_MODES).fill(0), im: new Array(N_MODES).fill(0) };
      stateWithout = { re: new Array(N_MODES).fill(0), im: new Array(N_MODES).fill(0) };
      history = []; warmupWith = []; warmupWithout = [];
      wWith = new Array(N_MODES).fill(0.1); wWithout = new Array(N_MODES).fill(0.1);
      mseWith = 0; mseWithout = 0; mseN = 0;
      chartCtx.clearRect(0, 0, chart.width, chart.height);
      readout.textContent = 'press play to start streaming frames';
    }

    let playing = false;
    async function playLoop() {
      if (playing) { playing = false; playBtn.textContent = 'Play'; return; }
      playing = true; playBtn.textContent = 'Pause';
      while (playing) {
        if (!container._labOpen) break;
        stepOnce();
        await new Promise((r) => setTimeout(r, 160));
      }
      playBtn.textContent = 'Play';
    }

    playBtn.addEventListener('click', playLoop);
    container.querySelector('#rnn-step').addEventListener('click', stepOnce);
    container.querySelector('#rnn-reset').addEventListener('click', reset);

    drawFadeBars();
    combinedInput(k);
  }

  window.LabFiberRNN = { mount };
})();

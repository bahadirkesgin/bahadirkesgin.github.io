// Fiber-D2NN widget: "bend the fiber" toy simulation.
// Reduced 8-mode coupled-mode model, driven by 5 draggable bend handles.
// Real paper: Kesgin, Yuce & Tegin, Opt. Lett. 50, 5254 (2025).
(function () {
  'use strict';
  const N_MODES = 8, N_HANDLES = 5, GRID = 56;
  const basis = Lab.buildModeBasis(GRID);
  const bendMats = Lab.buildBendMatrices(N_MODES, N_HANDLES);

  // 6 synthetic, illustrative "ultrasound-style" samples (3 malignant-like / 3 benign-like)
  // Coefficients are hand-tuned so classes overlap before optical processing --
  // mirroring the paper's point that this task is not linearly separable at baseline.
  const meanMal = [0.95, 0.55, -0.42, 0.30, 0.28, 0.58, -0.30, 0.20];
  const meanBen = [0.95, -0.15, 0.12, -0.22, -0.20, 0.05, 0.12, -0.10];
  function sampleSet() {
    const out = [];
    for (let c = 0; c < 2; c++) {
      const mean = c === 0 ? meanMal : meanBen;
      for (let s = 0; s < 3; s++) {
        const rnd = Lab.mulberry32(500 + c * 91 + s * 13);
        const re = mean.map((m) => m + (rnd() * 2 - 1) * 0.28);
        const im = mean.map(() => (rnd() * 2 - 1) * 0.18);
        out.push({ label: c === 0 ? 'Malignant' : 'Benign', cls: c, re, im });
      }
    }
    return out;
  }
  const SAMPLES = sampleSet();

  function classify(intensity) {
    let left = 0, right = 0;
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        const v = intensity[y * GRID + x];
        if (x < GRID / 2) left += v; else right += v;
      }
    }
    const total = left + right || 1;
    return { pred: left > right ? 0 : 1, leftFrac: left / total, rightFrac: right / total };
  }

  function mount(container) {
    container.innerHTML = `
      <div class="lab-block question">
        <p class="lab-block-label">The question</p>
        <p>A graded-index multimode fiber scrambles light into a complex speckle pattern. Can purely
        <em>mechanical bending</em> of the fiber, with no lenses, chips, or digital layers, be tuned so that
        the speckle pattern itself sorts breast-ultrasound images into malignant vs. benign? 
        <a href="https://doi.org/10.1364/OL.570135" target="_blank" rel="noopener">Kesgin et al., Optics Letters, 2025</a>.</p>
      </div>
      <div class="lab-widget">
        <div class="lab-widget-grid">
          <div class="lab-stage">
            <svg class="lab-fiber-wrap" viewBox="0 0 520 140" id="fd-fiber"></svg>
            <div class="lab-canvas-row">
              <div>
                <canvas class="lab-canvas lab-canvas-small" id="fd-in" width="56" height="56" style="max-width:150px"></canvas>
                <div class="lab-caption" style="text-align:center;margin-top:4px">input (straight fiber)</div>
              </div>
              <div>
                <canvas class="lab-canvas lab-canvas-small" id="fd-out" width="56" height="56" style="max-width:150px"></canvas>
                <div class="lab-caption" style="text-align:center;margin-top:4px">output speckle (bent)</div>
              </div>
            </div>
            <div class="lab-readout" id="fd-readout">drag the fiber to begin</div>
          </div>
          <div class="lab-controls">
            <div>
              <p class="lab-block-label" style="margin-bottom:6px">sample</p>
              <div style="display:flex;gap:8px;align-items:center">
                <button class="lab-btn ghost" id="fd-prev">&larr;</button>
                <span class="lab-readout" id="fd-sample-label" style="flex:1">1 / 6</span>
                <button class="lab-btn ghost" id="fd-next">&rarr;</button>
              </div>
            </div>
            <button class="lab-btn" id="fd-run-all">Test all 6 samples</button>
            <button class="lab-btn ghost" id="fd-optimize">Auto-optimize bends (Bayesian-style)</button>
            <canvas class="lab-mini-chart" id="fd-chart" width="340" height="90"></canvas>
            <div class="lab-legend">
              <span><i style="background:#ef4444"></i>malignant &rarr; left</span>
              <span><i style="background:#22c55e"></i>benign &rarr; right</span>
            </div>
          </div>
        </div>
        <div class="lab-eq" data-tex="\\frac{\\partial A_p}{\\partial z} = i \\sum_n C_{p,n} A_n"></div>
        <div class="lab-eq" data-tex="C_{p,n} = \\frac{\\omega}{2}\\iint\\big(\\tilde{\\epsilon}^{\\,*} - \\epsilon\\big)\\,F_p F_n^{\\,*}\\,dx\\,dy"></div>
        <p class="lab-caption" style="text-align:center;margin-top:-4px">
        &epsilon;: unperturbed permittivity. &epsilon;&#771;*: perturbed permittivity once bent. F<sub>p</sub>,
        F<sub>n</sub>: mode profiles p, n.</p>
      </div>
      <div class="lab-block insight">
        <p class="lab-block-label">The insight</p>
        <p>Bending the fiber changes its local refractive-index profile, which linearly mixes the guided modes
        (equations above). Because that mixing is fully reconfigurable, a purely <em>linear</em> optical element can
        be tuned, here by hand, in the real experiment by Bayesian optimization over 9 motorized bend points,
        to make an otherwise inseparable dataset separable at the output facet.</p>
        <p class="lab-caption">Real experiment: 9-controller Bayesian optimization raised BreastMNIST accuracy
        74.35% &rarr; 82.70% (ridge) and 56.79% &rarr; 74.74% (all-optical).</p>
      </div>
    `;
    Lab.renderEquations(container);

    const svg = container.querySelector('#fd-fiber');
    const inCanvas = container.querySelector('#fd-in');
    const outCanvas = container.querySelector('#fd-out');
    const readout = container.querySelector('#fd-readout');
    const sampleLabel = container.querySelector('#fd-sample-label');
    const chart = container.querySelector('#fd-chart');
    const chartCtx = chart.getContext('2d');

    let sampleIdx = 0;
    let bends = new Array(N_HANDLES).fill(0);
    let accHistory = [];

    // build fiber SVG: tube path + handles
    const W = 520, H = 140, MARGIN = 30;
    const xs = []; for (let i = 0; i < N_HANDLES; i++) xs.push(MARGIN + (i * (W - 2 * MARGIN)) / (N_HANDLES - 1));
    const AMP = 44;

    const nsSvg = 'http://www.w3.org/2000/svg';
    // three-layer cable render: outer jacket, cladding, glowing core (thicker = reads as a real fiber-optic cable)
    const jacket = document.createElementNS(nsSvg, 'path');
    jacket.setAttribute('stroke', '#3a4150'); jacket.setAttribute('fill', 'none');
    jacket.setAttribute('stroke-width', '26'); jacket.setAttribute('stroke-linecap', 'round');
    jacket.setAttribute('opacity', '0.9');
    const cladding = document.createElementNS(nsSvg, 'path');
    cladding.setAttribute('stroke', 'var(--accent)'); cladding.setAttribute('fill', 'none');
    cladding.setAttribute('stroke-width', '17'); cladding.setAttribute('stroke-linecap', 'round');
    cladding.setAttribute('opacity', '0.28');
    const tube = document.createElementNS(nsSvg, 'path');
    tube.setAttribute('stroke', 'var(--accent)'); tube.setAttribute('fill', 'none');
    tube.setAttribute('stroke-width', '10'); tube.setAttribute('stroke-linecap', 'round');
    tube.setAttribute('opacity', '0.4');
    const core = document.createElementNS(nsSvg, 'path');
    core.setAttribute('stroke', '#fff59d'); core.setAttribute('fill', 'none');
    core.setAttribute('stroke-width', '3.2'); core.setAttribute('stroke-linecap', 'round');
    core.setAttribute('opacity', '0.95');
    svg.appendChild(jacket); svg.appendChild(cladding); svg.appendChild(tube); svg.appendChild(core);
    // endpoints markers
    const laserLabel = document.createElementNS(nsSvg, 'text');
    laserLabel.setAttribute('x', 2); laserLabel.setAttribute('y', H / 2 - 14);
    laserLabel.setAttribute('font-size', '9'); laserLabel.setAttribute('fill', 'var(--muted)');
    laserLabel.setAttribute('font-family', 'monospace'); laserLabel.textContent = 'laser + SLM';
    svg.appendChild(laserLabel);
    const camLabel = document.createElementNS(nsSvg, 'text');
    camLabel.setAttribute('x', W - 58); camLabel.setAttribute('y', H / 2 - 14);
    camLabel.setAttribute('font-size', '9'); camLabel.setAttribute('fill', 'var(--muted)');
    camLabel.setAttribute('font-family', 'monospace'); camLabel.textContent = 'camera';
    svg.appendChild(camLabel);

    const handles = [];
    for (let i = 0; i < N_HANDLES; i++) {
      const c = document.createElementNS(nsSvg, 'circle');
      c.setAttribute('r', '8'); c.setAttribute('fill', 'var(--paper)');
      c.setAttribute('stroke', 'var(--accent)'); c.setAttribute('stroke-width', '2.5');
      c.classList.add('lab-fiber-handle');
      c.setAttribute('cx', xs[i]); c.setAttribute('cy', H / 2);
      svg.appendChild(c);
      handles.push(c);
    }

    function updateFiberPath() {
      const pts = xs.map((x, i) => [x, H / 2 + bends[i] * AMP]);
      const d = Lab.catmullRomPath(pts);
      jacket.setAttribute('d', d); cladding.setAttribute('d', d);
      tube.setAttribute('d', d); core.setAttribute('d', d);
      handles.forEach((h, i) => h.setAttribute('cy', H / 2 + bends[i] * AMP));
    }
    updateFiberPath();

    function dragHandle(i, evt) {
      evt.preventDefault();
      const move = (ev) => {
        const rect = svg.getBoundingClientRect();
        const clientY = ev.touches ? ev.touches[0].clientY : ev.clientY;
        const localY = ((clientY - rect.top) / rect.height) * H;
        let b = (localY - H / 2) / AMP;
        b = Math.max(-1, Math.min(1, b));
        bends[i] = b;
        updateFiberPath();
        recompute();
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    }
    handles.forEach((h, i) => h.addEventListener('pointerdown', (e) => dragHandle(i, e)));

    function currentC() {
      const C = new Array(N_MODES * N_MODES).fill(0);
      for (let k = 0; k < N_HANDLES; k++) {
        const M = bendMats[k], b = bends[k] * 2.2;
        for (let p = 0; p < C.length; p++) C[p] += b * M[p];
      }
      return C;
    }

    function drawSample() {
      const s = SAMPLES[sampleIdx];
      sampleLabel.textContent = `${sampleIdx + 1} / 6 · ground truth: ${s.label}`;
      const inputI = Lab.reconstructIntensity(basis, s.re, s.im);
      Lab.drawHeatmap(inCanvas, inputI, GRID, 'photon');
    }

    function recompute() {
      const s = SAMPLES[sampleIdx];
      const C = currentC();
      const { re, im } = Lab.propagateModes(C, N_MODES, s.re, s.im, 1.0);
      const outI = Lab.reconstructIntensity(basis, re, im);
      Lab.drawHeatmap(outCanvas, outI, GRID, 'photon');
      const { pred, leftFrac, rightFrac } = classify(outI);
      const predLabel = pred === 0 ? 'Malignant' : 'Benign';
      const correct = pred === s.cls;
      readout.className = 'lab-readout ' + (pred === 0 ? 'decide-left' : 'decide-right');
      readout.innerHTML = `speckle energy: <b>${Math.round(leftFrac * 100)}% left</b> / ${Math.round(rightFrac * 100)}% right
        &rarr; prediction <b>${predLabel}</b> ${correct ? '✓' : '✗ (truth: ' + s.label + ')'}`;
    }

    function drawChart() {
      chartCtx.clearRect(0, 0, chart.width, chart.height);
      chartCtx.strokeStyle = 'rgba(125,135,155,.35)';
      chartCtx.beginPath(); chartCtx.moveTo(0, chart.height - 1); chartCtx.lineTo(chart.width, chart.height - 1); chartCtx.stroke();
      if (accHistory.length < 2) {
        chartCtx.fillStyle = 'rgba(125,135,155,.7)';
        chartCtx.font = '11px monospace';
        chartCtx.fillText('accuracy-vs-iteration appears after "Auto-optimize"', 8, chart.height / 2);
        return;
      }
      chartCtx.strokeStyle = '#1D4ED8';
      chartCtx.lineWidth = 2;
      chartCtx.beginPath();
      accHistory.forEach((a, i) => {
        const x = (i / (accHistory.length - 1)) * (chart.width - 8) + 4;
        const y = chart.height - 8 - a * (chart.height - 16);
        i === 0 ? chartCtx.moveTo(x, y) : chartCtx.lineTo(x, y);
      });
      chartCtx.stroke();
      chartCtx.fillStyle = 'rgba(29,78,216,.85)';
      chartCtx.font = '10px monospace';
      chartCtx.fillText(`best: ${Math.round(Math.max(...accHistory) * 100)}%`, 6, 14);
    }

    function testAllAccuracy(bendCfg) {
      const C = (() => {
        const M0 = new Array(N_MODES * N_MODES).fill(0);
        for (let k = 0; k < N_HANDLES; k++) {
          const M = bendMats[k], b = bendCfg[k] * 2.2;
          for (let p = 0; p < M0.length; p++) M0[p] += b * M[p];
        }
        return M0;
      })();
      let correct = 0;
      SAMPLES.forEach((s) => {
        const { re, im } = Lab.propagateModes(C, N_MODES, s.re, s.im, 1.0);
        const outI = Lab.reconstructIntensity(basis, re, im);
        const { pred } = classify(outI);
        if (pred === s.cls) correct++;
      });
      return correct / SAMPLES.length;
    }

    container.querySelector('#fd-prev').addEventListener('click', () => {
      sampleIdx = (sampleIdx - 1 + SAMPLES.length) % SAMPLES.length; drawSample(); recompute();
    });
    container.querySelector('#fd-next').addEventListener('click', () => {
      sampleIdx = (sampleIdx + 1) % SAMPLES.length; drawSample(); recompute();
    });
    container.querySelector('#fd-run-all').addEventListener('click', () => {
      const acc = testAllAccuracy(bends);
      readout.className = 'lab-readout';
      readout.innerHTML = `current bend configuration: <b>${Math.round(acc * 100)}%</b> accuracy across all 6 samples`;
    });
    container.querySelector('#fd-optimize').addEventListener('click', async () => {
      const btn = container.querySelector('#fd-optimize');
      btn.disabled = true; btn.textContent = 'optimizing…';
      accHistory = [];
      let best = bends.slice(), bestAcc = testAllAccuracy(best);
      accHistory.push(bestAcc); drawChart();
      const rnd = Lab.mulberry32(Date.now() % 100000);
      for (let iter = 0; iter < 30; iter++) {
        const cand = best.map((b) => Math.max(-1, Math.min(1, b + (rnd() * 2 - 1) * 0.5)));
        const acc = testAllAccuracy(cand);
        if (acc > bestAcc) { bestAcc = acc; best = cand; }
        accHistory.push(bestAcc);
        drawChart();
        await new Promise((r) => setTimeout(r, 18));
      }
      // animate handles to best config
      const start = bends.slice();
      const steps = 20;
      for (let t = 1; t <= steps; t++) {
        bends = start.map((b, i) => b + (best[i] - b) * (t / steps));
        updateFiberPath();
        await new Promise((r) => requestAnimationFrame(r));
      }
      bends = best;
      recompute();
      btn.disabled = false; btn.textContent = 'Auto-optimize bends (Bayesian-style)';
    });

    drawSample();
    recompute();
    drawChart();
  }

  window.LabFiberD2NN = { mount };
})();

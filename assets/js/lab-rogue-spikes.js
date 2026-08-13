// Optical rogue-wave / caustic spiking widget: a real (small-grid) Angular Spectrum Method
// diffraction simulation, matching the paper's Eq. 6-7, run in-browser via a compact FFT.
// Real paper: Kesgin, Durdu & Tegin, npj Unconventional Computing 3, 33 (2026).
(function () {
  'use strict';
  const N = 64;

  function genAmplitude(kind, rnd) {
    const A = new Float64Array(N * N);
    if (kind === 'checkerboard') {
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const dx = (x - N/2) / (N*0.42), dy = (y - N*0.32) / (N*0.62);
          const sector = Math.max(0, 1 - (dx*dx*1.1 + Math.max(0,dy)*Math.max(0,dy)*0.9));
          let v = sector * (0.35 + 0.4*Math.sin(x*0.5)*Math.sin(y*0.3));
          v += 0.5*Math.exp(-(((x-N*0.55)**2)+((y-N*0.5)**2))/(N*1.4));
          A[y*N+x] = Math.max(0, Math.min(1, v));
        }
      }
    } else {
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const dx = (x-N/2)/(N*0.32), dy=(y-N/2)/(N*0.42);
          const face = Math.exp(-(dx*dx+dy*dy)*1.6);
          const eyeL = Math.exp(-(((x-N*0.38)**2)+((y-N*0.42)**2))/(N*0.35));
          const eyeR = Math.exp(-(((x-N*0.62)**2)+((y-N*0.42)**2))/(N*0.35));
          const mouth = Math.exp(-(((x-N*0.5)**2)+((y-N*0.66)**2))/(N*1.4)) * (Math.abs(y-N*0.66)<3?1:0.3);
          A[y*N+x] = Math.max(0, Math.min(1, face*0.6 - eyeL*0.5 - eyeR*0.5 + mouth*0.2));
        }
      }
    }
    return A;
  }

  function buildPhaseMask(superpx, rnd) {
    const phi = new Float64Array(N * N);
    for (let y = 0; y < N; y += superpx) {
      for (let x = 0; x < N; x += superpx) {
        const val = rnd() * 2 * Math.PI;
        for (let j = y; j < Math.min(N, y+superpx); j++)
          for (let i = x; i < Math.min(N, x+superpx); i++)
            phi[j*N+i] = val;
      }
    }
    return phi;
  }

  function propagate(amp, phase, z, lambda) {
    const re = new Float64Array(N*N), im = new Float64Array(N*N);
    for (let p = 0; p < N*N; p++) { re[p] = amp[p]*Math.cos(phase[p]); im[p] = amp[p]*Math.sin(phase[p]); }
    Lab.fft2d(re, im, N, false);
    // apply transfer function with fftshift-free frequency indexing
    for (let ky = 0; ky < N; ky++) {
      const fy = (ky < N/2 ? ky : ky - N) / N;
      for (let kx = 0; kx < N; kx++) {
        const fx = (kx < N/2 ? kx : kx - N) / N;
        const arg = 1/(lambda*lambda) - fx*fx - fy*fy;
        const p = ky*N+kx;
        if (arg <= 0) { re[p] = 0; im[p] = 0; continue; }
        const kz = 2*Math.PI*z*Math.sqrt(arg);
        const c = Math.cos(kz), s = Math.sin(kz);
        const r = re[p]*c - im[p]*s, i2 = re[p]*s + im[p]*c;
        re[p] = r; im[p] = i2;
      }
    }
    Lab.fft2d(re, im, N, true);
    const I = new Float64Array(N*N);
    let max = 1e-9;
    for (let p = 0; p < N*N; p++) { const v = re[p]*re[p]+im[p]*im[p]; I[p]=v; if (v>max) max=v; }
    for (let p = 0; p < N*N; p++) I[p] /= max;
    return I;
  }

  function significantIntensity(I) {
    const sorted = Array.from(I).sort((a,b)=>a-b);
    const topStart = Math.floor(sorted.length * 2/3);
    let sum = 0, cnt = sorted.length - topStart;
    for (let i = topStart; i < sorted.length; i++) sum += sorted[i];
    return cnt > 0 ? sum / cnt : 1e-6;
  }

  function mount(container) {
    container.innerHTML = `
      <div class="lab-block question">
        <p class="lab-block-label">The question</p>
        <p>Free-space diffraction of a phase-modulated beam naturally produces rare, very bright spots,
        optical <em>rogue waves</em>, formed by constructive interference. Can thresholding only those extreme
        spots, and nothing else, act as a spiking neuron's firing rule?
        <a href="https://doi.org/10.1038/s44335-026-00080-6" target="_blank" rel="noopener"> Kesgin et al., npj Unconventional Computing, 2026</a>.</p>
      </div>
      <div class="lab-widget">
        <div class="lab-widget-grid">
          <div class="lab-stage">
            <div class="lab-canvas-row">
              <div><canvas class="lab-canvas lab-canvas-small" id="rw-amp" width="${N}" height="${N}" style="max-width:120px"></canvas>
                <div class="lab-caption" style="text-align:center">amplitude (data)</div></div>
              <div><canvas class="lab-canvas lab-canvas-small" id="rw-phase" width="${N}" height="${N}" style="max-width:120px"></canvas>
                <div class="lab-caption" style="text-align:center">phase mask</div></div>
              <div><canvas class="lab-canvas lab-canvas-small" id="rw-out" width="${N}" height="${N}" style="max-width:120px"></canvas>
                <div class="lab-caption" style="text-align:center">detector intensity</div></div>
              <div><canvas class="lab-canvas lab-canvas-small" id="rw-spikes" width="${N}" height="${N}" style="max-width:120px"></canvas>
                <div class="lab-caption" style="text-align:center">spikes (I &ge; I_RW)</div></div>
            </div>
            <canvas class="lab-mini-chart" id="rw-hist" width="340" height="90"></canvas>
            <div class="lab-readout" id="rw-readout">&hellip;</div>
          </div>
          <div class="lab-controls">
            <div style="display:flex;gap:8px">
              <button class="lab-btn ghost" id="rw-checkerboard">checkerboard</button>
              <button class="lab-btn ghost" id="rw-face">face</button>
            </div>
            <div id="rw-gran-slider"></div>
            <div id="rw-z-slider"></div>
            <button class="lab-btn" id="rw-reshuffle">reshuffle phase mask</button>
          </div>
        </div>
        <div class="lab-eq" data-tex="I_{sig}=\\langle I(x,y)\\rangle_{\\text{top }33\\%} \\qquad I_{RW}=2\\cdot I_{sig} \\qquad \\text{spike if } |E|^2 \\ge I_{RW}"></div>
      </div>
      <div class="lab-block insight">
        <p class="lab-block-label">The insight</p>
        <p>Synaptic integration is free; it's just diffraction. The only thing that has to be learned is
        <em>where</em> the phase mask should steer energy so that a rogue-wave caustic lands on the right detector
        pixels for the right class.</p>
        <p class="lab-caption">Real in-browser Angular-Spectrum-Method diffraction; illustrative synthetic input.</p>
      </div>
    `;
    Lab.renderEquations(container);

    const ampCanvas = container.querySelector('#rw-amp');
    const phaseCanvas = container.querySelector('#rw-phase');
    const outCanvas = container.querySelector('#rw-out');
    const spikeCanvas = container.querySelector('#rw-spikes');
    const hist = container.querySelector('#rw-hist');
    const histCtx = hist.getContext('2d');
    const readout = container.querySelector('#rw-readout');

    let kind = 'checkerboard', superpx = 8, z = 18*60, seed = 7;
    const lambda = 0.09;

    function render() {
      const rndAmp = Lab.mulberry32(1);
      const amp = genAmplitude(kind, rndAmp);
      const rndPhase = Lab.mulberry32(seed);
      const phase = buildPhaseMask(superpx, rndPhase);
      const I = propagate(amp, phase, z, lambda);
      const Isig = significantIntensity(I);
      const Irw = 2 * Isig;
      const spikes = new Float64Array(N*N);
      let spikeCount = 0;
      for (let p = 0; p < N*N; p++) { if (I[p] >= Irw) { spikes[p] = 1; spikeCount++; } }

      Lab.drawHeatmap(ampCanvas, amp, N, 'mono', 1);
      const phaseNorm = Array.from(phase).map((v) => v / (2*Math.PI));
      Lab.drawHeatmap(phaseCanvas, phaseNorm, N, 'ember', 1);
      Lab.drawHeatmap(outCanvas, I, N, 'photon');
      Lab.drawHeatmap(spikeCanvas, spikes, N, 'ember', 1);

      // histogram of I / Isig
      histCtx.clearRect(0,0,hist.width,hist.height);
      const bins = 40, maxRatio = 5;
      const counts = new Array(bins).fill(0);
      for (let p = 0; p < N*N; p++) {
        const r = I[p] / (Isig || 1e-6);
        const b = Math.min(bins-1, Math.floor((r/maxRatio)*bins));
        if (b >= 0) counts[b]++;
      }
      const maxCount = Math.max(...counts, 1);
      const w = hist.width / bins;
      histCtx.fillStyle = 'rgba(29,78,216,.6)';
      counts.forEach((c, i) => {
        const h = (c / maxCount) * (hist.height - 18);
        histCtx.fillRect(i*w, hist.height - 14 - h, w-1, h);
      });
      function vline(ratio, color, label) {
        const x = (ratio/maxRatio) * hist.width;
        histCtx.strokeStyle = color; histCtx.setLineDash([3,3]);
        histCtx.beginPath(); histCtx.moveTo(x, 4); histCtx.lineTo(x, hist.height-14); histCtx.stroke();
        histCtx.setLineDash([]); histCtx.fillStyle = color; histCtx.font = '9px monospace';
        histCtx.fillText(label, Math.min(x+3, hist.width-40), 12);
      }
      vline(1, 'rgba(125,135,155,.9)', 'I_sig');
      vline(2, '#ef4444', 'I_RW');

      readout.innerHTML = `<b>${spikeCount}</b> spiking pixels out of ${N*N} (${(100*spikeCount/(N*N)).toFixed(2)}%) &middot; I_sig = ${Isig.toExponential(2)}`;
    }

    container.querySelector('#rw-checkerboard').addEventListener('click', () => { kind='checkerboard'; render(); });
    container.querySelector('#rw-face').addEventListener('click', () => { kind='face'; render(); });
    container.querySelector('#rw-reshuffle').addEventListener('click', () => { seed = Math.floor(Math.random()*99999); render(); });

    container.querySelector('#rw-gran-slider').appendChild(Lab.makeSlider({
      label: 'phase superpixel size', min: 2, max: 16, step: 2, value: 8,
      format: (v) => `${v}×${v} px`, onInput: (v) => { superpx = v; render(); },
    }).wrap);
    container.querySelector('#rw-z-slider').appendChild(Lab.makeSlider({
      label: 'propagation distance', min: 10, max: 40, step: 1, value: 18,
      format: (v) => `${v} (a.u.)`, onInput: (v) => { z = v*60; render(); },
    }).wrap);

    render();
  }

  window.LabRogueSpikes = { mount };
})();

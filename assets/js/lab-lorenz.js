// Lorenz-attractor widget for the chaotic-strange-attractor computing paper.
// Note: this is the one *electronic* (analog-circuit) architecture among the six --
// the Lorenz system is computed by an op-amp/analog-multiplier circuit, not photonics.
// Real paper: Kesgin & Tegin, Commun. Eng. 3, 99 (2024).
(function () {
  'use strict';

  function lorenzDeriv(sigma, rho, beta) {
    return (s) => {
      const [x, y, z] = s;
      return [sigma * (y - x), x * (rho - z) - y, x * y - beta * z];
    };
  }

  // approx digitized from paper Fig. 4b: rho vs accuracy (Liver Disorder dataset, Linear SVM)
  const RHO_ACC = [
    { rho: 2, acc: 87.26 }, { rho: 10, acc: 88.5 }, { rho: 20, acc: 89.6 },
    { rho: 28, acc: 90.74 }, { rho: 40, acc: 91.8 }, { rho: 60, acc: 92.1 },
    { rho: 80, acc: 92.6 }, { rho: 97, acc: 92.82 }, { rho: 100, acc: 92.7 },
  ];
  function accForRho(rho) {
    for (let i = 0; i < RHO_ACC.length - 1; i++) {
      const a = RHO_ACC[i], b = RHO_ACC[i + 1];
      if (rho >= a.rho && rho <= b.rho) {
        const t = (rho - a.rho) / (b.rho - a.rho);
        return a.acc + (b.acc - a.acc) * t;
      }
    }
    return RHO_ACC[RHO_ACC.length - 1].acc;
  }

  function mount(container) {
    container.innerHTML = `
      <div class="lab-block question">
        <p class="lab-block-label">The question</p>
        <p>Two datapoints that start almost identically are fed as <em>initial conditions</em> into a chaotic
        electronic circuit computing the Lorenz attractor. Does the circuit's sensitivity to those initial
        conditions, the textbook "butterfly effect," make the data easier to classify afterwards? Kesgin et al.,
        <a href="https://doi.org/10.1038/s44172-024-00242-z" target="_blank" rel="noopener">Communications Engineering, 2024</a>.</p>
      </div>
      <div class="lab-widget">
        <div class="lab-widget-grid">
          <div class="lab-stage">
            <canvas class="lab-canvas" id="lz-canvas" width="340" height="340" style="max-width:340px"></canvas>
            <div class="lab-legend">
              <span><i style="background:#1D4ED8"></i>trajectory A</span>
              <span><i style="background:#f59e0b"></i>trajectory B (&Delta;&#8320;=10&#8315;&#8309;)</span>
            </div>
            <div class="lab-readout" id="lz-readout">separation: &hellip;</div>
          </div>
          <div class="lab-controls">
            <div id="lz-rho-slider"></div>
            <canvas class="lab-mini-chart" id="lz-acc-chart" width="340" height="90"></canvas>
            <div class="lab-caption">Circles: Liver-Disorder classification accuracy vs. &rho; (paper Fig. 4b,
            r = 0.84 correlation with the Lyapunov exponent). Vertical line = current &rho;.</div>
          </div>
        </div>
        <div class="lab-eq" data-tex="\\dot{x}=\\sigma(y-x)\\qquad \\dot{y}=x(\\rho-z)-y\\qquad \\dot{z}=xy-\\beta z"></div>
      </div>
      <div class="lab-block insight">
        <p class="lab-block-label">The insight</p>
        <p>Larger &rho; means a larger Lyapunov exponent, which means two nearby points get pushed apart faster as
        they pass through the attractor, exactly the kind of nonlinear, high-dimensional spreading a linear
        readout layer needs to draw a decision boundary. This is an <em>electronic</em>, not optical, chaotic
        processor: a two-op-amp, two-analog-multiplier circuit computing this exact ODE at 351&nbsp;mW.</p>
        <p class="lab-caption"><a href="https://doi.org/10.1038/s44172-024-00242-z" target="_blank" rel="noopener">Commun. Eng. 3, 99 (2024)</a> &middot; code: <a href="https://doi.org/10.5281/zenodo.10051449" target="_blank" rel="noopener">Zenodo</a></p>
      </div>
    `;
    Lab.renderEquations(container);

    const canvas = container.querySelector('#lz-canvas');
    const ctx = canvas.getContext('2d');
    const readout = container.querySelector('#lz-readout');
    const accChart = container.querySelector('#lz-acc-chart');
    const accCtx = accChart.getContext('2d');

    let sigma = 10, beta = 8 / 3, rho = 28;
    let a = [1, 1, 1];
    let b = [1 + 1e-4, 1, 1];
    const dt = 0.008;
    let trailA = [], trailB = [];
    const MAXTRAIL = 900;

    // attractor extent grows with rho, so rescale the projection each time rho changes
    // (z spans roughly [0, ~2.2*rho]; x,y span roughly sqrt(beta*rho)) to keep it framed.
    let scale = 4.0, cy = canvas.height - 20;
    function updateScale() {
      scale = (canvas.height - 40) / (2.2 * rho);
      cy = canvas.height - 20;
    }
    updateScale();

    function reset() {
      a = [1, 1, 1]; b = [1 + 1e-4, 1, 1];
      trailA = []; trailB = [];
      updateScale();
    }

    function project(p) {
      // simple oblique projection of (x,z) with slight y shear, scaled to canvas
      const cx = canvas.width / 2;
      const x = p[0] + p[1] * 0.25;
      const z = p[2];
      return [cx + x * scale, cy - z * scale];
    }

    function drawAccChart() {
      accCtx.clearRect(0, 0, accChart.width, accChart.height);
      const pad = 26;
      const xFor = (r) => pad + (r / 100) * (accChart.width - pad - 10);
      const yFor = (acc) => accChart.height - 14 - ((acc - 85) / (94 - 85)) * (accChart.height - 24);
      accCtx.strokeStyle = 'rgba(125,135,155,.3)';
      accCtx.beginPath(); accCtx.moveTo(pad, accChart.height - 14); accCtx.lineTo(accChart.width, accChart.height - 14); accCtx.stroke();
      accCtx.strokeStyle = '#1D4ED8'; accCtx.lineWidth = 2;
      accCtx.beginPath();
      RHO_ACC.forEach((pt, i) => { const x = xFor(pt.rho), y = yFor(pt.acc); i === 0 ? accCtx.moveTo(x,y) : accCtx.lineTo(x,y); });
      accCtx.stroke();
      accCtx.font = '9px monospace'; accCtx.fillStyle = 'rgba(125,135,155,.85)';
      accCtx.fillText('Liver-Disorder acc. vs ρ', pad, 12);
      const x = xFor(rho);
      accCtx.strokeStyle = 'rgba(239,68,68,.85)'; accCtx.setLineDash([3,3]);
      accCtx.beginPath(); accCtx.moveTo(x, 6); accCtx.lineTo(x, accChart.height - 14); accCtx.stroke();
      accCtx.setLineDash([]);
    }

    let raf = null, frame = 0;
    function tick() {
      raf = requestAnimationFrame(tick);
      if (!container._labOpen) return;
      for (let i = 0; i < 3; i++) {
        a = Lab.rk4Step(lorenzDeriv(sigma, rho, beta), a, dt);
        b = Lab.rk4Step(lorenzDeriv(sigma, rho, beta), b, dt);
      }
      trailA.push(project(a)); trailB.push(project(b));
      if (trailA.length > MAXTRAIL) { trailA.shift(); trailB.shift(); }
      ctx.fillStyle = 'rgba(11,14,20,0.16)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      drawTrail(trailA, '#1D4ED8');
      drawTrail(trailB, '#f59e0b');
      frame++;
      if (frame % 12 === 0) {
        const dx = a[0]-b[0], dy = a[1]-b[1], dz = a[2]-b[2];
        const d = Math.sqrt(dx*dx+dy*dy+dz*dz);
        readout.innerHTML = `separation between A and B: <b>${d.toExponential(2)}</b>`;
      }
    }
    function drawTrail(trail, color) {
      if (trail.length < 2) return;
      ctx.strokeStyle = color; ctx.lineWidth = 1.3; ctx.globalAlpha = 0.85;
      ctx.beginPath();
      trail.forEach((p, i) => (i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1])));
      ctx.stroke();
      ctx.globalAlpha = 1;
      const last = trail[trail.length - 1];
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(last[0], last[1], 3, 0, 7); ctx.fill();
    }
    raf = requestAnimationFrame(tick);

    const slot = container.querySelector('#lz-rho-slider');
    const slider = Lab.makeSlider({
      label: 'chaos parameter ρ', min: 1, max: 100, step: 1, value: 28,
      format: (v) => `${v}`,
      onInput: (v) => { rho = v; reset(); drawAccChart(); },
    });
    slot.appendChild(slider.wrap);
    drawAccChart();
  }

  window.LabLorenz = { mount };
})();

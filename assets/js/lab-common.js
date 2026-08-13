// Shared toy-physics + rendering toolkit for the interactive research widgets.
// Everything here is a deliberately small, real-time-friendly approximation of the
// physics in the corresponding papers -- built for intuition, not for reproducing
// experimental data. See each paper's DOI for the real results.
(function (global) {
  'use strict';

  // ---------- seeded PRNG (mulberry32) ----------
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- Hermite-Gauss mode basis ----------
  const HERMITE_COEFS = { // physicists' Hermite polynomials, coefficients low->high order
    0: [1],
    1: [0, 2],
    2: [-2, 0, 4],
    3: [0, -12, 0, 8],
    4: [12, 0, -48, 0, 16],
  };
  function hermite(n, x) {
    const c = HERMITE_COEFS[n];
    let v = 0, xp = 1;
    for (let i = 0; i < c.length; i++) { v += c[i] * xp; xp *= x; }
    return v;
  }

  // Builds K real-valued transverse mode profiles on a size x size grid.
  // Returns { size, modes: [Float32Array...], labels: [...] }
  function buildModeBasis(size, orders) {
    orders = orders || [[0,0],[1,0],[0,1],[2,0],[0,2],[1,1],[3,0],[0,3]];
    const waist = size * 0.30;
    const modes = orders.map(([m, n]) => {
      const arr = new Float32Array(size * size);
      let maxAbs = 0;
      for (let j = 0; j < size; j++) {
        const y = (j - size / 2 + 0.5);
        for (let i = 0; i < size; i++) {
          const x = (i - size / 2 + 0.5);
          const gauss = Math.exp(-(x * x + y * y) / (waist * waist));
          const val = hermite(m, Math.SQRT2 * x / waist) * hermite(n, Math.SQRT2 * y / waist) * gauss;
          arr[j * size + i] = val;
          if (Math.abs(val) > maxAbs) maxAbs = Math.abs(val);
        }
      }
      if (maxAbs > 0) for (let k = 0; k < arr.length; k++) arr[k] /= maxAbs;
      return arr;
    });
    return { size, modes, labels: orders.map(([m,n]) => `HG${m}${n}`) };
  }

  // ---------- symmetric eigen-decomposition (cyclic Jacobi) ----------
  // A: flat row-major N x N array (symmetric). Returns { values: [N], vectors: N x N (col j = eigvec j) }
  function jacobiEigenSymmetric(Ain, N, sweeps) {
    sweeps = sweeps || 12;
    const A = Ain.slice();
    const V = new Array(N * N).fill(0);
    for (let i = 0; i < N; i++) V[i * N + i] = 1;
    for (let sweep = 0; sweep < sweeps; sweep++) {
      for (let p = 0; p < N - 1; p++) {
        for (let q = p + 1; q < N; q++) {
          const apq = A[p * N + q];
          if (Math.abs(apq) < 1e-12) continue;
          const app = A[p * N + p], aqq = A[q * N + q];
          const phi = 0.5 * Math.atan2(2 * apq, aqq - app);
          const c = Math.cos(phi), s = Math.sin(phi);
          for (let k = 0; k < N; k++) {
            const akp = A[k * N + p], akq = A[k * N + q];
            A[k * N + p] = c * akp - s * akq;
            A[k * N + q] = s * akp + c * akq;
          }
          for (let k = 0; k < N; k++) {
            const apk = A[p * N + k], aqk = A[q * N + k];
            A[p * N + k] = c * apk - s * aqk;
            A[q * N + k] = s * apk + c * aqk;
          }
          for (let k = 0; k < N; k++) {
            const vkp = V[k * N + p], vkq = V[k * N + q];
            V[k * N + p] = c * vkp - s * vkq;
            V[k * N + q] = s * vkp + c * vkq;
          }
        }
      }
    }
    const values = new Array(N);
    for (let i = 0; i < N; i++) values[i] = A[i * N + i];
    return { values, vectors: V };
  }

  // Propagate complex coefficient vector through exp(i*C*L) for real symmetric C.
  // coeffsRe/Im: length-N arrays. Returns {re, im}.
  function propagateModes(C, N, coeffsRe, coeffsIm, L) {
    const { values, vectors } = jacobiEigenSymmetric(C, N, 10);
    // project onto eigenbasis: proj = V^T * coeffs
    const projRe = new Array(N).fill(0), projIm = new Array(N).fill(0);
    for (let j = 0; j < N; j++) {
      let sr = 0, si = 0;
      for (let k = 0; k < N; k++) {
        const vkj = vectors[k * N + j];
        sr += vkj * coeffsRe[k];
        si += vkj * coeffsIm[k];
      }
      projRe[j] = sr; projIm[j] = si;
    }
    // multiply by exp(i*lambda*L)
    for (let j = 0; j < N; j++) {
      const th = values[j] * L;
      const cr = Math.cos(th), ci = Math.sin(th);
      const re = projRe[j] * cr - projIm[j] * ci;
      const im = projRe[j] * ci + projIm[j] * cr;
      projRe[j] = re; projIm[j] = im;
    }
    // back-transform: out = V * proj
    const outRe = new Array(N).fill(0), outIm = new Array(N).fill(0);
    for (let k = 0; k < N; k++) {
      let sr = 0, si = 0;
      for (let j = 0; j < N; j++) {
        const vkj = vectors[k * N + j];
        sr += vkj * projRe[j];
        si += vkj * projIm[j];
      }
      outRe[k] = sr; outIm[k] = si;
    }
    return { re: outRe, im: outIm };
  }

  // Build coupling matrix C = sum_k bend_k * M_k, where M_k are fixed seeded symmetric matrices.
  function buildBendMatrices(N, K) {
    const mats = [];
    for (let k = 0; k < K; k++) {
      const rnd = mulberry32(1000 + k * 37);
      const M = new Array(N * N).fill(0);
      for (let i = 0; i < N; i++) {
        for (let j = i; j < N; j++) {
          const v = (rnd() * 2 - 1) * (i === j ? 0.4 : 1);
          M[i * N + j] = v; M[j * N + i] = v;
        }
      }
      mats.push(M);
    }
    return mats;
  }

  // ---------- field reconstruction from mode coefficients ----------
  // Returns Float32Array of intensity on the mode-basis grid.
  function reconstructIntensity(basis, coeffRe, coeffIm) {
    const { size, modes } = basis;
    const N = modes.length;
    const outRe = new Float32Array(size * size);
    const outIm = new Float32Array(size * size);
    for (let n = 0; n < N; n++) {
      const m = modes[n], cr = coeffRe[n], ci = coeffIm[n];
      for (let p = 0; p < m.length; p++) {
        outRe[p] += cr * m[p];
        outIm[p] += ci * m[p];
      }
    }
    const I = new Float32Array(size * size);
    let max = 1e-9;
    for (let p = 0; p < I.length; p++) {
      const v = outRe[p] * outRe[p] + outIm[p] * outIm[p];
      I[p] = v; if (v > max) max = v;
    }
    for (let p = 0; p < I.length; p++) I[p] /= max;
    return I;
  }

  // ---------- colormaps ----------
  function colormapLookup(name) {
    const stops = {
      photon: [[11,14,20],[29,45,120],[41,110,200],[110,190,230],[250,230,120],[255,250,235]],
      ember:  [[10,8,14],[70,20,60],[160,30,60],[230,90,40],[255,180,60],[255,245,200]],
      mono:   [[10,12,18],[40,60,110],[124,151,255],[210,220,255],[255,255,255]],
    };
    const s = stops[name] || stops.photon;
    return function (t) {
      t = Math.max(0, Math.min(1, t));
      const seg = t * (s.length - 1);
      const i = Math.min(s.length - 2, Math.floor(seg));
      const f = seg - i;
      const a = s[i], b = s[i + 1];
      return [
        Math.round(a[0] + (b[0] - a[0]) * f),
        Math.round(a[1] + (b[1] - a[1]) * f),
        Math.round(a[2] + (b[2] - a[2]) * f),
      ];
    };
  }

  function drawHeatmap(canvas, data, size, cmapName, gamma) {
    gamma = gamma || 0.65;
    const ctx = canvas.getContext('2d');
    const off = document.createElement('canvas');
    off.width = size; off.height = size;
    const octx = off.getContext('2d');
    const img = octx.createImageData(size, size);
    const cmap = colormapLookup(cmapName);
    for (let p = 0; p < size * size; p++) {
      const t = Math.pow(data[p], gamma);
      const [r, g, b] = cmap(t);
      img.data[p * 4] = r; img.data[p * 4 + 1] = g; img.data[p * 4 + 2] = b; img.data[p * 4 + 3] = 255;
    }
    octx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(off, 0, 0, size, size, 0, 0, canvas.width, canvas.height);
  }

  // ---------- tiny power-of-two complex FFT (Cooley-Tukey, in-place) ----------
  function fft1d(re, im, invert) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = (invert ? 1 : -1) * 2 * Math.PI / len;
      const wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let curWr = 1, curWi = 0;
        for (let j = 0; j < len / 2; j++) {
          const ur = re[i + j], ui = im[i + j];
          const vr = re[i + j + len / 2] * curWr - im[i + j + len / 2] * curWi;
          const vi = re[i + j + len / 2] * curWi + im[i + j + len / 2] * curWr;
          re[i + j] = ur + vr; im[i + j] = ui + vi;
          re[i + j + len / 2] = ur - vr; im[i + j + len / 2] = ui - vi;
          const nWr = curWr * wr - curWi * wi;
          curWi = curWr * wi + curWi * wr;
          curWr = nWr;
        }
      }
    }
    if (invert) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
  }

  function fft2d(re, im, size, invert) {
    const rowRe = new Float64Array(size), rowIm = new Float64Array(size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) { rowRe[x] = re[y * size + x]; rowIm[x] = im[y * size + x]; }
      fft1d(rowRe, rowIm, invert);
      for (let x = 0; x < size; x++) { re[y * size + x] = rowRe[x]; im[y * size + x] = rowIm[x]; }
    }
    const colRe = new Float64Array(size), colIm = new Float64Array(size);
    for (let x = 0; x < size; x++) {
      for (let y = 0; y < size; y++) { colRe[y] = re[y * size + x]; colIm[y] = im[y * size + x]; }
      fft1d(colRe, colIm, invert);
      for (let y = 0; y < size; y++) { re[y * size + x] = colRe[y]; im[y * size + x] = colIm[y]; }
    }
  }

  // ---------- RK4 for generic ODE systems ----------
  function rk4Step(deriv, state, dt) {
    const n = state.length;
    const add = (a, b, h) => a.map((v, i) => v + b[i] * h);
    const k1 = deriv(state);
    const k2 = deriv(add(state, k1, dt / 2));
    const k3 = deriv(add(state, k2, dt / 2));
    const k4 = deriv(add(state, k3, dt));
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = state[i] + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
    return out;
  }

  // ---------- small DOM helpers ----------
  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function makeSlider(opts) {
    const wrap = el('label', 'lab-slider');
    const top = el('span', 'lab-slider-top');
    const name = el('span', 'lab-slider-name', opts.label);
    const val = el('span', 'lab-slider-val', opts.format ? opts.format(opts.value) : String(opts.value));
    top.appendChild(name); top.appendChild(val);
    const input = document.createElement('input');
    input.type = 'range';
    input.min = opts.min; input.max = opts.max; input.step = opts.step || 1; input.value = opts.value;
    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      val.textContent = opts.format ? opts.format(v) : String(v);
      opts.onInput && opts.onInput(v);
    });
    wrap.appendChild(top); wrap.appendChild(input);
    return { wrap, input, valEl: val };
  }

  function renderEquations(root) {
    const nodes = root.querySelectorAll('.lab-eq[data-tex]');
    nodes.forEach((node) => {
      const tex = node.getAttribute('data-tex');
      if (window.katex) {
        try { window.katex.render(tex, node, { throwOnError: false, displayMode: true }); return; }
        catch (e) { /* fall through */ }
      }
      node.textContent = tex;
    });
  }

  function catmullRomPath(pts) {
    if (pts.length < 2) return '';
    let d = `M ${pts[0][0]} ${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i === 0 ? i : i - 1];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2 < pts.length ? i + 2 : i + 1];
      const c1x = p1[0] + (p2[0] - p0[0]) / 6;
      const c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6;
      const c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${p2[0]} ${p2[1]}`;
    }
    return d;
  }

  // Opens a widget as a full-width modal dialog (inline expansion inside a narrow
  // 3-column card reads as an unusable vertical sliver, so the widget body is moved
  // into a centered overlay on open and moved back to its original spot on close).
  // Widgets read `container._labOpen` (not DOM ancestry) to know whether to keep animating.
  function lazyInit(panel, fn) {
    let done = false;
    const toggle = panel.querySelector('.lab-toggle');
    const body = panel.querySelector('.lab-body');
    const anchor = document.createComment('lab-body-anchor');
    const titleEl = panel.closest('.hl-text') && panel.closest('.hl-text').querySelector('h3');
    const titleText = titleEl ? titleEl.textContent : 'Interactive figure';

    const modal = el('div', 'lab-modal');
    modal.innerHTML = '<div class="lab-modal-card"><div class="lab-modal-head">' +
      '<span>' + titleText + '</span>' +
      '<button class="lab-modal-close" type="button" aria-label="Close">&times;</button>' +
      '</div><div class="lab-modal-content"></div></div>';
    const content = modal.querySelector('.lab-modal-content');
    const closeBtn = modal.querySelector('.lab-modal-close');

    function openModal() {
      body.parentNode.insertBefore(anchor, body);
      content.appendChild(body);
      document.body.appendChild(modal);
      document.documentElement.classList.add('lab-modal-lock');
      body._labOpen = true;
      panel.classList.add('open');
      toggle.setAttribute('aria-expanded', 'true');
      setTimeout(() => modal.classList.add('open'), 10);
      if (!done) { done = true; setTimeout(() => fn(body), 0); }
    }
    function closeModal() {
      if (!modal.classList.contains('open')) return;
      modal.classList.remove('open');
      body._labOpen = false;
      panel.classList.remove('open');
      document.documentElement.classList.remove('lab-modal-lock');
      toggle.setAttribute('aria-expanded', 'false');
      setTimeout(() => {
        if (anchor.parentNode) anchor.parentNode.replaceChild(body, anchor);
        if (modal.parentNode) modal.parentNode.removeChild(modal);
      }, 220);
    }
    toggle.addEventListener('click', () => {
      modal.classList.contains('open') ? closeModal() : openModal();
    });
    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal();
    });
  }

  global.Lab = {
    mulberry32, buildModeBasis, hermite,
    jacobiEigenSymmetric, propagateModes, buildBendMatrices, reconstructIntensity,
    colormapLookup, drawHeatmap, fft1d, fft2d, rk4Step,
    el, makeSlider, lazyInit, renderEquations, catmullRomPath,
  };
})(window);

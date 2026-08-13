# bahadirkesgin.github.io

Personal research portfolio: a static site (plain HTML/CSS/JS, no build step).

## Deploy to GitHub Pages

1. On GitHub, create a **public** repository named exactly **`bahadirkesgin.github.io`**
   (it must match your username so it serves at the root URL).
2. Put every file from this folder at the **root** of the repo (not in a subfolder):
   `index.html`, `style.css`, `script.js`, `favicon.svg`, `.nojekyll`, `README.md`, and the `assets/` folder.
3. Push to the `main` branch:
   ```bash
   git init
   git add .
   git commit -m "Initial portfolio"
   git branch -M main
   git remote add origin https://github.com/bahadirkesgin/bahadirkesgin.github.io.git
   git push -u origin main
   ```
4. In the repo: **Settings → Pages → Build and deployment → Source: Deploy from a branch**,
   Branch = `main`, folder = `/ (root)`. Save.
5. Wait ~1 minute, then open **https://bahadirkesgin.github.io**

To preview locally first: `python3 -m http.server` in this folder, then open http://localhost:8000

## Adding your images

Drop files into `assets/` with these exact names, and they appear automatically.
Until a file exists, a labeled placeholder box shows in its place (nothing breaks).

| File | Where it shows | Suggested size |
|---|---|---|
| `assets/Bahadir-Kesgin-CV.pdf` | the "CV" buttons | your CV PDF |
| `assets/headshot.jpeg` | Header portrait | ~800×1000, 4:5 |
| `assets/research/diffractive-mmf.png` | Fiber-D²NN highlight | ~1000×625, 16:10 |
| `assets/research/spatiotemporal-chaos.png` | Spatiotemporal chaos highlight | ~1000×625, 16:10 |
| `assets/research/chaotic-attractors.png` | Chaotic-attractor highlight | ~1000×625, 16:10 |
| `assets/research/optical-snn.png` | Rogue-wave spiking highlight | ~1000×625, 16:10 |
| `assets/research/fiber-rnn.png` | Fiber-loop RNN highlight | ~1000×625, 16:10 |
| `assets/research/imaging-685gfps.png` | Single-shot imaging highlight | ~1000×625, 16:10 |
| `assets/og-cover.png` | social-media share preview | 1200×630 |

## Interactive figures

Each of the six research highlight cards has an "Explore the interactive figure" button that opens a
small in-browser physics simulation (built with plain canvas/SVG + a shared toolkit in
`assets/js/lab-common.js`, one file per widget). They're illustrative, reduced-order stand-ins for the
real experiments, not reproductions of the papers' data.

## Editing content

All text lives in `index.html`. To change publications/talks, edit the lists there directly. Colors
and fonts are at the top of `style.css` under `:root`.

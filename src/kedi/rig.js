// =====================================================================
//  KEDİ İSKELETİ (2D mesh deformasyonu, Live2D benzeri)
//  Tek bir resmi üçgen ağına bölüp kemiklerle büküyoruz:
//  4 bacak, kafa, 3 parçalı kuyruk, 2 kulak, göz kapakları, gövde.
//  Koordinatlar 1024x1024 kaynak resmin pikselleri.
// =====================================================================
(() => {
  'use strict';
  const TEX = window.KEDI_TEX, OCC = window.KEDI_OCC;
  if (!TEX || !OCC) return;

  // ---------- ölçek / yerleşim ----------
  const K = 0.088;                       // ekran px / resim px
  const CX = 546, GROUND = 866;          // gövde merkezi x, patilerin bastığı y
  const FX0 = 0, FY0 = 20, FW = 1110, FH = 900;    // çizim çerçevesi (resim px)
  window.KEDI_RIG_INFO = { half: 359 * K, headDX: (760 - CX) * K, mouthDX: 25 };

  // ---------- anatomi ----------
  const LEGS = [
    { id: 'BN', near: true,  piv: [305, 640], top: [302, 700], paw: [318, 846], sep: 728, ph: 0.00 },
    { id: 'BF', near: false, piv: [440, 655], top: [425, 705], paw: [470, 806], sep: 728, ph: 0.50 },
    { id: 'FN', near: true,  piv: [600, 635], top: [600, 695], paw: [640, 860], sep: 694, ph: 0.25 },
    { id: 'FF', near: false, piv: [705, 630], top: [705, 690], paw: [712, 840], sep: 694, ph: 0.75 },
  ];
  const NECK = [662, 468];
  const HEAD_A = [555, 392], HEAD_B = [825, 505];     // kafa/gövde ayrım çizgisi
  const TAIL_C = [362, 395], TAIL_D = [252, 508];     // kuyruk/kalça ayrım çizgisi
  const TJ = [[300, 470], [256, 362], [229, 262], [240, 148]]; // kuyruk eklemleri
  const EARS = [
    { piv: [652, 292], c: [632, 228], r0: 48, r1: 82 },
    { piv: [800, 246], c: [812, 205], r0: 30, r1: 56 },
  ];
  const EYES = [
    { c: [750, 362], rx: 33, ry: 37 },
    { c: [840, 352], rx: 17, ry: 33 },
  ];

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;
  const D2R = Math.PI / 180;

  // ön iki bacak arasındaki kontur (resimden ölçüldü)
  const FF_EDGE = [[600, 664], [680, 662], [760, 657], [810, 662], [835, 670], [845, 690], [880, 700]];
  function ffEdge(y) {
    for (let i = 1; i < FF_EDGE.length; i++) {
      if (y <= FF_EDGE[i][0]) {
        const [y0, x0] = FF_EDGE[i - 1], [y1, x1] = FF_EDGE[i];
        return lerp(x0, x1, clamp((y - y0) / (y1 - y0), 0, 1));
      }
    }
    return FF_EDGE[FF_EDGE.length - 1][1];
  }
  // x'e göre hangi bacak + o bacağın yatay sınırları
  function legAt(x, y) {
    const ff = ffEdge(y);
    let i, lo, hi;
    if (x < 382) { i = 0; lo = 252; hi = 374; }
    else if (x < 522) { i = 1; lo = 390; hi = 512; }
    else if (x < ff) { i = 2; lo = 530; hi = ff; }
    else { i = 3; lo = ff; hi = 762; }
    if (y < LEGS[i].top[1] - 118) return null;
    const out = Math.max(0, lo - x, x - hi);
    return { i, h: 1 - smooth(4, 30, out) };
  }
  function sideDist(A, B, x, y) {
    const dx = B[0] - A[0], dy = B[1] - A[1];
    return -(dx * (y - A[1]) - dy * (x - A[0])) / Math.hypot(dx, dy);
  }
  // kuyruk boyunca konum
  const TS = [0]; for (let i = 1; i < TJ.length; i++) TS.push(TS[i - 1] + Math.hypot(TJ[i][0] - TJ[i - 1][0], TJ[i][1] - TJ[i - 1][1]));
  function tailS(x, y) {
    let best = 1e9, bs = 0;
    for (let i = 0; i < TJ.length - 1; i++) {
      const [ax, ay] = TJ[i], [bx, by] = TJ[i + 1];
      const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy;
      const t = clamp(((x - ax) * vx + (y - ay) * vy) / l2, 0, 1);
      const d = Math.hypot(x - ax - vx * t, y - ay - vy * t);
      if (d < best) { best = d; bs = TS[i] + t * Math.sqrt(l2); }
    }
    return bs;
  }

  // ---------- ağı kur ----------
  const step = OCC.step, n = OCC.n, bits = OCC.bits;
  const vmap = new Map();
  const V = { x: [], y: [], key: [] };
  function vert(gx, gy, key) {
    const k = gx + ',' + gy + ',' + key;
    let id = vmap.get(k);
    if (id === undefined) { id = V.x.length; vmap.set(k, id); V.x.push(gx * step); V.y.push(gy * step); V.key.push(key); }
    return id;
  }
  const tris = [];
  for (let gy = 0; gy < n; gy++) for (let gx = 0; gx < n; gx++) {
    if (bits.charCodeAt(gy * n + gx) !== 49) continue;
    const cx = (gx + 0.5) * step, cy = (gy + 0.5) * step;
    const nl = legAt(cx, cy);
    const leg = nl && nl.h > 0.5 && cy > LEGS[nl.i].sep ? nl.i : -1;
    const kf = (vy) => (leg >= 0 && vy > LEGS[leg].sep ? leg : -1);
    const a = vert(gx, gy, kf(gy * step)), b = vert(gx + 1, gy, kf(gy * step));
    const c = vert(gx, gy + 1, kf((gy + 1) * step)), d = vert(gx + 1, gy + 1, kf((gy + 1) * step));
    tris.push([a, b, d], [a, d, c]);
  }
  const NV = V.x.length;
  const RX = new Float32Array(V.x), RY = new Float32Array(V.y);

  // ağırlıklar
  const WL = [new Float32Array(NV), new Float32Array(NV), new Float32Array(NV), new Float32Array(NV)];
  const WH = new Float32Array(NV), WT = new Float32Array(NV), ST = new Float32Array(NV);
  const WE = [new Float32Array(NV), new Float32Array(NV)];
  for (let i = 0; i < NV; i++) {
    const x = RX[i], y = RY[i], key = V.key[i];
    let legSum = 0;
    if (key >= 0) { WL[key][i] = 1; legSum = 1; }
    else {
      const nl = legAt(x, y);
      if (nl) {
        const L = LEGS[nl.i];
        const w = smooth(L.top[1] - 115, L.top[1] - 2, y) * nl.h;
        WL[nl.i][i] = w; legSum = w;
      }
    }
    const rest = 1 - legSum;
    WH[i] = smooth(-28, 28, sideDist(HEAD_A, HEAD_B, x, y)) * smooth(520, 585, x) * rest;
    WT[i] = smooth(-18, 22, sideDist(TAIL_D, TAIL_C, x, y)) * (1 - smooth(345, 395, x)) * rest;
    ST[i] = WT[i] > 0 ? tailS(x, y) : 0;
    for (let e = 0; e < 2; e++) {
      const E = EARS[e];
      WE[e][i] = (1 - smooth(E.r0, E.r1, Math.hypot(x - E.c[0], y - E.c[1]))) * (y < E.piv[1] + 10 ? 1 : 0);
    }
  }

  // çizim sırası: uzak bacaklar < kuyruk < gövde < kafa < yakın bacaklar
  const layered = tris.map((t) => {
    let far = 0, near = 0, h = 0, tl = 0;
    for (const v of t) {
      far += WL[1][v] + WL[3][v]; near += WL[0][v] + WL[2][v]; h += WH[v]; tl += WT[v];
    }
    const L = far > 1.5 ? 0 : near > 1.5 ? 4 : h > 1.5 ? 3 : tl > 1.5 ? 1 : 2;
    return { t, L };
  });
  layered.sort((a, b) => a.L - b.L);
  const IDX = new Uint16Array(layered.length * 3);
  layered.forEach((o, j) => { IDX[j * 3] = o.t[0]; IDX[j * 3 + 1] = o.t[1]; IDX[j * 3 + 2] = o.t[2]; });

  // ---------- canvas / WebGL ----------
  const catEl = document.getElementById('cat');
  const inner = document.getElementById('catInner');
  const dpr = Math.max(2, window.devicePixelRatio || 1);
  const cssW = FW * K, cssH = FH * K;
  const canvas = document.createElement('canvas');
  canvas.className = 'rig';
  canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
  Object.assign(canvas.style, {
    position: 'absolute', width: cssW + 'px', height: cssH + 'px',
    left: (32 - (CX - FX0) * K) + 'px', top: (64 - (GROUND - FY0) * K + 0.5) + 'px',
    pointerEvents: 'none',
  });
  inner.appendChild(canvas);

  const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: true });
  const POS = new Float32Array(NV * 2);
  let ready = false, draw2d = null;

  if (gl) {
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, `
      attribute vec2 aPos; attribute vec2 aUV; uniform vec4 uF; varying vec2 vUV;
      void main(){ vec2 p=(aPos-uF.xy)/uF.zw; gl_Position=vec4(p.x*2.0-1.0,1.0-p.y*2.0,0.0,1.0); vUV=aUV; }`));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, `
      precision mediump float; uniform sampler2D uT; varying vec2 vUV;
      void main(){ gl_FragColor=texture2D(uT,vUV); }`));
    gl.linkProgram(prog); gl.useProgram(prog);

    const uv = new Float32Array(NV * 2);
    for (let i = 0; i < NV; i++) { uv[i * 2] = RX[i] / 1024; uv[i * 2 + 1] = RY[i] / 1024; }
    const bUV = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bUV); gl.bufferData(gl.ARRAY_BUFFER, uv, gl.STATIC_DRAW);
    const aUV = gl.getAttribLocation(prog, 'aUV'); gl.enableVertexAttribArray(aUV); gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, 0, 0);
    var bPos = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bPos); gl.bufferData(gl.ARRAY_BUFFER, POS, gl.DYNAMIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'aPos'); gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    const bI = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bI); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, IDX, gl.STATIC_DRAW);
    gl.uniform4f(gl.getUniformLocation(prog, 'uF'), FX0, FY0, FW, FH);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.viewport(0, 0, canvas.width, canvas.height);

    const img = new Image();
    img.onload = () => {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      ready = true;
      document.documentElement.classList.add('rig-mode');
    };
    img.src = TEX;
    draw2d = () => {
      gl.bindBuffer(gl.ARRAY_BUFFER, bPos); gl.bufferSubData(gl.ARRAY_BUFFER, 0, POS);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawElements(gl.TRIANGLES, IDX.length, gl.UNSIGNED_SHORT, 0);
    };
  } else {
    // WebGL yoksa: hareketsiz resim
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, FX0, FY0, FW, FH, 0, 0, canvas.width, canvas.height);
      document.documentElement.classList.add('rig-mode');
    };
    img.src = TEX;
  }

  // ---------- poz parametreleri (yumuşak geçişli) ----------
  const P = {
    walk: 0, run: 0, head: 0, bodyDy: 0, tilt: 0, blink: 0, breathe: 0,
    t0: 0, t1: 0, t2: 0, tailAmp: 1, tailFreq: 1.3,
    earN: 0, earF: 0,
    lo: [0, 0, 0, 0], lock: [1, 1, 1, 1], ls: [1, 1, 1, 1],
  };
  const T = JSON.parse(JSON.stringify(P));
  let time = 0, phase = 0;

  function targets() {
    const c = catEl.classList;
    const k = (window.__kedi && window.__kedi.cat) || { y: 0, speed: 30 };
    const air = k.y < -1.5;
    const walking = c.contains('walk') && !air;
    const sleep = c.contains('sleep'), eat = c.contains('eat'), groom = c.contains('groom');
    const happy = c.contains('happy'), crouch = c.contains('crouch'), bat = c.contains('bat');
    const look = c.contains('lookup'), land = c.contains('land');

    T.walk = walking ? 1 : 0;
    T.run = walking && k.speed > 60 ? 1 : 0;
    T.head = sleep ? 22 : eat ? 40 : groom ? 26 : look ? -15 : bat ? 6 : crouch ? 6 : happy ? 0 : 0;
    T.bodyDy = sleep ? 150 : eat ? 34 : groom ? 30 : land ? 40 : crouch ? 48 : bat ? 22 : happy ? 8 : 0;
    T.tilt = eat ? 9 : sleep ? -2 : crouch ? 1.5 : 0;
    T.blink = (sleep || eat || groom || happy || c.contains('blink')) ? 1 : 0;
    T.t0 = sleep ? -98 : crouch ? -38 : air ? -22 : walking ? -4 : 0;
    T.t1 = sleep ? -34 : crouch ? -10 : 0;
    T.t2 = sleep ? -28 : crouch ? 8 : 0;
    T.tailAmp = sleep ? 0.15 : happy ? 1.7 : crouch ? 1.4 : walking ? 1.2 : 1;
    T.tailFreq = sleep ? 0.6 : happy ? 3.4 : crouch ? 6 : walking ? 2.4 : 1.3;
    T.earN = crouch ? -14 : c.contains('twitch') ? -15 : sleep ? -6 : 0;
    T.earF = crouch ? 12 : c.contains('twitch') ? 9 : sleep ? 6 : 0;
    for (let i = 0; i < 4; i++) { T.lo[i] = 0; T.lock[i] = air ? 0 : 1; T.ls[i] = 1; }
    if (air) { T.lo[0] = 24; T.lo[1] = 20; T.lo[2] = -26; T.lo[3] = -22; }
    if (bat) { T.lo[2] = -78; T.lock[2] = 0; T.ls[2] = 0.86; }
    if (groom) { T.lo[2] = -112 + 7 * Math.sin(time * 13); T.lock[2] = 0; T.ls[2] = 0.88; }
    if (sleep) { T.lo[0] = -14; T.lo[1] = -10; T.lo[2] = 14; T.lo[3] = 10; }
  }

  const ease = (a, b, r, dt) => a + (b - a) * (1 - Math.exp(-r * dt));
  function settle(dt) {
    for (const key of Object.keys(T)) {
      if (Array.isArray(T[key])) for (let i = 0; i < 4; i++) P[key][i] = ease(P[key][i], T[key][i], 11, dt);
      else P[key] = ease(P[key], T[key], key === 'blink' ? 38 : key === 'walk' || key === 'run' ? 7 : 9, dt);
    }
  }

  // ---------- deformasyon ----------
  function rot(px, py, cx, cy, a) {
    const s = Math.sin(a), c = Math.cos(a), x = px - cx, y = py - cy;
    return [cx + x * c - y * s, cy + x * s + y * c];
  }

  function deform() {
    // yürüyüş döngüsü
    const amp = lerp(15, 25, P.run) * P.walk, lift = lerp(26, 40, P.run) * P.walk;
    const bob = lerp(5, 12, P.run) * P.walk * (0.5 - 0.5 * Math.cos(phase * 4 * Math.PI));
    const legA = [], legLift = [];
    for (let i = 0; i < 4; i++) {
      const ph = 2 * Math.PI * (phase + (P.run > 0.5 ? (i < 2 ? 0 : 0.5) + (i % 2) * 0.12 : LEGS[i].ph));
      legA.push((P.lo[i] - amp * Math.sin(ph)) * D2R);
      legLift.push(lift * Math.max(0, Math.cos(ph)));
    }
    // gövde dönüşümü B
    const br = Math.sin(time * 2 * Math.PI / 3.3) * (1 - P.walk * 0.6);
    const sx = 1 + 0.006 * br, sy = 1 + 0.014 * br;
    const tilt = P.tilt * D2R, ct = Math.cos(tilt), st = Math.sin(tilt);
    const dy = P.bodyDy - bob;
    const B = (x, y) => {
      x = 500 + (x - 500) * sx; y = 600 + (y - 600) * sy;
      const ax = x - 330, ay = y - 640;
      return [330 + ax * ct - ay * st, 640 + ax * st + ay * ct + dy];
    };
    // bacak dönüşümleri
    const LT = LEGS.map((L, i) => {
      const pv = B(L.piv[0], L.piv[1]);
      const len = L.paw[1] - L.piv[1];
      const fl = (L.paw[1] - legLift[i] - pv[1]) / len;
      const f = lerp(1 - legLift[i] / len * 0.6, fl, P.lock[i]) * P.ls[i];
      return { pv, f: Math.max(0.12, f), c: Math.cos(legA[i]), s: Math.sin(legA[i]) };
    });
    const headA = (P.head + (P.blink > 0.5 && catEl.classList.contains('eat') ? 3 * Math.sin(time * 18) : 0)
      + (catEl.classList.contains('happy') ? 6 * Math.sin(time * 1.7) : 0)) * D2R;
    const tw = time * P.tailFreq;
    const ta = [
      (P.t0 + 5 * P.tailAmp * Math.sin(tw)) * D2R,
      (P.t1 + 9 * P.tailAmp * Math.sin(tw - 0.7)) * D2R,
      (P.t2 + 13 * P.tailAmp * Math.sin(tw - 1.4)) * D2R,
    ];
    const earA = [P.earN * D2R, P.earF * D2R];
    const blink = P.blink;

    for (let i = 0; i < NV; i++) {
      let x = RX[i], y = RY[i];
      // göz kapağı
      if (blink > 0.02) {
        for (const E of EYES) {
          const ex = (x - E.c[0]) / (E.rx * 1.35), ey = (y - E.c[1]) / (E.ry * 1.4);
          const d = ex * ex + ey * ey;
          if (d < 1) { const lid = E.c[1] + E.ry * 0.72; y += (lid - y) * blink * (1 - smooth(0.5, 1, d)); }
        }
      }
      // kulaklar
      for (let e = 0; e < 2; e++) {
        const w = WE[e][i];
        if (w > 0 && earA[e]) { const r = rot(x, y, EARS[e].piv[0], EARS[e].piv[1], earA[e]); x += (r[0] - x) * w; y += (r[1] - y) * w; }
      }
      // kuyruk (uçtan köke doğru eklem eklem)
      const wt = WT[i];
      if (wt > 0) {
        let px = x, py = y; const s = ST[i];
        for (let j = 2; j >= 0; j--) {
          const h = smooth(TS[j] - 22, TS[j] + 22, s);
          if (h > 0) { const r = rot(px, py, TJ[j][0], TJ[j][1], ta[j] * h); px = r[0]; py = r[1]; }
        }
        x += (px - x) * wt; y += (py - y) * wt;
      }
      // kafa
      const wh = WH[i];
      if (wh > 0 && headA) { const r = rot(x, y, NECK[0], NECK[1], headA); x += (r[0] - x) * wh; y += (r[1] - y) * wh; }
      // gövde + bacaklar
      const b = B(x, y);
      let ox = 0, oy = 0, ws = 0;
      for (let k = 0; k < 4; k++) {
        const w = WL[k][i];
        if (w <= 0) continue;
        const L = LEGS[k], M = LT[k];
        const lx = x - L.piv[0], ly = (y - L.piv[1]) * M.f;
        ox += w * (M.pv[0] + lx * M.c - ly * M.s);
        oy += w * (M.pv[1] + lx * M.s + ly * M.c);
        ws += w;
      }
      POS[i * 2] = b[0] * (1 - ws) + ox;
      POS[i * 2 + 1] = b[1] * (1 - ws) + oy;
    }
  }

  // boyut değişince (zoom) çözünürlüğü güncelle, bulanık kalmasın
  let curDpr = dpr;
  function fitCanvas() {
    const d = Math.max(2, window.devicePixelRatio || 1);
    if (d === curDpr) return;
    curDpr = d;
    canvas.width = Math.round(cssW * d); canvas.height = Math.round(cssH * d);
    if (gl) gl.viewport(0, 0, canvas.width, canvas.height);
  }

  window.__catTick = (dt) => {
    if (!ready || !draw2d) return;
    fitCanvas();
    time += dt;
    const k = (window.__kedi && window.__kedi.cat) || { speed: 30 };
    targets(); settle(dt);
    phase = (phase + dt * lerp(1.5, 3.2, P.run) * (0.4 + 0.6 * P.walk) * (k.speed > 0 ? clamp(k.speed / 34, 0.8, 1.6) : 1)) % 1;
    deform();
    draw2d();
  };
})();

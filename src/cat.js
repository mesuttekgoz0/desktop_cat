(() => {
  'use strict';

  const A = window.AYAR || {};
  document.documentElement.dataset.renk = A.renk || 'turuncu';

  const $ = (s) => document.querySelector(s);
  const app = $('#app'), nest = $('#nest'), catEl = $('#cat'), catInner = $('#catInner');
  const yarnEl = $('#yarn'), bowlEl = $('#bowl'), laserEl = $('#laser'), bubbleEl = $('#bubble');
  const fx = $('#fx'), menuEl = $('#menu');
  const shadowEl = $('#shadow'), yarnShadowEl = $('#yarnShadow');
  const api = window.kedi || null;

  // ---- sabitler ----
  const NEST = 140, FLOOR = 124;          // ayakların bastığı çizgi
  const CAT_W = 64, CAT_H = 64;
  const BED_X = 38, BOWL_X = 102;
  const RIG = window.KEDI_RIG_INFO || null;
  const HALF = RIG ? RIG.half : 32;
  const MIN_X = Math.max(36, HALF + 3), MAX_X = Math.min(104, NEST - HALF - 3);
  const HEAD_DX = RIG ? RIG.headDX : 0;          // kafanın gövde merkezine uzaklığı
  const MOUTH_DX = RIG ? RIG.mouthDX : 25;
  const G = 900;                           // yerçekimi px/s²
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const sign = (v) => (v < 0 ? -1 : 1);

  // ---- kalıcı durum ----
  const store = (() => {
    let s = { tokluk: 80, ts: Date.now() };
    try { s = Object.assign(s, JSON.parse(localStorage.getItem('kedicik') || '{}')); } catch (_) {}
    const hrs = (Date.now() - s.ts) / 3.6e6;
    s.tokluk = clamp(s.tokluk - hrs * 6, 0, 100); // saatte ~6 puan acıkır
    return s;
  })();
  const save = () => { store.ts = Date.now(); try { localStorage.setItem('kedicik', JSON.stringify(store)); } catch (_) {} };
  save();

  // ---- kedi ----
  // vx: gerçek yatay hız (hızlanma/yavaşlama ile), vel: |vx| (iskelet adım hızı için)
  const cat = { x: 70, y: 0, vx: 0, vel: 0, vy: 0, dir: 1, mode: 'idle', target: null, speed: 30, onArrive: null, busyUntil: 0 };
  // dönüş animasyonu: s = görünen yön (-1..1), t = ilerleme (0..1)
  // kind: 'back' → arkasını dönerek (kareli), 'squash' → daralıp aynalanarak
  const turn = { s: 1, from: 1, to: 1, t: 1, kind: 'squash', dur: 0.3 };
  const TURN_DUR = 0.3;          // daralma dönüşü
  const BACK_TURN_DUR = 0.5;     // arkadan dönüş: yan → arka-3/4 → arka → arka-3/4 → yan
  const BACK_WALK_AT = 0.85;     // arkadan dönüşte yürümeye bu noktadan sonra başla

  // arkadan dönüş kareleri (src/kedi/donus-veri.js, sağa bakan kedi için çizili)
  const DONUS = window.KEDI_DONUS || null;
  const sprites = {};
  if (DONUS) {
    for (const name of ['back34', 'back', 'front']) {
      const d = DONUS[name];
      if (!d) continue;
      const im = new Image();
      im.className = 'turn-sprite';
      im.id = 'turn-' + name;
      im.src = d.src;
      im.style.width = d.w + 'px'; im.style.height = d.h + 'px';
      im.style.marginLeft = (-d.w / 2) + 'px';
      im.decode && im.decode().catch(() => {});
      catEl.appendChild(im);
      sprites[name] = im;
    }
  }
  // Kareler ayakta duran kediyi gösterir; çömelmiş, havada ya da oyun kovalıyorken
  // tuhaf durur → o durumlarda daralma dönüşü kullanılır.
  const NO_SPRITE_POSES = ['crouch', 'lookup', 'bat', 'eat', 'sleep', 'groom', 'land', 'happy'];
  function canBackTurn() {
    if (!DONUS || cat.y < 0 || cat.mode === 'play' || cat.mode === 'laser') return false;
    for (const p of NO_SPRITE_POSES) if (posed(p)) return false;
    return true;
  }

  // ---- sana bakma (ön görünüş): sevilince / tıklanınca ----
  // p: 0 = yan, 1 = tam karşıya bakıyor; until: bu ana kadar bakmaya devam et
  const face = { p: 0, until: 0 };
  const FACE_DUR = 0.36;          // yan → ön geçişi (sn)
  function canFace() {
    if (!sprites.front || cat.mode !== 'idle' || cat.y < 0) return false;
    for (const p of ['crouch', 'lookup', 'bat', 'eat', 'sleep', 'groom', 'land']) if (posed(p)) return false;
    return true;
  }
  function lookAtMe(ms) {
    if (!canFace()) return;
    face.until = Math.max(face.until, now + ms);
    stopWalk();
  }
  const ACC = 260;        // kalkış ivmesi (px/s²)
  const DEC = 420;        // fren (dur komutu, yön değişimi)
  const ARRIVE = 150;     // hedefe yaklaşırken yavaş yavaş süzülerek durma
  let now = performance.now();
  let lastInteract = Date.now();
  const touch = () => { lastInteract = Date.now(); };

  const pose = (name, on = true) => catEl.classList.toggle(name, on);
  const posed = (name) => catEl.classList.contains(name);

  function walkTo(x, speed = 30, cb = null) {
    cat.target = clamp(x, MIN_X, MAX_X);
    cat.speed = speed;
    cat.onArrive = cb;
    catEl.style.setProperty('--wd', speed > 70 ? '.24s' : speed > 45 ? '.32s' : '.46s');
  }
  // hedefi bırakır; kedi kayarak değil birkaç pikselde yavaşlayarak durur
  function stopWalk() { cat.target = null; cat.onArrive = null; }
  function jump(v = -200) { if (cat.y === 0) cat.vy = v; }

  // ---- efektler ----
  const HEART = '<svg viewBox="0 0 20 18"><path d="M10 16 C4 12 1.5 8.8 1.5 6 C1.5 3.4 3.6 1.5 6 1.5 C7.7 1.5 9 2.5 10 4 C11 2.5 12.3 1.5 14 1.5 C16.4 1.5 18.5 3.4 18.5 6 C18.5 8.8 16 12 10 16Z"/></svg>';
  function heart() {
    const h = document.createElement('div');
    h.className = 'heart';
    h.innerHTML = HEART;
    const headX = face.p > 0.5 ? 0 : cat.dir * (HEAD_DX || 14);   // karşıya bakıyorsa kafa ortada
    h.style.left = (cat.x + headX + rand(-6, 6)) + 'px';
    h.style.top = (FLOOR - CAT_H + 10 + cat.y) + 'px';
    h.style.setProperty('--dx', rand(-12, 12) + 'px');
    fx.appendChild(h);
    setTimeout(() => h.remove(), 1500);
  }
  function hearts(n = 4, gap = 220) { for (let i = 0; i < n; i++) setTimeout(heart, i * gap); }

  let bubbleT = null;
  function bubble(text, ms = 2800) {
    bubbleEl.textContent = text;
    bubbleEl.classList.add('on');
    const w = bubbleEl.offsetWidth || 60;
    const x = clamp(cat.x + cat.dir * 10, w / 2 + 6, NEST - w / 2 - 6);
    bubbleEl.style.left = x + 'px';
    clearTimeout(bubbleT);
    bubbleT = setTimeout(() => bubbleEl.classList.remove('on'), ms);
  }

  // ---- etkinlik zamanlayıcıları ----
  // Bir etkinliğe (yemek, yumak, lazer...) ait gecikmeli işler buradan kurulur.
  // Yeni etkinlik başlayınca endActivities() hepsini iptal eder; böylece eski
  // etkinliğin geç kalan bir adımı yenisinin durumunu bozamaz.
  const actTimers = new Set();
  function later(ms, fn) {
    const id = setTimeout(() => { actTimers.delete(id); fn(); }, ms);
    actTimers.add(id);
    return id;
  }
  function cancelLater() { actTimers.forEach(clearTimeout); actTimers.clear(); }

  // ---- göz kırpma & kulak ----
  (function blinkLoop() {
    if (!posed('sleep') && !posed('happy')) {
      pose('blink'); setTimeout(() => pose('blink', false), 130);
      if (Math.random() < 0.25) setTimeout(() => { pose('blink'); setTimeout(() => pose('blink', false), 110); }, 260);
    }
    setTimeout(blinkLoop, rand(1800, 5200));
  })();
  (function earLoop() {
    if (Math.random() < 0.6) { pose('twitch'); setTimeout(() => pose('twitch', false), 220); }
    setTimeout(earLoop, rand(4000, 11000));
  })();

  // ====================================================
  //  YUMAK
  // ====================================================
  const yarn = { on: false, x: 0, y: 0, vx: 0, vy: 0, rot: 0, r: 8.5, bats: 0, goal: 6, born: 0, fadeAt: 0 };

  function dropYarn() {
    endActivities();
    wake();
    yarn.on = true;
    yarn.x = rand(30, 110); yarn.y = -14; yarn.vx = rand(-30, 30); yarn.vy = 0;
    yarn.bats = 0; yarn.goal = Math.round(rand(5, 8)); yarn.born = now; yarn.fadeAt = 0;
    yarnEl.classList.add('on');
    cat.mode = 'play';
    cat.busyUntil = now + 350;
  }

  function kickYarn(dir) {
    yarn.vx = dir * rand(120, 220);
    yarn.vy = -rand(150, 260);
    yarn.y -= 1;
  }

  function updateYarn(dt) {
    if (!yarn.on) return;
    yarn.vy += G * dt;
    yarn.x += yarn.vx * dt;
    yarn.y += yarn.vy * dt;
    const ground = FLOOR - yarn.r;
    if (yarn.y >= ground) {
      yarn.y = ground;
      yarn.vy = Math.abs(yarn.vy) > 70 ? -yarn.vy * 0.45 : 0;
      yarn.vx *= Math.pow(0.22, dt);
      if (Math.abs(yarn.vx) < 2) yarn.vx = 0;
    }
    const lo = 9 + yarn.r, hi = NEST - 9 - yarn.r;
    if (yarn.x < lo) { yarn.x = lo; yarn.vx = Math.abs(yarn.vx) * 0.6; }
    if (yarn.x > hi) { yarn.x = hi; yarn.vx = -Math.abs(yarn.vx) * 0.6; }
    yarn.rot += (yarn.vx * dt / yarn.r) * 57.3;

    if (yarn.fadeAt && now > yarn.fadeAt) { yarn.on = false; yarnEl.classList.remove('on'); }
  }

  function playThink() {
    if (!yarn.on) { cat.mode = 'idle'; return; }
    if (now < cat.busyUntil) return;

    const onGround = yarn.y >= FLOOR - yarn.r - 0.5 && yarn.vy === 0;
    const dx = yarn.x - cat.x;
    const face = sign(dx);
    const reach = 25;
    const slow = Math.abs(yarn.vx) < 35;

    // yeterince oynadı mı?
    if (yarn.bats >= yarn.goal || now - yarn.born > 30000) {
      stopWalk(); pose('crouch', false); pose('lookup', false);
      cat.mode = 'idle';
      cat.dir = face;
      yarn.fadeAt = now + 9000;
      pose('happy'); hearts(4); later(1800, () => pose('happy', false));
      if (Math.random() < 0.5) later(400, () => bubble('çok eğlendim! 🧶'));
      return;
    }

    if (!onGround) {
      // havadaki yumağı izle
      if (Math.abs(dx) > 8) cat.dir = face;
      stopWalk();
      pose('crouch', true);
      pose('lookup', yarn.y < FLOOR - 40);
      return;
    }
    pose('lookup', false);

    const dist = Math.abs(dx);
    if (dist > reach + 5) {
      pose('crouch', dist < 55);
      walkTo(yarn.x - face * reach, slow ? 55 : 80);
      // sıçrayıp üstüne atlama
      if (slow && dist > 38 && dist < 62 && cat.y === 0 && Math.random() < 0.025) {
        jump(-210);
        walkTo(yarn.x - face * reach, 120);
      }
    } else if (slow) {
      stopWalk();
      cat.dir = face;
      batYarn(face);
    }
  }

  function batYarn(face) {
    cat.busyUntil = now + 800;
    pose('crouch', true);
    later(260, () => {
      pose('bat', true);
      if (yarn.on && Math.abs(yarn.x - cat.x) < 40) { kickYarn(face); yarn.bats++; }
    });
    later(560, () => { pose('bat', false); pose('crouch', false); });
  }

  // ====================================================
  //  MAMA
  // ====================================================
  let bowlX = 30;
  function feed() {
    endActivities();
    wake();
    bowlX = BOWL_X;
    bowlEl.style.left = bowlX + 'px';
    bowlEl.classList.add('on', 'full');
    cat.mode = 'food';
    later(450, () => {
      walkTo(bowlX - MOUTH_DX, 48, () => {
        if (cat.mode !== 'food') return;
        cat.dir = 1;
        cat.mode = 'eat';
        pose('eat');
        later(3800, () => {
          pose('eat', false);
          bowlEl.classList.remove('full');
          store.tokluk = 100; save();
          cat.mode = 'idle';
          pose('happy'); hearts(5);
          later(900, () => { pose('happy', false); bubble(Math.random() < .5 ? 'mmm, nefisti 😋' : 'karnım doydu 😽'); });
          later(3200, () => bowlEl.classList.remove('on'));
        });
      });
    });
  }

  // ====================================================
  //  LAZER
  // ====================================================
  const laser = { on: false, visible: false, x: 70, y: 80, until: 0 };
  function startLaser() {
    endActivities();
    wake();
    laser.on = true; laser.until = now + 15000; laser.visible = false;
    cat.mode = 'laser';
    app.classList.add('laser-on');
    menuBtn('laser', true);
  }
  function stopLaser() {
    if (!laser.on) return;
    laser.on = false; laser.visible = false;
    laserEl.classList.remove('on');
    app.classList.remove('laser-on');
    menuBtn('laser', false);
    pose('crouch', false); pose('lookup', false);
    if (cat.mode === 'laser') cat.mode = 'idle';
  }
  // süre dolunca: mutlu bitiş
  function finishLaser() {
    stopLaser(); stopWalk();
    pose('happy'); hearts(3); later(1500, () => pose('happy', false));
  }
  function laserThink() {
    if (!laser.visible) { stopWalk(); pose('crouch', false); pose('lookup', false); return; }
    if (now < cat.busyUntil) return;
    const dx = laser.x - cat.x;
    const face = sign(dx);
    pose('lookup', laser.y < FLOOR - 45);
    if (Math.abs(dx) > 20) {
      pose('crouch', true);
      walkTo(laser.x - face * 18, 90);
    } else {
      stopWalk();
      cat.dir = face;
      if (laser.y < FLOOR - 30 && cat.y === 0 && Math.random() < 0.05) { jump(-240); cat.busyUntil = now + 500; }
      else if (Math.random() < 0.05) {
        cat.busyUntil = now + 450;
        pose('bat'); setTimeout(() => pose('bat', false), 260);
      }
    }
  }

  // ====================================================
  //  UYKU
  // ====================================================
  function sleep() {
    endActivities();
    stopWalk();
    pose('crouch', false); pose('lookup', false); pose('happy', false); pose('groom', false);
    cat.mode = 'tobed';
    menuBtn('sleep', true, '☀️');
    walkTo(BED_X, 30, () => {
      if (cat.mode !== 'tobed') return;
      cat.mode = 'sleep';
      cat.dir = 1;
      pose('sleep');
      nest.classList.add('dim');
    });
  }
  function wake() {
    if (cat.mode === 'tobed') { stopWalk(); cat.mode = 'idle'; menuBtn('sleep', false, '🌙'); return; }
    if (cat.mode !== 'sleep') return;
    pose('sleep', false);
    nest.classList.remove('dim');
    cat.mode = 'idle';
    menuBtn('sleep', false, '🌙');
  }

  // Yeni bir etkinlikten önce her şeyi temiz bir duruma getirir.
  function endActivities() {
    cancelLater();
    face.until = 0;
    stopLaser();
    if (yarn.on && !yarn.fadeAt) yarn.fadeAt = now + 600;
    bowlEl.classList.remove('on', 'full');
    if (cat.mode === 'tobed') menuBtn('sleep', false, '🌙');
    if (cat.mode !== 'sleep') cat.mode = 'idle';
    stopWalk();
    for (const p of ['eat', 'crouch', 'lookup', 'bat', 'groom', 'happy']) pose(p, false);
    cat.busyUntil = 0;
  }

  // ====================================================
  //  BOŞTA
  // ====================================================
  let nextWander = performance.now() + 3500;
  let nextNag = performance.now() + 20000;
  function isNight() { const h = new Date().getHours(); return h >= 0 && h < 7; }

  function idleThink() {
    if (cat.target != null || now < nextWander) {
      // açlık
      if (store.tokluk < 35 && now > nextNag && cat.target == null) {
        nextNag = now + rand(40000, 70000);
        bubble(`${A.isim || 'kedi'} acıktı 🐟`);
      }
      return;
    }
    nextWander = now + rand(5000, 13000);
    const idleFor = Date.now() - lastInteract;

    if ((isNight() && idleFor > 60e3) || idleFor > 25 * 60e3) {
      if (Math.random() < 0.6) { sleep(); return; }
    }
    const r = Math.random();
    if (r < 0.55) walkTo(rand(MIN_X, MAX_X), rand(24, 34));
    else if (r < 0.75) cat.dir *= -1;
    else if (r < 0.85) { pose('lookup'); later(1400, () => pose('lookup', false)); }
    else if (r < 0.92) { jump(-150); }
    else { stopWalk(); pose('groom'); nextWander = now + 4200; later(2600, () => pose('groom', false)); }
  }

  // ====================================================
  //  SEVME (imleçle kedinin üstünde gezinmek)
  // ====================================================
  let petAmt = 0, purrUntil = 0, msgIdx = Math.floor(Math.random() * 100);
  catEl.addEventListener('pointermove', (e) => {
    if (dragging || laser.on || e.buttons) return;
    petAmt += Math.abs(e.movementX) + Math.abs(e.movementY);
    if (petAmt > 130 && now > purrUntil) purr();
  });
  function purr() {
    petAmt = 0; touch();
    purrUntil = now + 2600;
    const sleeping = cat.mode === 'sleep';
    if (!sleeping) { if (cat.mode === 'tobed') wake(); stopWalk(); pose('groom', false); pose('happy'); lookAtMe(2800); }
    hearts(sleeping ? 2 : 5, 300);
    setTimeout(() => { if (!sleeping) pose('happy', false); }, 2400);
    const msgs = A.mesajlar || [];
    if (!sleeping && msgs.length && Math.random() < 0.4) bubble(msgs[msgIdx++ % msgs.length], 3200);
  }

  // ====================================================
  //  ANA DÖNGÜ
  // ====================================================
  // Kare hızı duruma göre: hareket varken 60, boşta 30, uykuda 15.
  // 120 Hz (ProMotion) ekranlarda da en fazla 60 çizilir.
  const BUSY_POSES = ['walk', 'happy', 'crouch', 'bat', 'groom', 'eat', 'land', 'lookup', 'blink', 'twitch'];
  let rigBusy = true;
  function targetFps() {
    if (rigBusy || dragging || laser.on || yarn.on || cat.target != null || cat.vx !== 0 || turn.t < 1 || face.p > 0 || cat.y < 0 || cat.vy !== 0) return 60;
    if (cat.mode !== 'idle' && cat.mode !== 'sleep') return 60;
    for (const p of BUSY_POSES) if (posed(p)) return 60;
    return cat.mode === 'sleep' ? 15 : 30;
  }

  // aynı değeri tekrar tekrar yazıp tarayıcıya boşuna iş çıkarmayalım
  const lastCss = new Map();
  function setStyle(el, prop, v) {
    const k = el.id + '.' + prop;
    if (lastCss.get(k) === v) return;
    lastCss.set(k, v);
    el.style[prop] = v;
  }

  // uyku "z"leri: 2.4 sn'lik döngü, üçü 0.8 sn arayla
  const zzEls = [...document.querySelectorAll('.zzz span')];
  zzEls.forEach((el, i) => { el.id = el.id || 'zz' + i; });
  function updateZzz(t) {
    const on = cat.mode === 'sleep';
    zzEls.forEach((el, i) => {
      if (!on) { setStyle(el, 'opacity', '0'); return; }
      const p = (((t / 1000 - i * 0.8) % 2.4) + 2.4) % 2.4 / 2.4;
      const e = p * p * (1.6 - 0.6 * p);              // ease-in benzeri
      const op = p < 0.25 ? p / 0.25 : 1 - (p - 0.25) / 0.75;
      setStyle(el, 'transform', `translate(${(10 * e).toFixed(1)}px, ${(6 - 22 * e).toFixed(1)}px)`);
      setStyle(el, 'opacity', op.toFixed(2));
    });
  }

  // 60 fps'te rAF; daha düşük hızda bir sonraki kareyi setTimeout ile planla
  // (rAF'ı boşuna 60/120 Hz'de uyandırmamak için)
  let wakeT = null;
  function schedule() {
    const fps = targetFps();
    if (fps >= 60) { requestAnimationFrame(frame); return; }
    wakeT = setTimeout(() => { wakeT = null; requestAnimationFrame(frame); }, 1000 / fps - 6);
  }
  // kullanıcı etkileşiminde beklemeden hızlan
  function kick() {
    if (wakeT === null) return;
    clearTimeout(wakeT); wakeT = null;
    requestAnimationFrame(frame);
  }

  let last = performance.now();
  function frame(t) {
    if (t - last < 1000 / targetFps() - 2) { requestAnimationFrame(frame); return; }   // 120 Hz'de fazla kareyi atla
    const dt = Math.min(0.08, (t - last) / 1000);
    last = t; now = t;
    petAmt *= Math.pow(0.35, dt);

    // zıplama
    if (cat.y < 0 || cat.vy !== 0) {
      cat.vy += G * dt; cat.y += cat.vy * dt;
      if (cat.y >= 0) { if (cat.vy > 120) { pose('land'); setTimeout(() => pose('land', false), 120); } cat.y = 0; cat.vy = 0; }
    }
    // yürüme: yumuşak kalkış, hedefe yaklaşırken yavaşlama, ters yöne gitmeden önce durup dönme
    const canWalk = cat.mode !== 'sleep' && cat.mode !== 'eat';
    let want = 0;                                   // istenen hız (işaretli)
    if (cat.target != null && canWalk && face.p === 0) {   // sana bakarken yürümez
      const d = cat.target - cat.x;
      if (Math.abs(d) < 0.8 && Math.abs(cat.vx) < 40) {
        cat.x = cat.target; cat.vx = 0; cat.target = null;
        const cb = cat.onArrive; cat.onArrive = null; cb && cb();
      } else if (sign(d) !== cat.dir) {
        if (Math.abs(cat.vx) < 12) cat.dir = sign(d);   // yavaşladıysa dön
      } else if (turn.t > (turn.kind === 'back' ? BACK_WALK_AT : 0.55)) {   // dönüş bitmeye yakın yürümeye başla
        want = sign(d) * Math.max(8, Math.min(cat.speed, Math.sqrt(2 * ARRIVE * Math.abs(d))));
      }
    }
    if (!canWalk) cat.vx = 0;
    else {
      const speeding = want !== 0 && (cat.vx === 0 || sign(want) === sign(cat.vx)) && Math.abs(want) > Math.abs(cat.vx);
      const rate = (speeding ? ACC : DEC) * (cat.y < 0 ? 0.15 : 1) * dt;   // havadayken hız pek değişmez
      cat.vx += clamp(want - cat.vx, -rate, rate);
      const nx = cat.x + cat.vx * dt;
      if (cat.target != null && sign(cat.target - nx) !== sign(cat.target - cat.x)) { cat.x = cat.target; cat.vx = 0; }
      else cat.x = nx;
      if (cat.x < MIN_X || cat.x > MAX_X) { cat.x = clamp(cat.x, MIN_X, MAX_X); cat.vx = 0; }
    }
    cat.vel = Math.abs(cat.vx);
    pose('walk', cat.y === 0 && cat.vel > 2);

    // dönüş: tam bir yöne bakarken ve ayaktayken arkasını dönerek, aksi hâlde daralarak
    if (cat.dir !== turn.to) {
      const back = turn.t >= 1 && canBackTurn();
      turn.from = turn.s; turn.to = cat.dir; turn.t = 0;
      turn.kind = back ? 'back' : 'squash';
      turn.dur = back ? BACK_TURN_DUR : TURN_DUR;
    }
    // dönüş sırasında oyun başlarsa / kedi çömelirse kareli dönüşü bırak
    if (turn.kind === 'back' && turn.t < 1 && !canBackTurn()) turn.kind = 'squash';
    if (turn.t < 1) {
      turn.t = Math.min(1, turn.t + dt / turn.dur);
      const e = turn.t < 0.5 ? 4 * turn.t ** 3 : 1 - (-2 * turn.t + 2) ** 3 / 2;   // easeInOutCubic
      turn.s = turn.from + (turn.to - turn.from) * e;
    }

    // sana bakma: istenirse yavaşça döner, süre bitince / başka iş başlayınca geri döner
    const wantFace = now < face.until && canFace() && turn.t >= 1;
    if (turn.t < 1) face.p = 0;
    face.p = clamp(face.p + (wantFace ? 1 : -1) * dt / FACE_DUR, 0, 1);

    // laser her durumda kendi süresini kontrol eder (başka bir etkinlik modu değiştirse bile)
    if (laser.on && cat.mode !== 'laser') stopLaser();
    else if (laser.on && now > laser.until) finishLaser();

    updateYarn(dt);
    if (cat.mode === 'play') playThink();
    else if (cat.mode === 'laser') laserThink();
    else if (cat.mode === 'idle' && now >= face.until) idleThink();   // sana bakarken dolaşmaya kalkmaz

    // çiz
    setStyle(catEl, 'transform', `translate(${(cat.x - CAT_W / 2).toFixed(2)}px, ${(FLOOR - CAT_H + cat.y).toFixed(2)}px)`);
    // dönüşte en dar hâlde bile %22 genişlikte kalır (çizgiye dönüşmesin); ortada hafif çömelme
    let sx, sy = 1, shadowW, frameName = null, frameDir = 1;
    if (turn.kind === 'back' && turn.t < 1) {
      // yan (hafif daralır) → arka-3/4 → arka → arka-3/4 (ayna) → yan (ayna, genişler)
      const t = turn.t, f = turn.from > 0 ? 1 : -1;
      if (t < 0.14)      { sx = f * (1 - 0.18 * (t / 0.14)); shadowW = 1 - 0.15 * (t / 0.14); }
      else if (t < 0.38) { frameName = 'back34'; frameDir = f; shadowW = 0.75; }
      else if (t < 0.62) { frameName = 'back'; shadowW = 0.6; }
      else if (t < 0.86) { frameName = 'back34'; frameDir = -f; shadowW = 0.75; }
      else               { const k = (t - 0.86) / 0.14; sx = -f * (0.82 + 0.18 * k); shadowW = 0.85 + 0.15 * k; }
      if (frameName) sy = 1 - 0.025 * Math.sin(Math.PI * (t - 0.14) / 0.72);   // ortada hafif çökme
    } else {
      const tm = Math.abs(turn.s), mid = turn.t < 1 ? Math.sin(Math.PI * turn.t) : 0;
      sx = (turn.s < 0 || (turn.s === 0 && turn.to < 0) ? -1 : 1) * (0.22 + 0.78 * tm);
      sy = 1 - 0.05 * mid;
      shadowW = 0.8 + 0.2 * tm;
    }
    // sana bakma: yan görünüş daralır → ön görünüş genişleyerek gelir (ve tersi)
    let fx = 1, rot = 0;
    if (face.p > 0 && !(turn.kind === 'back' && turn.t < 1)) {
      const e = face.p * face.p * (3 - 2 * face.p);
      if (e < 0.5) { sx = cat.dir * (1 - 0.8 * e); sy = 1; frameName = null; }
      else {
        const ts = now / 1000;
        frameName = 'front'; frameDir = 1;
        fx = 0.6 + 0.4 * (e - 0.5) / 0.5;
        sy = 1 + 0.012 * Math.sin(ts * 2 * Math.PI / 3.3);              // nefes
        rot = posed('happy') ? 2.2 * Math.sin(ts * 3.4) * e : 0;        // mırlarken hafif sallanma
      }
      shadowW = 1 - 0.4 * e;
    }
    // kare gösterilirken iskeletli kedi gizlenir (çizilmeye devam eder, geri dönüşte hazır olsun)
    setStyle(catInner, 'visibility', frameName ? 'hidden' : 'visible');
    if (!frameName) setStyle(catInner, 'transform', `scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`);
    for (const name in sprites) {
      const on = name === frameName;
      setStyle(sprites[name], 'display', on ? 'block' : 'none');
      if (on) setStyle(sprites[name], 'transform', `rotate(${rot.toFixed(2)}deg) scale(${(frameDir * fx).toFixed(3)}, ${sy.toFixed(3)})`);
    }
    rigBusy = window.__catTick ? !!window.__catTick(dt) : false;
    const sh = 1 + cat.y / 90;
    setStyle(shadowEl, 'transform', `translate(${cat.x.toFixed(2)}px, ${FLOOR - 1}px) scale(${(sh * shadowW).toFixed(3)}, ${sh.toFixed(3)})`);
    setStyle(shadowEl, 'opacity', ((cat.mode === 'sleep' ? 0.6 : 1) * (0.5 + 0.5 * sh)).toFixed(3));
    yarnShadowEl.classList.toggle('on', yarn.on && !yarn.fadeAt);
    if (yarn.on) setStyle(yarnShadowEl, 'transform', `translate(${yarn.x.toFixed(2)}px, ${FLOOR - 1}px) scale(${(0.55 + 0.45 * Math.max(0, 1 - (FLOOR - yarn.r - yarn.y) / 110)).toFixed(3)})`);
    if (yarn.on) setStyle(yarnEl, 'transform', `translate(${(yarn.x - yarn.r).toFixed(2)}px, ${(yarn.y - yarn.r).toFixed(2)}px) rotate(${yarn.rot.toFixed(1)}deg)`);
    if (laser.on) {
      laserEl.classList.toggle('on', laser.visible);
      setStyle(laserEl, 'transform', `translate(${laser.x}px, ${laser.y}px)`);
    }
    updateZzz(t);
    schedule();
  }
  requestAnimationFrame(frame);

  // ====================================================
  //  GİRDİ: tıklama / sürükleme / menü
  // ====================================================
  let down = null, dragging = false, menuOpen = false;

  nest.addEventListener('pointerdown', (e) => {
    kick();
    if (e.button !== 0) return;
    down = { x: e.screenX, y: e.screenY, target: e.target };
    dragging = false;
    nest.setPointerCapture(e.pointerId);
  });
  nest.addEventListener('pointermove', (e) => {
    kick();
    if (laser.on) {
      const r = nest.getBoundingClientRect();
      laser.x = clamp(e.clientX - r.left, 6, NEST - 6);
      laser.y = clamp(e.clientY - r.top, 6, NEST - 6);
      laser.visible = true;
      touch();
    }
    if (!down || laser.on) return;
    if (!dragging && Math.hypot(e.screenX - down.x, e.screenY - down.y) > 4) {
      dragging = true;
      if (menuOpen) setMenu(false);
      api && api.dragStart();
    }
    if (dragging) api && api.dragMove();
  });
  nest.addEventListener('pointerleave', () => { laser.visible = false; });
  nest.addEventListener('pointerup', (e) => {
    if (!down) return;
    const t = down.target;
    down = null;
    if (dragging) { dragging = false; api && api.dragEnd(); return; }
    touch();
    // lazer açıkken tıklamak lazeri kapatır (menüye ulaşılamadığı için tek çıkış yolu buydu)
    if (laser.on) { stopLaser(); stopWalk(); bubble('oyun bitti 🐾', 1400); return; }
    if (yarn.on && yarnEl.contains(t)) {
      kickYarn(sign(yarn.x - cat.x) || 1);
      if (cat.mode !== 'play') { wake(); cat.mode = 'play'; yarn.fadeAt = 0; yarn.born = now; yarn.bats = 0; yarn.goal = Math.round(rand(4, 6)); }
      return;
    }
    if (catEl.contains(t) && cat.mode !== 'sleep') {
      const say = () => bubble(Math.random() < .5 ? 'miyav?' : 'mrrp!', 1600);
      if (Math.random() < 0.35) { jump(-140); setTimeout(say, 120); }
      else if (canFace()) { lookAtMe(1700); say(); }      // dönüp sana bakar
    }
    setMenu(!menuOpen);
  });

  async function setMenu(open) {
    if (open === menuOpen) return;
    menuOpen = open;
    if (open) {
      const side = api ? await api.menu(true) : 'right';
      app.classList.toggle('side-left', side === 'left');
      app.classList.toggle('side-right', side !== 'left');
      // pencere genişlerken menü kapatıldıysa yeniden açma
      requestAnimationFrame(() => { if (menuOpen) menuEl.classList.add('open'); });
    } else {
      menuEl.classList.remove('open');
      setTimeout(() => { if (!menuOpen && api) api.menu(false).then(() => app.classList.replace('side-left', 'side-right')); }, 180);
    }
  }
  api && api.onBlur(() => setMenu(false));

  // ---- ayarlar paneli ----
  const settingsEl = $('#settings');
  let curScale = 1;
  function markScale(s) {
    curScale = s;
    settingsEl.querySelectorAll('[data-scale]').forEach((b) =>
      b.classList.toggle('active', Math.abs(parseFloat(b.dataset.scale) - s) < 0.01));
  }
  function openSettings() { settingsEl.classList.add('open'); }
  function closeSettings() { settingsEl.classList.remove('open'); }
  settingsEl.querySelector('.st-close').addEventListener('click', closeSettings);
  settingsEl.querySelectorAll('[data-scale]').forEach((b) => b.addEventListener('click', async () => {
    const s = parseFloat(b.dataset.scale);
    markScale(s);
    if (api && api.setScale) markScale(await api.setScale(s));
    else document.documentElement.style.zoom = s;   // tarayıcıda deneme için
  }));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeSettings(); stopLaser(); } });
  if (api && api.getScale) api.getScale().then(markScale);
  if (api && api.onScale) api.onScale(markScale);
  markScale(1);
  api && api.onBlur(closeSettings);

  function menuBtn(act, active, label) {
    const b = menuEl.querySelector(`[data-act="${act}"]`);
    if (!b) return;
    b.classList.toggle('active', active);
    if (label) b.textContent = label;
  }

  menuEl.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    touch(); kick();
    const act = b.dataset.act;
    if (act === 'yarn') dropYarn();
    else if (act === 'food') feed();
    else if (act === 'laser') laser.on ? stopLaser() : startLaser();
    else if (act === 'settings') openSettings();
    else if (act === 'sleep') (cat.mode === 'sleep' || cat.mode === 'tobed') ? (wake(), bubble('günaydın ☀️')) : sleep();
    setTimeout(() => setMenu(false), 120);
  });

  // ====================================================
  //  GÜNDÜZ / GECE + KARŞILAMA
  // ====================================================
  function updateSky() {
    const h = new Date().getHours();
    nest.dataset.time = (h >= 20 || h < 6) ? 'night' : (h < 8 || h >= 18) ? 'dusk' : 'day';
  }
  updateSky();
  setInterval(updateSky, 60e3);
  setInterval(() => { store.tokluk = clamp(store.tokluk - 0.1, 0, 100); save(); }, 60e3);

  setTimeout(() => {
    const d = new Date();
    const key = String(d.getDate()).padStart(2, '0') + '-' + String(d.getMonth() + 1).padStart(2, '0');
    const special = (A.ozelGunler || {})[key];
    if (special) { bubble(special, 5000); hearts(6, 250); }
    else bubble(isNight() ? 'iyi geceler 🌙' : `merhaba! ben ${A.isim || 'kedi'} 😺`, 3000);
  }, 900);

  // test için dışarı aç
  window.__kedi = { cat, turn, face, lookAtMe, yarn, laser, store, dropYarn, feed, startLaser, stopLaser, sleep, wake, purr, setMenu, bubble };
})();

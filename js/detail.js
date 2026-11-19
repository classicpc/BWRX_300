/* BWRX-300 Component Detail Window Controller
   Handles live data synchronization with main control room via BroadcastChannel and window.opener */
(function () {
  'use strict';

  const B = window.BWR;
  const V = window.BWR_Views;
  const C = B.C;
  const clamp = B.clamp;

  let currentPart = 'rpv';
  let S = null;
  let icE = 0;
  let isConnected = false;

  // Read URL param
  const urlParams = new URLSearchParams(window.location.search);
  const partParam = urlParams.get('part');
  if (['rpv', 'turb', 'cond', 'ic'].includes(partParam)) {
    currentPart = partParam;
  }

  // Setup BroadcastChannel for cross-window real-time communication
  let channel = null;
  try {
    channel = new BroadcastChannel('bwrx300_sim_channel');
    channel.onmessage = e => {
      if (e.data) {
        if (e.data.type === 'STATE_UPDATE') {
          S = e.data.state;
          icE = e.data.icE || 0;
          setConnected(true);
        } else if (e.data.type === 'NAVIGATE_PART' && e.data.part) {
          switchPart(e.data.part);
        }
      }
    };
  } catch (err) {
    console.warn('BroadcastChannel unavailable:', err);
  }

  // Also listen for direct postMessage from window.opener
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('message', e => {
      if (e.data && e.data.type === 'NAVIGATE_PART' && e.data.part) {
        switchPart(e.data.part);
      }
    });
  }

  function setConnected(connected) {
    isConnected = connected;
    const dot = document.getElementById('syncDot');
    const txt = document.getElementById('syncText');
    if (dot && txt) {
      if (connected) {
        dot.className = 'status-dot';
        txt.textContent = 'LIVE SYNCED TO CONTROL ROOM';
      } else {
        dot.className = 'status-dot disconnected';
        txt.textContent = 'STANDALONE PREVIEW';
      }
    }
  }

  // Fallback to local state if opened standalone
  function checkState() {
    if (window.opener && window.opener.__bwr && window.opener.__bwr.S) {
      S = window.opener.__bwr.S;
      if (typeof window.opener.__bwr.icE === 'number') {
        icE = window.opener.__bwr.icE;
      }
      setConnected(true);
      return;
    }
    if (!S) {
      // Create a running demo state for standalone viewing
      S = B.create(null, { free: true });
      S.phase = 'power';
      S.n = 1.0;
      S.pth = C.MWT;
      S.mwe = 300;
      S.p = 7.0;
      S.Tc = 286;
      S.turbOn = true;
      S.qt = C.MWT;
      S.rpm = 1500;
      S.vac = 5.2;
      setConnected(false);
    }
  }

  // UI elements & view switching
  const views = {
    rpv: document.getElementById('rview'),
    turb: document.getElementById('tview'),
    cond: document.getElementById('cview'),
    ic: document.getElementById('iview')
  };

  const navBtns = {
    rpv: document.getElementById('btnNavRpv'),
    turb: document.getElementById('btnNavTurb'),
    cond: document.getElementById('btnNavCond'),
    ic: document.getElementById('btnNavIC')
  };

  function switchPart(part) {
    currentPart = part;
    Object.keys(views).forEach(k => {
      if (views[k]) {
        if (k === part) views[k].removeAttribute('hidden');
        else views[k].setAttribute('hidden', '');
      }
      if (navBtns[k]) {
        if (k === part) navBtns[k].classList.add('active');
        else navBtns[k].classList.remove('active');
      }
    });
    // Update window title
    const titles = {
      rpv: 'Reactor Pressure Vessel (RPV) - BWRX-300',
      turb: 'Turbine Hall & Generator - BWRX-300',
      cond: 'Main Condenser & Lake Ontario - BWRX-300',
      ic: 'Isolation Condenser System - BWRX-300'
    };
    document.title = titles[part] || 'BWRX-300 Detail View';
  }

  // Bind nav buttons
  Object.keys(navBtns).forEach(k => {
    if (navBtns[k]) {
      navBtns[k].addEventListener('click', () => switchPart(k));
    }
  });

  // Second Screen & Display actions
  const btnFs = document.getElementById('btnFullscreen');
  if (btnFs) {
    btnFs.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
        btnFs.textContent = '⛶ Exit Fullscreen';
      } else {
        document.exitFullscreen().catch(() => {});
        btnFs.textContent = '⛶ Fullscreen';
      }
    });
  }

  const btnMove = document.getElementById('btnMoveScreen');
  if (btnMove) {
    btnMove.addEventListener('click', async () => {
      // 1. If getScreenDetails is supported, use exact other display coordinates
      if ('getScreenDetails' in window) {
        try {
          const details = await window.getScreenDetails();
          if (details && details.screens && details.screens.length > 1) {
            const other = details.screens.find(s => s !== details.currentScreen) || details.screens[1];
            if (other) {
              window.moveTo(other.availLeft, other.availTop);
              window.resizeTo(other.availWidth, other.availHeight);
              return;
            }
          }
        } catch (e) {}
      }

      // 2. Coordinate fallback
      const curX = window.screenLeft !== undefined ? window.screenLeft : (window.screenX || 0);
      const sWidth = window.screen.width;
      if (curX >= 0 && curX < (sWidth - 100)) {
        window.moveTo(sWidth + 40, 40);
        window.resizeTo(window.screen.availWidth || 1200, window.screen.availHeight || 800);
      } else {
        window.moveTo(40, 40);
        window.resizeTo(window.screen.availWidth || 1200, window.screen.availHeight || 800);
      }
    });
  }

  // RPV 3D Cutaway controls
  const rcam = { yaw: -0.5, pitch: 0.35, cy: 7.6, span: 27.8, tcy: 7.6, tspan: 27.8, sel: null, labels: true, cut: true };
  const p3still = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  function rGo(p) {
    if (V.RPRE[p]) {
      rcam.tcy = V.RPRE[p][0];
      rcam.tspan = V.RPRE[p][1];
    }
  }

  function initRpvCards() {
    const container = document.getElementById('rcards');
    if (!container || container.children.length > 0) return;

    V.RCARDS.forEach(c => {
      const b = document.createElement('button');
      b.className = 'rcard';
      b.type = 'button';
      b.setAttribute('aria-pressed', 'false');
      const t = document.createElement('b'); t.textContent = c[1];
      const v = document.createElement('span'); v.className = 'v'; v.id = 'rcard_v_' + c[0];
      const x = document.createElement('span'); x.textContent = c[4];
      b.appendChild(t); b.appendChild(v); b.appendChild(x);
      container.appendChild(b);

      b.addEventListener('click', () => {
        rcam.sel = rcam.sel === c[0] ? null : c[0];
        container.querySelectorAll('.rcard').forEach((el, idx) => {
          el.setAttribute('aria-pressed', V.RCARDS[idx][0] === rcam.sel ? 'true' : 'false');
        });
        if (rcam.sel) rGo(c[2]);
      });
    });
  }

  function initRpvCanvas() {
    const cv = document.getElementById('rc');
    if (!cv) return;
    let drag = null;

    cv.addEventListener('pointerdown', e => {
      drag = { x: e.clientX, y: e.clientY, yaw: rcam.yaw, pitch: rcam.pitch };
      try { cv.setPointerCapture(e.pointerId); } catch (x) {}
    });
    cv.addEventListener('pointermove', e => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      rcam.yaw = drag.yaw + dx * 0.008;
      if (e.pointerType === 'mouse') rcam.pitch = clamp(drag.pitch + dy * 0.006, 0.05, 1.2);
    });
    ['pointerup', 'pointercancel'].forEach(ev => cv.addEventListener(ev, () => { drag = null; }));

    const rL = document.getElementById('rL'); if (rL) rL.addEventListener('click', () => { rcam.yaw -= 0.3; });
    const rR = document.getElementById('rR'); if (rR) rR.addEventListener('click', () => { rcam.yaw += 0.3; });

    [['rWhole', 'whole'], ['rCore', 'core'], ['rTop', 'top'], ['rBot', 'bot']].forEach(a => {
      const btn = document.getElementById(a[0]);
      if (btn) btn.addEventListener('click', () => rGo(a[1]));
    });

    const rCut = document.getElementById('rCut');
    if (rCut) rCut.addEventListener('click', () => {
      rcam.cut = !rcam.cut;
      rCut.setAttribute('aria-pressed', rcam.cut ? 'true' : 'false');
    });

    const rLab = document.getElementById('rLab');
    if (rLab) rLab.addEventListener('click', () => {
      rcam.labels = !rcam.labels;
      rLab.setAttribute('aria-pressed', rcam.labels ? 'true' : 'false');
    });
  }

  function drawRpv() {
    const cv = document.getElementById('rc');
    if (!cv) return;
    const parent = cv.parentElement;
    const W = Math.max(320, Math.round(parent.clientWidth));
    const H = Math.max(260, Math.round(parent.clientHeight));
    const dpr = Math.min(2, window.devicePixelRatio || 1);

    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      cv.style.height = H + 'px';
    }

    rcam.cy += (rcam.tcy - rcam.cy) * 0.18;
    rcam.span += (rcam.tspan - rcam.span) * 0.18;

    V.p3Rpv(cv.getContext('2d'), W, H, dpr, performance.now() / 1000, S, C, (window.BWR_3D && window.BWR_3D.coreColor), rcam, p3still);

    // Update cards values
    V.RCARDS.forEach(c => {
      const el = document.getElementById('rcard_v_' + c[0]);
      if (el) el.textContent = c[3](S, S.tripT || 0);
    });
  }

  // Live Telemetry Banner (Aligned with Notes for Software Design Specs)
  function updateTelemetryBanner() {
    if (!S) return;
    const mPow = document.getElementById('mPow');
    const mPres = document.getElementById('mPres');
    const mTemp = document.getElementById('mTemp');
    const mLvl = document.getElementById('mLvl');
    const mCrit = document.getElementById('mCrit');
    const mDynLab = document.getElementById('mDynamicLabel');
    const mDynVal = document.getElementById('mDynamicVal');

    if (mPow) mPow.textContent = `${S.pth.toFixed(0)} MWt (${(S.n * 100).toFixed(1)}%)`;
    if (mPres) mPres.textContent = `${S.p.toFixed(2)} MPa`;
    if (mTemp) mTemp.textContent = `${S.Tc.toFixed(0)} °C (${(S.Tc + 273.15).toFixed(0)} K)`;
    if (mLvl) mLvl.textContent = `${(14.2 * (S.level / 100)).toFixed(1)} m (${S.level.toFixed(0)}%)`;

    // Reactivity calculation: in mK (milli-k)
    const rho_mK = Math.abs(S.dln || 0) < 0.0005 ? '0.0' : ((S.dln || 0) * 12).toFixed(1);
    let critStatus = 'Steady';
    if (S.scram || S.phase === 'idle' || S.n < 0.001) critStatus = 'Subcritical';
    else if ((S.dln || 0) > 0.005) critStatus = `Supercrit (+${rho_mK} mK)`;
    else if ((S.dln || 0) < -0.005) critStatus = `Subcrit (${rho_mK} mK)`;
    if (mCrit) mCrit.textContent = `${rho_mK} mK (${critStatus})`;

    if (mDynLab && mDynVal) {
      if (currentPart === 'turb') {
        mDynLab.textContent = 'TURBINE SPEED & MWE';
        mDynVal.textContent = `${S.rpm.toFixed(0)} RPM · ${S.mwe.toFixed(0)} MWe`;
      } else if (currentPart === 'cond') {
        const heat = Math.round(0.652 * S.qt + S.qb);
        mDynLab.textContent = 'HEAT REJECTION & CW';
        mDynVal.textContent = `${heat} MW to Lake · Vac ${S.vac.toFixed(1)} kPa`;
      } else if (currentPart === 'ic') {
        mDynLab.textContent = 'PASSIVE IC REMOVAL';
        mDynVal.textContent = `${S.qic.toFixed(0)} MW (Valves ${S.icOpen ? 'OPEN' : 'READY'})`;
      } else {
        mDynLab.textContent = 'RODS & BORON';
        mDynVal.textContent = `Rods ${(S.rod * 100).toFixed(0)}% · Boron ${(S.boron * 100).toFixed(0)}%`;
      }
    }
  }

  // Animation & update loop
  function loop() {
    checkState();
    if (S) {
      updateTelemetryBanner();
      if (currentPart === 'rpv') {
        drawRpv();
      } else if (currentPart === 'turb') {
        V.renderTurbine(S, document);
      } else if (currentPart === 'cond') {
        V.renderCondenser(S, document);
      } else if (currentPart === 'ic') {
        V.renderIC(S, icE, document);
      }
    }
    requestAnimationFrame(loop);
  }

  // Startup
  switchPart(currentPart);
  initRpvCards();
  initRpvCanvas();
  requestAnimationFrame(loop);
})();

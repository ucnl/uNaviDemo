// ============================================================
//  КОНСТАНТЫ И ГЛОБАЛЬНОЕ СОСТОЯНИЕ
// ============================================================
const C = 1500;                    // скорость звука, м/с
const WORLD = 2000;                // размер акватории, м
const BUOY_COLORS = ['#6fe3ff', '#ffd24a', '#ff8080', '#6fff9a'];

// ---------- демо-режим ----------
const DEMO_IDLE_MS  = 3 * 60 * 1000;   // 3 минуты без кликов -> демо
const DEMO_SCENE_MS = 30 * 1000;       // 30 секунд на одну сцену




const state = {
  mode: 'toa',
  t: 0,
  animSpeed: 1,
  paused: false,
  noiseSigma: 0,
  dragging: null,
  dragOffset: {x:0, y:0},
  showHyper: true,
  showWave: true,
  activeBuoy: 0,
  // демо
  demoMode: false,
  demoSceneIdx: 0,
  demoSceneStart: 0,
  lastClickTime: performance.now(),
};

const receiver = {
  x: 120, y: -80,
  vx: 55, vy: 35,
};

const buoys = [
  { x: -500, y:  500, name: 'B1' },
  { x:  500, y:  500, name: 'B2' },
  { x:  500, y: -500, name: 'B3' },
  { x: -500, y: -500, name: 'B4' },
];

let lastSolution = null;
let lastError = 0;

// ---------- сцены для демо-режима ----------
const SCENES = [
  {
    mode: 'toa',
    title: 'TOA · буи ромбом',
    note: 'Классическая геометрия: окружности дальностей пересекаются под хорошими углами, GDOP низкий, ошибка позиции минимальна.',
    buoys: [{x:-500,y: 500},{x: 500,y: 500},{x: 500,y:-500},{x:-500,y:-500}],
    receiver: {x:120,y:-80,vx:55,vy:35},
  },
  {
    mode: 'toa',
    title: 'TOA · буи в линию',
    note: 'Все буи почти на одной прямой. Окружности пересекаются под острым углом — геометрия плохая, ошибка позиции резко растёт.',
    buoys: [{x:-600,y:0},{x:-200,y:0},{x:200,y:0},{x:600,y:0}],
    receiver: {x:0,y:300,vx:40,vy:-20},
  },
  {
    mode: 'toa',
    title: 'TOA · приёмник вне базы',
    note: 'Приёмник далеко за пределами базы буёв. Окружности в его окрестности почти не пересекаются — позиция определяется плохо.',
    buoys: [{x:-500,y:500},{x:500,y:500},{x:500,y:-500},{x:-500,y:-500}],
    receiver: {x:900,y:800,vx:-35,vy:-28},
  },
  {
    mode: 'tdoa',
    title: 'TDOA · приёмник в центре',
    note: 'Классическая картина: четыре гиперболы пересекаются в одной точке под хорошими углами. Видны разности ΔR.',
    buoys: [{x:-500,y:500},{x:500,y:500},{x:500,y:-500},{x:-500,y:-500}],
    receiver: {x:80,y:-40,vx:18,vy:12},
  },
  {
    mode: 'tdoa',
    title: 'TDOA · приёмник вне базы',
    note: 'Далеко от базы гиперболы становятся почти параллельными — разности ΔR слабо меняются при движении, точность падает.',
    buoys: [{x:-500,y:500},{x:500,y:500},{x:500,y:-500},{x:-500,y:-500}],
    receiver: {x:900,y:800,vx:-30,vy:-25},
  },
  {
    mode: 'tdoa',
    title: 'TDOA · буи почти в линию',
    note: 'Вырожденный случай: гиперболы схлопываются в узкие полосы, пересечение плохо обусловлено.',
    buoys: [{x:-600,y:20},{x:-200,y:-20},{x:200,y:20},{x:600,y:-20}],
    receiver: {x:0,y:400,vx:30,vy:-15},
  },
  {
    mode: 'usbl',
    title: 'USBL · буй прямо вперёд',
    note: 'Буй на траверзе антенны: фронт перпендикулярен базе, все гидрофоны срабатывают одновременно, разность фаз Δφ = 0.',
    buoys: [{x:800,y:0},{x:500,y:500},{x:500,y:-500},{x:-500,y:0}],
    receiver: {x:0,y:0,vx:0,vy:0},
    activeBuoy: 0,
  },
  {
    mode: 'usbl',
    title: 'USBL · буй сбоку',
    note: 'Буй сбоку от базы: фронт бежит вдоль неё, гидрофоны срабатывают по очереди с максимальной задержкой — Δφ наибольшая. Именно так измеряется пеленг.',
    buoys: [{x:0,y:800},{x:500,y:500},{x:500,y:-500},{x:-500,y:0}],
    receiver: {x:0,y:0,vx:0,vy:0},
    activeBuoy: 0,
  },
];

// ---------- функции демо-режима ----------
function applyScene(idx){
  const s = SCENES[idx];

  // режим — через тот же клик, что у пользователя, чтобы всё обновилось
  const btn = document.querySelector(`.mode-btn[data-mode="${s.mode}"]`);
  if(btn) btn.click();

  // буи
  s.buoys.forEach((b,i)=>{
    buoys[i].x = b.x;
    buoys[i].y = b.y;
  });

  // приёмник
  receiver.x = s.receiver.x;
  receiver.y = s.receiver.y;
  receiver.vx = s.receiver.vx;
  receiver.vy = s.receiver.vy;

  // активный буй (USBL)
  if(s.activeBuoy !== undefined) state.activeBuoy = s.activeBuoy;

  // сброс времени цикла
  state.t = 0;

  // баннер
  const banner = document.getElementById('demo-banner');
  banner.querySelector('.demo-title').textContent = s.title;
  banner.querySelector('.demo-note').textContent  = s.note;
}

function enterDemoMode(){
  state.demoMode = true;
  state.demoSceneIdx = 0;
  state.demoSceneStart = performance.now();
  applyScene(0);
  document.getElementById('demo-btn').classList.add('active');
  document.getElementById('demo-btn').textContent = '⏹ демо';
  document.getElementById('demo-banner').classList.remove('hidden');
}

function exitDemoMode(){
  state.demoMode = false;
  document.getElementById('demo-btn').classList.remove('active');
  document.getElementById('demo-btn').textContent = '▶ демо';
  document.getElementById('demo-banner').classList.add('hidden');
}

function toggleDemoMode(){
  if(state.demoMode) exitDemoMode();
  else enterDemoMode();
}




// ============================================================
//  ТОСТЫ
// ============================================================
function toast(msg){
  const c = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  c.appendChild(el);
  requestAnimationFrame(()=>el.classList.add('visible'));
  setTimeout(()=>{ el.classList.remove('visible'); setTimeout(()=>el.remove(), 400); }, 2600);
}

// ============================================================
//  КАНВАС СЦЕНЫ
// ============================================================
const sceneCanvas = document.getElementById('scene');
const sceneCtx = sceneCanvas.getContext('2d');
let SW=0, SH=0, SDPR=1;
let viewScale = 0.2;
let viewCx = 0, viewCy = 0;

function resizeScene(){
  const r = sceneCanvas.parentElement.getBoundingClientRect();
  SDPR = window.devicePixelRatio||1;
  SW = r.width; SH = r.height;
  sceneCanvas.width = SW*SDPR; sceneCanvas.height = SH*SDPR;
  sceneCanvas.style.width = SW+'px'; sceneCanvas.style.height = SH+'px';
  sceneCtx.setTransform(SDPR,0,0,SDPR,0,0);
  viewScale = Math.min(SW, SH) / (WORLD*1.15);
}
function w2s(x,y){
  return [ SW/2 + (x-viewCx)*viewScale,
           SH/2 - (y-viewCy)*viewScale ];
}
function s2w(sx,sy){
  return [ viewCx + (sx - SW/2)/viewScale,
           viewCy - (sy - SH/2)/viewScale ];
}

// ============================================================
//  КАНВАС ОСЦИЛЛОГРАФА (нижняя панель)
// ============================================================
const irCanvas = document.getElementById('ir');
const irCtx = irCanvas.getContext('2d');
let IW=0, IH=0, IDPR=1;
function resizeIR(){
  const r = irCanvas.parentElement.getBoundingClientRect();
  IDPR = window.devicePixelRatio||1;
  IW = r.width; IH = r.height;
  irCanvas.width = IW*IDPR; irCanvas.height = IH*IDPR;
  irCanvas.style.width = IW+'px'; irCanvas.style.height = IH+'px';
  irCtx.setTransform(IDPR,0,0,IDPR,0,0);
}

// ============================================================
//  USBL — МИНИ-ПАНЕЛЬ «АНТЕННА КРУПНЫМ ПЛАНОМ»
// ============================================================
const insetBox = document.getElementById('usbl-inset');
const insetCanvas = document.getElementById('inset-canvas');
const insetCtx = insetCanvas.getContext('2d');
let IW2=0, IH2=0, IDPR2=1;
function resizeInset(){
  const r = insetCanvas.parentElement.getBoundingClientRect();
  IDPR2 = window.devicePixelRatio||1;
  IW2 = r.width; IH2 = r.height;
  insetCanvas.width = IW2*IDPR2;
  insetCanvas.height = IH2*IDPR2;
  insetCanvas.style.width = IW2+'px';
  insetCanvas.style.height = IH2+'px';
  insetCtx.setTransform(IDPR2,0,0,IDPR2,0,0);
}

const INSET_LAMBDA_PX     = 90;
const INSET_BASE_PX       = 70;
const INSET_WAVE_SPEED_PX = 40;

// ============================================================
//  ФИЗИКА / ИЗМЕРЕНИЯ
// ============================================================
function trueDistance(a,b){ return Math.hypot(a.x-b.x, a.y-b.y); }

function noiseFor(seed){
  const t = Math.floor(state.t*2);
  const s = Math.sin((seed*12.9898 + t*78.233)*43758.5453);
  return (s - Math.floor(s))*2 - 1;
}

function measuredDistance(buoy, idx){
  const dTrue = trueDistance(buoy, receiver);
  const n = noiseFor(idx+1) * state.noiseSigma;
  return Math.max(0, dTrue + n);
}

function measuredTDOA(i, j){
  const Ri = measuredDistance(buoys[i], i);
  const Rj = measuredDistance(buoys[j], j);
  return Ri - Rj;
}

function measuredBearing(buoy, idx){
  const dx = buoy.x - receiver.x;
  const dy = buoy.y - receiver.y;
  const ang = Math.atan2(dy, dx);
  const n = noiseFor(idx+100) * (state.noiseSigma/200);
  return ang + n;
}

// ============================================================
//  РЕШЕНИЕ ПОЗИЦИИ
// ============================================================
function solveTOA(){
  if(buoys.length < 3) return null;
  const R = buoys.map((b,i)=>measuredDistance(b,i));
  const b0 = buoys[0], R0 = R[0];
  const A = [], B = [];
  for(let i=1;i<buoys.length;i++){
    const bi = buoys[i], Ri = R[i];
    A.push([2*(bi.x-b0.x), 2*(bi.y-b0.y)]);
    B.push(R0*R0 - Ri*Ri + bi.x*bi.x + bi.y*bi.y - b0.x*b0.x - b0.y*b0.y);
  }
  return lsq2(A, B);
}

function solveTDOA(){
  if(buoys.length < 3) return null;
  const R = buoys.map((b,i)=>measuredDistance(b,i));
  const b0 = buoys[0], R0 = R[0];
  const A = [], B = [];
  for(let i=1;i<buoys.length;i++){
    const bi = buoys[i], Ri = R[i];
    A.push([2*(bi.x-b0.x), 2*(bi.y-b0.y)]);
    B.push(R0*R0 - Ri*Ri + bi.x*bi.x + bi.y*bi.y - b0.x*b0.x - b0.y*b0.y);
  }
  return lsq2(A, B);
}

function solveUSBL(){
  const i = state.activeBuoy;
  const j = (i+1) % buoys.length;
  return rayIntersect(receiver, measuredBearing(buoys[i], i),
                      receiver, measuredBearing(buoys[j], j));
}

function rayIntersect(p1, a1, p2, a2){
  const dx = Math.cos(a1), dy = Math.sin(a1);
  const ex = Math.cos(a2), ey = Math.sin(a2);
  const den = dx*ey - dy*ex;
  if(Math.abs(den) < 1e-9) return null;
  const ox = p2.x-p1.x, oy = p2.y-p1.y;
  const t1 = (ox*ey - oy*ex)/den;
  return { x: p1.x + dx*t1, y: p1.y + dy*t1 };
}

function lsq2(A, B){
  let a11=0,a12=0,a22=0,b1=0,b2=0;
  for(let i=0;i<A.length;i++){
    a11 += A[i][0]*A[i][0];
    a12 += A[i][0]*A[i][1];
    a22 += A[i][1]*A[i][1];
    b1  += A[i][0]*B[i];
    b2  += A[i][1]*B[i];
  }
  const det = a11*a22 - a12*a12;
  if(Math.abs(det) < 1e-9) return null;
  return {
    x: ( b1*a22 - b2*a12) / det,
    y: ( a11*b2 - a12*b1) / det
  };
}

function computeGDOP(){
  if(buoys.length < 3) return null;
  let sxx=0, sxy=0, syy=0;
  buoys.forEach(b=>{
    const dx = b.x - receiver.x, dy = b.y - receiver.y;
    const r = Math.hypot(dx,dy);
    const ux = dx/r, uy = dy/r;
    sxx += ux*ux; sxy += ux*uy; syy += uy*uy;
  });
  const det = sxx*syy - sxy*sxy;
  if(det <= 1e-9) return 99;
  return Math.sqrt(1/det);
}

// ============================================================
//  МЫШЬ / ТАЧ
// ============================================================
const HIT_RADIUS = 24;

function hitTest(mx, my){
  const [rx,ry] = w2s(receiver.x, receiver.y);
  if(Math.hypot(mx-rx, my-ry) < HIT_RADIUS) return { kind:'rx' };
  for(let i=0;i<buoys.length;i++){
    const [bx,by] = w2s(buoys[i].x, buoys[i].y);
    if(Math.hypot(mx-bx, my-by) < HIT_RADIUS) return { kind:'b', i };
  }
  return null;
}

function beginDrag(mx, my){
  const hit = hitTest(mx,my);
  if(!hit) return false;
  state.dragging = hit;
  const [wx,wy] = s2w(mx,my);
  if(hit.kind==='rx'){
    state.dragOffset = { x: receiver.x-wx, y: receiver.y-wy };
  } else {
    const b = buoys[hit.i];
    state.dragOffset = { x: b.x-wx, y: b.y-wy };
    if(state.mode==='usbl') state.activeBuoy = hit.i;
  }
  return true;
}
function moveDrag(mx, my){
  if(!state.dragging) return;
  const [wx,wy] = s2w(mx,my);
  const nx = wx + state.dragOffset.x;
  const ny = wy + state.dragOffset.y;
  if(state.dragging.kind==='rx'){
    receiver.x = nx; receiver.y = ny;
  } else {
    buoys[state.dragging.i].x = nx;
    buoys[state.dragging.i].y = ny;
  }
}

sceneCanvas.addEventListener('mousedown', e=>{
  const r = sceneCanvas.getBoundingClientRect();
  const mx = e.clientX-r.left, my = e.clientY-r.top;
  if(beginDrag(mx,my)) sceneCanvas.style.cursor = 'grabbing';
});
window.addEventListener('mouseup', ()=>{
  state.dragging = null;
  sceneCanvas.style.cursor = 'crosshair';
});
sceneCanvas.addEventListener('mousemove', e=>{
  const r = sceneCanvas.getBoundingClientRect();
  const mx = e.clientX-r.left, my = e.clientY-r.top;
  if(!state.dragging){
    sceneCanvas.style.cursor = hitTest(mx,my) ? 'grab' : 'crosshair';
    return;
  }
  moveDrag(mx,my);
});

sceneCanvas.addEventListener('touchstart', e=>{
  const r = sceneCanvas.getBoundingClientRect();
  const t0 = e.touches[0];
  const mx = t0.clientX-r.left, my = t0.clientY-r.top;
  beginDrag(mx,my);
  e.preventDefault();
}, {passive:false});
window.addEventListener('touchend', ()=>{ state.dragging = null; });
sceneCanvas.addEventListener('touchmove', e=>{
  if(!state.dragging) return;
  const r = sceneCanvas.getBoundingClientRect();
  const t0 = e.touches[0];
  moveDrag(t0.clientX-r.left, t0.clientY-r.top);
  e.preventDefault();
}, {passive:false});

// ============================================================
//  РИСОВАНИЕ СЦЕНЫ
// ============================================================
function drawGrid(){
  sceneCtx.fillStyle = '#040e15';
  sceneCtx.fillRect(0,0,SW,SH);

  const stepM = niceStep();
  const stepPx = stepM*viewScale;
  if(stepPx < 10) return;

  sceneCtx.strokeStyle = '#0d2635';
  sceneCtx.lineWidth = 1;
  const [cx0,cy0] = w2s(0,0);
  const x0 = cx0 % stepPx, y0 = cy0 % stepPx;
  sceneCtx.beginPath();
  for(let x=x0;x<SW;x+=stepPx){ sceneCtx.moveTo(x,0); sceneCtx.lineTo(x,SH); }
  for(let y=y0;y<SH;y+=stepPx){ sceneCtx.moveTo(0,y); sceneCtx.lineTo(SW,y); }
  sceneCtx.stroke();

  sceneCtx.strokeStyle = '#153a4e';
  sceneCtx.beginPath();
  sceneCtx.moveTo(cx0,0); sceneCtx.lineTo(cx0,SH);
  sceneCtx.moveTo(0,cy0); sceneCtx.lineTo(SW,cy0);
  sceneCtx.stroke();
}
function niceStep(){
  const targetPx = 80;
  const rawM = targetPx/viewScale;
  const p = Math.pow(10, Math.floor(Math.log10(rawM)));
  const n = rawM/p;
  let m;
  if(n<1.5)m=1; else if(n<3)m=2; else if(n<7)m=5; else m=10;
  return m*p;
}

function drawBuoys(){
  buoys.forEach((b,i)=>{
    const [sx,sy] = w2s(b.x,b.y);
    const col = BUOY_COLORS[i];
    const active = (state.mode==='usbl' && state.activeBuoy===i);

    sceneCtx.fillStyle = '#040e15';
    sceneCtx.strokeStyle = col;
    sceneCtx.lineWidth = 2;
    sceneCtx.beginPath();
    sceneCtx.arc(sx, sy, 10, 0, Math.PI*2);
    sceneCtx.fill();
    sceneCtx.stroke();

    sceneCtx.beginPath();
    sceneCtx.moveTo(sx, sy-10);
    sceneCtx.lineTo(sx, sy-18);
    sceneCtx.stroke();

    if(active){
      sceneCtx.beginPath();
      sceneCtx.arc(sx, sy, 16, 0, Math.PI*2);
      sceneCtx.stroke();
    }

    sceneCtx.fillStyle = '#7fb5cc';
    sceneCtx.font = '10px Consolas, monospace';
    sceneCtx.textAlign = 'center';
    sceneCtx.fillText(b.name, sx, sy+22);
  });
}

function drawReceiver(){
  const [sx,sy] = w2s(receiver.x, receiver.y);
  sceneCtx.strokeStyle = 'rgba(111,227,255,0.4)';
  sceneCtx.lineWidth = 1;
  sceneCtx.beginPath();
  sceneCtx.arc(sx, sy, 16 + Math.sin(state.t*4)*2, 0, Math.PI*2);
  sceneCtx.stroke();

  sceneCtx.fillStyle = '#0e4166';
  sceneCtx.strokeStyle = '#6fe3ff';
  sceneCtx.lineWidth = 2;
  sceneCtx.beginPath();
  sceneCtx.ellipse(sx, sy, 16, 7, 0, 0, Math.PI*2);
  sceneCtx.fill();
  sceneCtx.stroke();

  sceneCtx.fillStyle = '#6fe3ff';
  sceneCtx.beginPath();
  sceneCtx.arc(sx, sy-2, 4, Math.PI, 0);
  sceneCtx.fill();

  sceneCtx.fillStyle = '#6fe3ff';
  sceneCtx.font = '10px Consolas, monospace';
  sceneCtx.textAlign = 'center';
  sceneCtx.fillText('RX', sx, sy+22);
}

function drawScaleBar(){
  const step = niceStep();
  const px = step*viewScale;
  const x = 20, y = SH-24;
  sceneCtx.strokeStyle = '#4a6a7a';
  sceneCtx.lineWidth = 1.5;
  sceneCtx.beginPath();
  sceneCtx.moveTo(x,y); sceneCtx.lineTo(x+px,y);
  sceneCtx.moveTo(x,y-4); sceneCtx.lineTo(x,y+4);
  sceneCtx.moveTo(x+px,y-4); sceneCtx.lineTo(x+px,y+4);
  sceneCtx.stroke();
  sceneCtx.fillStyle = '#7fb5cc';
  sceneCtx.font = '10px Consolas, monospace';
  sceneCtx.textAlign = 'center';
  sceneCtx.fillText(step>=1000 ? (step/1000)+' км' : step+' м', x+px/2, y-10);
}

function hex2rgb(hex){
  const h = hex.replace('#','');
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)].join(',');
}

// ============================================================
//  РЕЖИМ TOA
// ============================================================
function drawTOA(){
  const cycle = 4.0;
  const tc = state.t % cycle;

  buoys.forEach((b,i)=>{
    const [bx,by] = w2s(b.x,b.y);
    const R = tc*C;
    const Rpx = R*viewScale;
    if(Rpx < Math.max(SW,SH)*1.2){
      const alpha = Math.max(0, 1 - R/3000);
      sceneCtx.strokeStyle = `rgba(${hex2rgb(BUOY_COLORS[i])},${alpha*0.55})`;
      sceneCtx.lineWidth = 1;
      sceneCtx.beginPath();
      sceneCtx.arc(bx,by,Rpx,0,Math.PI*2);
      sceneCtx.stroke();
    }
  });

  buoys.forEach((b,i)=>{
    const Rm = measuredDistance(b,i);
    const [bx,by] = w2s(b.x,b.y);
    const RmPx = Rm*viewScale;

    sceneCtx.strokeStyle = BUOY_COLORS[i];
    sceneCtx.lineWidth = 1.8;
    sceneCtx.setLineDash([4,4]);
    sceneCtx.beginPath();
    sceneCtx.arc(bx,by,RmPx,0,Math.PI*2);
    sceneCtx.stroke();
    sceneCtx.setLineDash([]);

    const tArr = trueDistance(b,receiver)/C;
    if(tc >= tArr && tc < tArr+0.25){
      const a = 1 - (tc-tArr)/0.25;
      sceneCtx.fillStyle = `rgba(255,210,74,${a})`;
      sceneCtx.beginPath(); sceneCtx.arc(bx,by,5,0,Math.PI*2); sceneCtx.fill();
    }
  });

  const [rx,ry] = w2s(receiver.x, receiver.y);
  buoys.forEach((b,i)=>{
    const [bx,by] = w2s(b.x,b.y);
    sceneCtx.strokeStyle = `rgba(${hex2rgb(BUOY_COLORS[i])},0.35)`;
    sceneCtx.lineWidth = 1;
    sceneCtx.beginPath(); sceneCtx.moveTo(rx,ry); sceneCtx.lineTo(bx,by); sceneCtx.stroke();

    const mx = (rx+bx)/2, my = (ry+by)/2;
    sceneCtx.fillStyle = BUOY_COLORS[i];
    sceneCtx.font = '10px Consolas, monospace';
    sceneCtx.textAlign = 'center';
    sceneCtx.fillText(measuredDistance(b,i).toFixed(0)+'м', mx, my-6);
  });
}

// ============================================================
//  РЕЖИМ TDOA
// ============================================================
function drawTDOA(){
  const cycle = 5.0;
  const tc = state.t % cycle;

  if(state.showWave){
    buoys.forEach((b,i)=>{
      const [bx,by] = w2s(b.x,b.y);
      const Rpx = tc*C*viewScale;
      if(Rpx < Math.max(SW,SH)*1.2){
        const alpha = Math.max(0, 1 - tc*C/3000);
        sceneCtx.strokeStyle = `rgba(${hex2rgb(BUOY_COLORS[i])},${alpha*0.5})`;
        sceneCtx.lineWidth = 1;
        sceneCtx.beginPath();
        sceneCtx.arc(bx,by,Rpx,0,Math.PI*2);
        sceneCtx.stroke();
      }
    });
  }

    if (state.showHyper){
		const pairs = [[0,1],[1,2],[2,3],[3,0]];
		pairs.forEach(([i,j])=>{
		  drawHyperbola(buoys[i], buoys[j], measuredTDOA(i,j),
						BUOY_COLORS[i], BUOY_COLORS[j]);
		});
	}

  const [rx,ry] = w2s(receiver.x, receiver.y);
  sceneCtx.strokeStyle = 'rgba(111,227,255,0.7)';
  sceneCtx.lineWidth = 1.5;
  sceneCtx.setLineDash([3,4]);
  sceneCtx.beginPath();
  sceneCtx.arc(rx,ry, 22 + Math.sin(state.t*5)*2, 0, Math.PI*2);
  sceneCtx.stroke();
  sceneCtx.setLineDash([]);
}

function drawHyperbola(A, B, dR, colorI, colorJ){
  const dx = B.x-A.x, dy = B.y-A.y;
  const d = Math.hypot(dx,dy);
  if(d < 1) return;
  const c = d/2;
  const ux = dx/d, uy = dy/d;
  const mx = (A.x+B.x)/2, my = (A.y+B.y)/2;

  const a = Math.abs(dR)/2;
  if(a < 1 || a >= c) return;
  const bb = Math.sqrt(c*c - a*a);
  const sign = dR >= 0 ? 1 : -1;

  // строим точки центральной кривой в экранных координатах
  const pts = [];
  const tmax = 2.5;
  for(let tt=-tmax; tt<=tmax; tt+=0.06){
    const xh = sign * a*Math.cosh(tt);
    const yh = bb*Math.sinh(tt);
    const wx = mx + xh*ux - yh*uy;
    const wy = my + xh*uy + yh*ux;
    const [sx,sy] = w2s(wx,wy);
    pts.push([sx,sy]);
  }
  if(pts.length < 3) return;

  // сдвиг по нормали: половина толщины «двухцветной нити»
  const SHIFT = 1.75;   // px; полная ширина нити = 2*SHIFT = 3.5 px

  // нормаль в каждой точке — через соседей
  // для крайних точек берём одностороннюю разность
  const nx = new Array(pts.length);
  const ny = new Array(pts.length);
  for(let k=0; k<pts.length; k++){
    const k0 = Math.max(0, k-1);
    const k1 = Math.min(pts.length-1, k+1);
    let tx = pts[k1][0] - pts[k0][0];
    let ty = pts[k1][1] - pts[k0][1];
    const len = Math.hypot(tx,ty) || 1;
    tx /= len; ty /= len;
    // нормаль = касательная, повёрнутая на 90°
    nx[k] = -ty;
    ny[k] =  tx;
  }

  sceneCtx.lineWidth = 1.6;
  sceneCtx.lineCap = 'butt';

  // линия цвета буя A — сдвиг +SHIFT
  sceneCtx.strokeStyle = colorI;
  sceneCtx.beginPath();
  for(let k=0; k<pts.length; k++){
    const x = pts[k][0] + nx[k]*SHIFT;
    const y = pts[k][1] + ny[k]*SHIFT;
    if(k===0) sceneCtx.moveTo(x,y); else sceneCtx.lineTo(x,y);
  }
  sceneCtx.stroke();

  // линия цвета буя B — сдвиг -SHIFT
  sceneCtx.strokeStyle = colorJ;
  sceneCtx.beginPath();
  for(let k=0; k<pts.length; k++){
    const x = pts[k][0] - nx[k]*SHIFT;
    const y = pts[k][1] - ny[k]*SHIFT;
    if(k===0) sceneCtx.moveTo(x,y); else sceneCtx.lineTo(x,y);
  }
  sceneCtx.stroke();
}

// ============================================================
//  РЕЖИМ USBL
// ============================================================
function drawUSBL(){
  const [rx,ry] = w2s(receiver.x, receiver.y);
  const b = buoys[state.activeBuoy];

  // --- фронт сигнала от активного буя ---
  const cycle = 4.0;
  const tc = state.t % cycle;
  const [bx,by] = w2s(b.x, b.y);
  const R = tc*C;                 // радиус фронта, м
  const Rpx = R*viewScale;

  if(Rpx < Math.max(SW,SH)*1.2){
    const alpha = Math.max(0, 1 - R/3000);
    sceneCtx.strokeStyle = `rgba(${hex2rgb(BUOY_COLORS[state.activeBuoy])},${alpha*0.55})`;
    sceneCtx.lineWidth = 1;
    sceneCtx.beginPath();
    sceneCtx.arc(bx,by,Rpx,0,Math.PI*2);
    sceneCtx.stroke();
  }

  // момент прихода на приёмник
  const tArr = trueDistance(b, receiver)/C;
  const justArrived = (tc >= tArr && tc < tArr + 0.25);
  if(justArrived){
    const a = 1 - (tc-tArr)/0.25;
    sceneCtx.fillStyle = `rgba(255,210,74,${a})`;
    sceneCtx.beginPath();
    sceneCtx.arc(rx, ry, 6 + (1-a)*10, 0, Math.PI*2);
    sceneCtx.fill();
  }

  // --- антенна ---
  const basePx = 22;
  const hydros = [-1,0,1].map(k=>({ x: rx + k*basePx/2, y: ry }));

  sceneCtx.strokeStyle = '#6fe3ff';
  sceneCtx.lineWidth = 2;
  sceneCtx.beginPath();
  sceneCtx.moveTo(hydros[0].x, hydros[0].y);
  sceneCtx.lineTo(hydros[2].x, hydros[2].y);
  sceneCtx.stroke();

  hydros.forEach((h,idx)=>{
    sceneCtx.fillStyle = idx===1 ? '#6fff9a' : '#6fe3ff';
    sceneCtx.beginPath();
    sceneCtx.arc(h.x, h.y, 3.5, 0, Math.PI*2);
    sceneCtx.fill();
  });

  // --- луч пеленга ---
  const ang = measuredBearing(b, state.activeBuoy);
  const screenAng = -ang;
  const L = 3000*viewScale;

  sceneCtx.strokeStyle = 'rgba(255,210,74,0.85)';
  sceneCtx.lineWidth = 1.5;
  sceneCtx.setLineDash([5,5]);
  sceneCtx.beginPath();
  sceneCtx.moveTo(rx,ry);
  sceneCtx.lineTo(rx + Math.cos(screenAng)*L, ry + Math.sin(screenAng)*L);
  sceneCtx.stroke();
  sceneCtx.setLineDash([]);

  // дуга угла от оси +X
  sceneCtx.strokeStyle = '#ffd24a';
  sceneCtx.lineWidth = 1.5;
  sceneCtx.beginPath();
  sceneCtx.arc(rx, ry, 55, 0, screenAng, screenAng<0);
  sceneCtx.stroke();

  const deg = (ang*180/Math.PI + 360) % 360;
  sceneCtx.fillStyle = '#ffd24a';
  sceneCtx.font = '11px Consolas, monospace';
  sceneCtx.textAlign = 'left';
  sceneCtx.fillText(deg.toFixed(1)+'°', rx + Math.cos(screenAng/2)*70,
                                 ry + Math.sin(screenAng/2)*70);

  // подсветка активного буя кольцом
  sceneCtx.strokeStyle = '#ffd24a';
  sceneCtx.lineWidth = 1;
  sceneCtx.beginPath();
  sceneCtx.arc(bx,by, 18, 0, Math.PI*2);
  sceneCtx.stroke();

  // справка о дальности
  const dTrue = trueDistance(b, receiver);
  sceneCtx.fillStyle = '#7fb5cc';
  sceneCtx.textAlign = 'center';
  const midx = (rx+bx)/2, midy = (ry+by)/2;
  sceneCtx.fillText('~'+dTrue.toFixed(0)+' м', midx, midy-8);

  // --- подпись времени в углу ---
  sceneCtx.fillStyle = '#7fb5cc';
  sceneCtx.font = '10px Consolas, monospace';
  sceneCtx.textAlign = 'left';
  sceneCtx.fillText(`t = ${tc.toFixed(2)} с`, 12, SH-40);
}
// ============================================================
//  МИНИ-ПАНЕЛЬ USBL
// ============================================================
function drawInset(){
  if(state.mode !== 'usbl'){
    insetBox.classList.add('hidden');
    return;
  }
  insetBox.classList.remove('hidden');
  resizeInset();

  insetCtx.fillStyle = '#040e15';
  insetCtx.fillRect(0,0,IW2,IH2);

  const cx = IW2/2, cy = IH2*0.62;
  const base = INSET_BASE_PX;
  const hydros = [-1,0,1].map(k=>({ x: cx + k*base/2, y: cy }));

  const b = buoys[state.activeBuoy];
  const bearing = measuredBearing(b, state.activeBuoy);
  // screenBearing — угол НА буй (для экрана, y вниз)
  const screenBearing = -bearing;
  // направление распространения волны — ОТ буя к приёмнику,
  // то есть screenBearing + π
  const propDir = screenBearing + Math.PI;

  const nx = Math.cos(propDir);
  const ny = Math.sin(propDir);
  
  
  const fx = -ny, fy = nx;

  const speed = INSET_WAVE_SPEED_PX;
  const phase = (state.t * speed) % INSET_LAMBDA_PX;
  const span = Math.max(IW2, IH2) * 1.6;
  const halfLines = Math.ceil(span / INSET_LAMBDA_PX);
  for(let k=-halfLines; k<=halfLines; k++){
    const off = k*INSET_LAMBDA_PX + phase;
    const px = cx + nx*off;
    const py = cy + ny*off;
    const x1 = px + fx*span/2, y1 = py + fy*span/2;
    const x2 = px - fx*span/2, y2 = py - fy*span/2;

    const a = 0.20 + 0.35*Math.abs(Math.cos((off/INSET_LAMBDA_PX)*Math.PI));
    insetCtx.strokeStyle = `rgba(111,227,255,${a})`;
    insetCtx.lineWidth = 1.2;
    insetCtx.beginPath();
    insetCtx.moveTo(x1,y1);
    insetCtx.lineTo(x2,y2);
    insetCtx.stroke();
  }

  insetCtx.strokeStyle = '#0e6f8a';
  insetCtx.lineWidth = 2;
  insetCtx.beginPath();
  insetCtx.moveTo(hydros[0].x, hydros[0].y);
  insetCtx.lineTo(hydros[2].x, hydros[2].y);
  insetCtx.stroke();

  hydros.forEach((h,i)=>{
    const proj = (h.x-cx)*nx + (h.y-cy)*ny;
    const hitPhase = ((proj - phase) / INSET_LAMBDA_PX);
    const frac = ((hitPhase % 1) + 1) % 1;
    const glow = Math.max(0, 1 - frac*1.6);

    insetCtx.fillStyle = '#040e15';
    insetCtx.strokeStyle = i===1 ? '#6fff9a' : '#6fe3ff';
    insetCtx.lineWidth = 1.6;
    insetCtx.beginPath();
    insetCtx.arc(h.x, h.y, 5, 0, Math.PI*2);
    insetCtx.fill();
    insetCtx.stroke();

    if(glow > 0.02){
      insetCtx.fillStyle = `rgba(255,210,74,${glow*0.9})`;
      insetCtx.beginPath();
      insetCtx.arc(h.x, h.y, 3 + glow*5, 0, Math.PI*2);
      insetCtx.fill();
    }

    insetCtx.fillStyle = '#7fb5cc';
    insetCtx.font = '9px Consolas, monospace';
    insetCtx.textAlign = 'center';
    insetCtx.fillText(`h${i}`, h.x, h.y + 18);
  });

  const deg = ((bearing*180/Math.PI) + 360) % 360;
  const dPhi_schem = (360 * (INSET_BASE_PX/INSET_LAMBDA_PX) * Math.sin(bearing)) % 360;
  const dPhi_schem_abs = Math.abs(((dPhi_schem+540)%360)-180);

  const dReal = 0.30, lambdaReal = 0.05;
  const dPhi_real = (360 * (dReal/lambdaReal) * Math.sin(bearing)) % 360;
  const dPhi_real_abs = Math.abs(((dPhi_real+540)%360)-180);

  insetCtx.fillStyle = '#cfe8f5';
  insetCtx.font = '10px Consolas, monospace';
  insetCtx.textAlign = 'right';
  insetCtx.fillText(`θ = ${deg.toFixed(1)}°`, IW2-8, 16);
  insetCtx.fillText(`Δφ(схема) = ${dPhi_schem_abs.toFixed(0)}°`, IW2-8, 30);
  insetCtx.fillStyle = '#7fb5cc';
  insetCtx.fillText(`Δφ(реал)  ≈ ${dPhi_real_abs.toFixed(0)}°`, IW2-8, 44);
}

// ============================================================
//  ОЦЕНКА И ВЫВОД
// ============================================================
function updateSolution(){
  let sol = null;
  if(state.mode==='toa')  sol = solveTOA();
  if(state.mode==='tdoa') sol = solveTDOA();
  if(state.mode==='usbl') sol = solveUSBL();

  if(!sol){ setResult('—','pending'); return; }

  const err = Math.hypot(sol.x-receiver.x, sol.y-receiver.y);

  const [sx,sy] = w2s(sol.x, sol.y);
  const [tx,ty] = w2s(receiver.x, receiver.y);
  sceneCtx.strokeStyle = '#ffd24a';
  sceneCtx.lineWidth = 2;
  sceneCtx.beginPath();
  sceneCtx.moveTo(sx-8,sy); sceneCtx.lineTo(sx+8,sy);
  sceneCtx.moveTo(sx,sy-8); sceneCtx.lineTo(sx,sy+8);
  sceneCtx.stroke();

  if(err > 0.5){
    sceneCtx.strokeStyle = 'rgba(255,210,74,0.4)';
    sceneCtx.lineWidth = 1;
    sceneCtx.setLineDash([3,3]);
    sceneCtx.beginPath();
    sceneCtx.moveTo(sx,sy); sceneCtx.lineTo(tx,ty);
    sceneCtx.stroke();
    sceneCtx.setLineDash([]);
  }

  if(err < 40){
    setResult(`err = ${err.toFixed(1)} м`, 'ok');
  } else if(err < 200){
    setResult(`err = ${err.toFixed(0)} м`, 'pending');
  } else {
    setResult(`err = ${err.toFixed(0)} м`, 'fail');
  }

  return { sol, err };
}
function setResult(text, cls){
  const el = document.getElementById('result');
  el.textContent = text;
  el.className = cls;
}

// ============================================================
//  ОСЦИЛЛОГРАФ (нижняя панель)
// ============================================================
function drawIR(){
  irCtx.fillStyle = '#040e15';
  irCtx.fillRect(0,0,IW,IH);
  drawIRContent(irCtx, IW, IH);
}

function drawIRTo(ctx, w, h){
  ctx.fillStyle = '#040e15';
  ctx.fillRect(0,0,w,h);
  drawIRContent(ctx, w, h);
}

function drawIRContent(ctx, W, H){
  if(state.mode==='toa' || state.mode==='tdoa'){
    const lanes = buoys.length;
    const laneH = H/lanes;
    const cycle = (state.mode==='toa') ? 4.0 : 5.0;
    const tc = state.t % cycle;

    buoys.forEach((b,i)=>{
      const y = i*laneH + laneH/2;
      const tArr = trueDistance(b,receiver)/C;
      const fired = tc >= tArr;

      ctx.strokeStyle = '#122e3e';
      ctx.beginPath();
      ctx.moveTo(40,y); ctx.lineTo(W-10,y);
      ctx.stroke();

      const frac = Math.min(1, tc/cycle);
      const x = 40 + frac*(W-50);
      if(fired){
        ctx.fillStyle = BUOY_COLORS[i];
        ctx.beginPath(); ctx.arc(x,y,4,0,Math.PI*2); ctx.fill();
      } else {
        ctx.fillStyle = '#1c3a4a';
        ctx.beginPath(); ctx.arc(x,y,2.5,0,Math.PI*2); ctx.fill();
      }

      ctx.fillStyle = BUOY_COLORS[i];
      ctx.font = '10px Consolas, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(b.name, 32, y+3);
    });

    ctx.fillStyle = '#7fb5cc';
    ctx.font = '10px Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`t = ${tc.toFixed(2)} с`, 6, 12);
  }

  if(state.mode==='usbl'){
    const b = buoys[state.activeBuoy];
    const ang = measuredBearing(b, state.activeBuoy);
    const basePx = 22;
    const lambda = 12;
    const d = basePx;
    const phase0 = (d*Math.sin(ang))/lambda * 2*Math.PI / 10;

    for(let k=0;k<3;k++){
      const y0 = H*(k+1)/4;
      const phase = (k-1) * phase0;
      ctx.strokeStyle = k===1 ? '#6fff9a' : '#6fe3ff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for(let x=0;x<W;x+=2){
        const y = y0 + Math.sin(x/28 + phase + state.t*3)*12;
        if(x===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
      ctx.stroke();
      ctx.fillStyle = '#4a6a7a';
      ctx.font = '10px Consolas, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`h${k}`, 6, y0-14);
    }
    ctx.fillStyle = '#7fb5cc';
    ctx.font = '10px Consolas, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`Δφ = ${(phase0*180/Math.PI).toFixed(1)}°  ·  λ≈${(lambda*10).toFixed(0)} ед.`, W-8, 12);
  }
}

// ============================================================
//  БОКОВАЯ ПАНЕЛЬ
// ============================================================
function buildSidePanelHTML(solution){
  let html = '';

  if(state.mode==='toa'){
    html += `<h2>TOA — Time of Arrival</h2>
      <div class="side-block">
        <div class="desc">
          Односторонний: у приёмника и буёв <b>общие часы</b>.
          Буй излучает в известный момент; приёмник измеряет
          время прихода. Дальность:
        </div>
        <div class="formula">R_i = c · Δt_i</div>
        <div class="desc">Пересечение <b>окружностей</b> вокруг буёв — позиция.</div>
      </div>`;
  } else if(state.mode==='tdoa'){
    html += `<h2>TDOA — Time Difference</h2>
      <div class="side-block">
        <div class="desc">
          Буи <b>GIB</b> излучают синхронно. Приёмник измеряет
          <b>разности</b> времён прихода:
        </div>
        <div class="formula">ΔR_ij = c·(t_i − t_j)</div>
        <div class="desc">Геометрическое место — <b>гипербола</b>. Пересечение — позиция.</div>
      </div>
      <div class="side-block">
        <h2>Как читать гиперболы</h2>
        <div class="desc">
          Каждая гипербола построена по <b>паре буёв</b> и нарисована
          двумя параллельными линиями — цвет первого буя рядом
          с цветом второго:
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;margin-top:8px;font-size:11px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="display:inline-flex;flex-direction:column;gap:1px;">
              <span style="display:block;width:26px;height:2px;background:#6fe3ff;"></span>
              <span style="display:block;width:26px;height:2px;background:#ffd24a;"></span>
            </span>
            <span style="color:#7fb5cc;">B1 – B2</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="display:inline-flex;flex-direction:column;gap:1px;">
              <span style="display:block;width:26px;height:2px;background:#ffd24a;"></span>
              <span style="display:block;width:26px;height:2px;background:#ff8080;"></span>
            </span>
            <span style="color:#7fb5cc;">B2 – B3</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="display:inline-flex;flex-direction:column;gap:1px;">
              <span style="display:block;width:26px;height:2px;background:#ff8080;"></span>
              <span style="display:block;width:26px;height:2px;background:#6fff9a;"></span>
            </span>
            <span style="color:#7fb5cc;">B3 – B4</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="display:inline-flex;flex-direction:column;gap:1px;">
              <span style="display:block;width:26px;height:2px;background:#6fff9a;"></span>
              <span style="display:block;width:26px;height:2px;background:#6fe3ff;"></span>
            </span>
            <span style="color:#7fb5cc;">B4 – B1</span>
          </div>
        </div>
      </div>`;
  } else {
    html += `<h2>USBL — Ultra Short BaseLine</h2>
      <div class="side-block">
        <div class="desc">
          На приёмнике — <b>короткая база</b> из гидрофонов.
          Разность фаз на элементах даёт <b>пеленг</b> на буй:
        </div>
        <div class="formula">Δφ = 2π · d · sin θ / λ</div>
        <div class="desc">
          Дальность измеряется <b>отдельным акустическим каналом</b>
          той же системы — типично запрос-ответ между приёмником
          и буем.
        </div>
      </div>`;
  }

  html += `<div class="side-block"><h2>Измерения</h2>`;
  const [rx,ry] = [receiver.x, receiver.y];
  html += `<div class="kv"><span class="k">RX:</span><span class="v">(${rx.toFixed(0)}, ${ry.toFixed(0)}) м</span></div>`;

  buoys.forEach((b,i)=>{
    if(state.mode==='usbl'){
      const ang = (measuredBearing(b,i)*180/Math.PI + 360) % 360;
      html += `<div class="kv">
        <span class="k" style="color:${BUOY_COLORS[i]}">θ${i+1} → ${b.name}:</span>
        <span class="v">${ang.toFixed(1)}°</span></div>`;
    } else {
      const R = measuredDistance(b,i);
      html += `<div class="kv">
        <span class="k" style="color:${BUOY_COLORS[i]}">R${i+1} → ${b.name}:</span>
        <span class="v">${R.toFixed(1)} м</span></div>`;
    }
  });
  html += `</div>`;

  if(state.mode==='tdoa'){
    html += `<div class="side-block"><h2>Разности ΔR</h2>`;
    const pairs = [[0,1],[1,2],[2,3],[3,0]];
    pairs.forEach(([i,j])=>{
      const dR = measuredTDOA(i,j);
      html += `<div class="kv">
        <span class="k">ΔR<sub>${i+1},${j+1}</sub>:</span>
        <span class="v">${dR.toFixed(1)} м</span></div>`;
    });
    html += `</div>`;
  }

  html += `<div class="side-block"><h2>Решение</h2>`;
  if(solution && solution.sol){
    const s = solution.sol;
    const err = solution.err;
    const errCls = err < 40 ? 'good' : (err < 200 ? 'warn' : 'bad');
    html += `<div class="kv"><span class="k">Оценка:</span>
              <span class="v">(${s.x.toFixed(0)}, ${s.y.toFixed(0)}) м</span></div>`;
    html += `<div class="kv"><span class="k">Ошибка:</span>
              <span class="v ${errCls}">${err.toFixed(1)} м</span></div>`;
  } else {
    html += `<div class="desc">недостаточно данных</div>`;
  }
  const gdop = computeGDOP();
  if(gdop !== null){
    const cls = gdop < 1.5 ? 'good' : (gdop < 10 ? 'warn' : 'bad');
    html += `<div class="kv"><span class="k">GDOP:</span>
              <span class="v ${cls}">${gdop.toFixed(2)}</span></div>`;
  }
  html += `</div>`;

  html += `<div class="side-block"><h2>Буи</h2><div class="buoy-list">`;
  buoys.forEach((b,i)=>{
    const active = (state.mode==='usbl' && state.activeBuoy===i);
    html += `<div class="buoy-row ${active?'active':''}" data-buoy="${i}">
      <span class="swatch" style="background:${BUOY_COLORS[i]}"></span>
      <span class="name">${b.name}</span>
      <span class="coord">(${b.x.toFixed(0)}, ${b.y.toFixed(0)})</span>
    </div>`;
  });
  html += `</div>
    <div class="desc" style="margin-top:8px">Клик по строке — выбрать цель (USBL).<br>Тащи буи и приёмник прямо на сцене.</div>
  </div>`;

  return html;
}

function drawSidePanel(solution){
  const p = document.getElementById('side-panel');
  p.innerHTML = buildSidePanelHTML(solution);
}

// ============================================================
//  ДРЕЙФ ПРИЁМНИКА
// ============================================================
function updateDrift(dt){
  if(state.paused) return;
  if(state.dragging && state.dragging.kind==='rx') return;
  receiver.x += receiver.vx*dt;
  receiver.y += receiver.vy*dt;
  const lim = 800;
  if(receiver.x >  lim || receiver.x < -lim) receiver.vx *= -1;
  if(receiver.y >  lim || receiver.y < -lim) receiver.vy *= -1;
}

// ============================================================
//  ГЛАВНЫЙ ЦИКЛ
// ============================================================
let lastTs = 0;
function frame(ts){
  const dt = lastTs ? Math.min(0.05, (ts-lastTs)/1000) : 0;
  lastTs = ts;
  state.t += dt * state.animSpeed;

  // ---------- демо-режим ----------
  const now = performance.now();
  if(!state.demoMode && (now - state.lastClickTime > DEMO_IDLE_MS)){
    enterDemoMode();
  }
  if(state.demoMode){
    if(now - state.demoSceneStart > DEMO_SCENE_MS){
      state.demoSceneIdx = (state.demoSceneIdx + 1) % SCENES.length;
      applyScene(state.demoSceneIdx);
      state.demoSceneStart = now;
    }
  }

  updateDrift(dt);

  resizeScene();
  resizeIR();

  drawGrid();
  if(state.mode==='toa')  drawTOA();
  if(state.mode==='tdoa') drawTDOA();
  if(state.mode==='usbl') drawUSBL();

  drawBuoys();
  drawReceiver();
  drawScaleBar();

  const solution = updateSolution();
  if(solution){
    lastSolution = solution.sol;
    lastError = solution.err;
  }

  drawIR();
  drawInset();
  drawSidePanel(solution);
  
  // мобильная панель «Инфо» обновляется, если открыта
  if(!mobileOverlay.classList.contains('hidden') && !mobileInfoPane.classList.contains('hidden')){
    mobileInfoPane.innerHTML = buildSidePanelHTML({ sol: lastSolution, err: lastError });
  }
  // мобильный IR
  if(!mobileOverlay.classList.contains('hidden') && !mobileIRPane.classList.contains('hidden')){
    resizeMobileIR();
    drawIRTo(mobileIRCtx, MIR_W, MIR_H);
  }

  requestAnimationFrame(frame);
}

// ============================================================
//  UI / ОБРАБОТЧИКИ
// ============================================================
document.querySelectorAll('.mode-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.mode-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    state.mode = btn.dataset.mode;
    state.t = 0;
        document.getElementById('status').textContent =
      `режим: ${state.mode.toUpperCase()}` +
      (state.mode==='toa' ? ' · односторонний' : '');
    document.getElementById('usbl-inset')
            .classList.toggle('hidden', state.mode!=='usbl');
  });
});

document.querySelectorAll('.speed-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.speed-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    state.animSpeed = parseFloat(btn.dataset.speed);
  });
});

document.getElementById('pause-btn').addEventListener('click', (e)=>{
  state.paused = !state.paused;
  e.target.classList.toggle('paused', state.paused);
  e.target.textContent = state.paused ? '▶ пуск' : '⏸ дрейф';
});

document.getElementById('demo-btn').addEventListener('click', ()=>{
  toggleDemoMode();
  state.lastClickTime = performance.now();
});

// любой клик / тап / клавиша сбрасывает idle-таймер и выходит из демо
function onUserActivity(){
  state.lastClickTime = performance.now();
  if(state.demoMode) exitDemoMode();
}
window.addEventListener('mousedown', onUserActivity, {capture: true});
window.addEventListener('touchstart', onUserActivity, {capture: true});
window.addEventListener('keydown', onUserActivity);

document.getElementById('noise-slider').addEventListener('input', e=>{
  state.noiseSigma = parseFloat(e.target.value);
  document.getElementById('noise-val').textContent = state.noiseSigma.toFixed(1)+' м';
});

document.getElementById('reset-btn').addEventListener('click', ()=>{
  state.t = 0;
  receiver.x = 120; receiver.y = -80;
  receiver.vx = 55; receiver.vy = 35;
  buoys[0].x = -500; buoys[0].y =  500;
  buoys[1].x =  500; buoys[1].y =  500;
  buoys[2].x =  500; buoys[2].y = -500;
  buoys[3].x = -500; buoys[3].y = -500;
});

document.getElementById('show-hyper').addEventListener('change', e=>{
  state.showHyper = e.target.checked;
});
document.getElementById('show-wave').addEventListener('change', e=>{
  state.showWave = e.target.checked;
});


// ---------- мобильный оверлей ----------
const mobileOverlay = document.getElementById('mobile-overlay');
const mobileInfoBtn = document.getElementById('mobile-info-btn');
const mobileOverlayClose = document.getElementById('mobile-overlay-close');
const mobileTabs = document.querySelectorAll('.mobile-tab');
const mobileInfoPane = document.getElementById('mobile-info-pane');
const mobileIRPane = document.getElementById('mobile-ir-pane');

function openMobileOverlay(){
  mobileOverlay.classList.remove('hidden');
  // размер канваса под оверлей
  requestAnimationFrame(()=>{ resizeMobileIR(); });
}
function closeMobileOverlay(){
  mobileOverlay.classList.add('hidden');
}
mobileInfoBtn.addEventListener('click', openMobileOverlay);
mobileOverlayClose.addEventListener('click', closeMobileOverlay);

mobileTabs.forEach(tab=>{
  tab.addEventListener('click', ()=>{
    mobileTabs.forEach(t=>t.classList.remove('active'));
    tab.classList.add('active');
    if(tab.dataset.tab==='info'){
      mobileInfoPane.classList.remove('hidden');
      mobileIRPane.classList.add('hidden');
    } else {
      mobileInfoPane.classList.add('hidden');
      mobileIRPane.classList.remove('hidden');
      requestAnimationFrame(()=>{ resizeMobileIR(); });
    }
  });
});

// ---- мобильный IR-канвас ----
const mobileIRCanvas = document.getElementById('mobile-ir-canvas');
const mobileIRCtx = mobileIRCanvas.getContext('2d');
let MIR_W=0, MIR_H=0, MIR_DPR=1;
function resizeMobileIR(){
  const r = mobileIRPane.getBoundingClientRect();
  if(r.width < 2 || r.height < 2) return;
  MIR_DPR = window.devicePixelRatio||1;
  MIR_W = r.width; MIR_H = r.height;
  mobileIRCanvas.width = MIR_W*MIR_DPR;
  mobileIRCanvas.height = MIR_H*MIR_DPR;
  mobileIRCanvas.style.width = MIR_W+'px';
  mobileIRCanvas.style.height = MIR_H+'px';
  mobileIRCtx.setTransform(MIR_DPR,0,0,MIR_DPR,0,0);
}




// ============================================================
//  СТАРТ
// ============================================================
// ============================================================
//  СТАРТ
// ============================================================
resizeScene();
resizeIR();

function handleBuoyRowClick(e){
  const row = e.target.closest('.buoy-row');
  if(!row) return;
  state.activeBuoy = parseInt(row.dataset.buoy, 10);
}
document.getElementById('side-panel').addEventListener('mousedown', handleBuoyRowClick);
document.getElementById('mobile-info-pane').addEventListener('mousedown', handleBuoyRowClick);

requestAnimationFrame(frame);
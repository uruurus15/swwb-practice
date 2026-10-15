// モード切替（対戦 / マリガン練習 / 盤面再現）・デッキ一覧・カード詳細・カード選択。
// index.html のスクリプト（S, INFO, APP, api, render, byOid など）のあとで initModes() が呼ばれる。
// このファイルの画面は対戦画面と同じ CSS クラス（.u .h .leader .info .board）を使うが、
// データ属性は別物にして、対戦のグローバル（S, INS, クリック処理）には触れない。
let MODE = 'play';
const SW = window.SWWB, GM = window.SWWBGame;
const q$ = id => document.getElementById(id);
const imgUrl = c => 'cardimg/' + c.official_id + '.webp';
const popcnt = n => { let k = 0; while (n) { k += n & 1; n >>= 1; } return k; };
const cardOf = oid => byOid()[oid];
const CLS_COLORS = ['#778', '#3f9c53', '#c9a43a', '#3f6fd0', '#d4762f', '#8a45c4', '#d8d8e8', '#2fb5c4'];

// ---------------- カード詳細（クリックで表示） ----------------
function showCardPop(c) {
  const el = q$('cardpop');
  const kind = { follower: 'フォロワー', spell: 'スペル', amulet: 'アミュレット' }[c.kind];
  const st = c.kind === 'follower' ? ' ・ ' + c.atk + '/' + c.hp : (c.countdown ? ' ・ カウントダウン' + c.countdown : '');
  el.innerHTML = '<img src="' + imgUrl(c) + '" alt=""><div><div class="nm">' + esc(c.name) + '</div><div class="tip">' + INFO.classes[c.class] + ' ・ ' + kind + ' ・ コスト' + c.cost + st + (c.enhance ? ' ・ エンハンス' + c.enhance : '') + '</div><div class="tx">' + fmt(c.text) + '</div></div>';
  el.classList.add('on');
}
document.addEventListener('click', e => { const el = q$('cardpop'); if (el && el.classList.contains('on') && !e.target.closest('[data-pop]')) el.classList.remove('on'); }, true);

// ---------------- 共通の部品（見た目は対戦画面と同じ） ----------------
function unitTile(c, o) {
  const bonus = o.super_evolved ? 3 : (o.evolved ? 2 : 0);
  const amu = c.kind === 'amulet';
  const bits = (c.kw | 0) | (o.kw | 0);
  const kws = GM.kwNames(bits).map(k => '<span class="kw" title="' + esc(k) + '">' + (KWAB[k] || esc(k[0])) + '</span>').join('');
  const cls = ['u'];
  if (amu) cls.push('amulet');
  if (bits & 1) cls.push('ward');
  if (o.super_evolved) cls.push('sevo'); else if (o.evolved) cls.push('evo');
  (o.cls || []).forEach(x => cls.push(x));
  const atkCls = o.atk > c.atk + bonus ? 'up' : (o.atk < c.atk + bonus ? 'down' : '');
  const hpCls = o.hp < o.max_hp ? 'down' : (o.max_hp > c.hp + bonus ? 'up' : '');
  const stat = amu ? '<div class="cd">' + o.countdown + '</div>' : '<div class="b atk ' + atkCls + '">' + o.atk + '</div><div class="b hp ' + hpCls + '">' + o.hp + '</div>';
  return '<div class="' + cls.join(' ') + '" ' + (o.attrs || '') + '><div class="art"><img src="' + imgUrl(c) + '" alt="' + esc(c.name) + '" draggable="false"></div><div class="kws">' + kws + '</div>' + stat + '</div>';
}
function handTile(c, o) {
  const cost = o.cost != null ? o.cost : c.cost;
  const cc = cost < c.cost ? ' low' : (cost > c.cost ? ' high' : '');
  const cls = ['h'].concat(o.cls || []);
  return '<div class="' + cls.join(' ') + '" ' + (o.attrs || '') + '><img src="' + imgUrl(c) + '" alt="' + esc(c.name) + '" draggable="false"><span class="cost' + cc + '">' + cost + '</span>' + (o.tag ? '<span class="tag ' + (o.tagCls || '') + '">' + o.tag + '</span>' : '') + '</div>';
}
function slotTile(kind, attrs) { return '<div class="' + kind + ' slot" ' + attrs + ' title="カードを追加"><span>＋</span></div>'; }
function leaderOrb(cls, inner, attrs) {
  return '<div class="leader" ' + (attrs || '') + ' style="background:radial-gradient(circle at 35% 30%, ' + CLS_COLORS[cls] + ', #1a2040)"><span style="font-size:11px">' + INFO.classes[cls] + '</span><span class="hpb">' + inner + '</span></div>';
}
function orbsHtml(n, on, cls, attr, prefix) { let h = ''; for (let k = 0; k < n; k++) h += '<span class="' + cls + ' ' + (k < on ? 'on' : '') + '" ' + (attr ? attr + '="' + (prefix || '') + k + '"' : '') + '></span>'; return h; }
function backsHtml(n) { return '<div class="backs">' + '<span class="back"></span>'.repeat(Math.min(n, 10)) + '</div>'; }
// 手札・手札欄の重なりは、幅が変わるたび（CSS・フォント・画像の読み込み後や画面サイズの変更）に計算し直す
const FIT_RO = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(es => es.forEach(e => fitRow(e.target))) : null;
function watchRows(rows) { if (!FIT_RO) return; FIT_RO.disconnect(); rows.forEach(r => r && FIT_RO.observe(r)); }
function fitRow(row) {
  if (!row || row.clientWidth < 60) return;
  const t = row.querySelector('.h'), n = row.querySelectorAll('.h').length;
  if (!t || n < 2) { row.style.setProperty('--ov', '8px'); return; }
  row.style.setProperty('--ov', Math.floor(Math.min(8, (row.clientWidth - 16 - n * t.offsetWidth) / (n - 1))) + 'px');
}
function deckRows(deckId, inHand, remain) {
  const d = APP.decks.resolve(deckId);
  const list = d.cards.map(([oid, n]) => ({ c: cardOf(oid), n })).filter(x => x.c);
  list.sort((a, b) => a.c.cost - b.c.cost || a.c.official_id - b.c.official_id);
  const rows = list.map(({ c, n }) => {
    const h = inHand[c.id] || 0;
    const r = remain ? (remain[c.id] || 0) : null;
    const cls = ['dr']; if (h) cls.push('hit'); if (r === 0) cls.push('zero');
    const right = r != null ? '山札 ' + r + '/' + n + (h ? ' ・手札 ' + h : '') : (h ? '手札 ' + h + ' / ' + n : '×' + n);
    return '<div class="' + cls.join(' ') + '" data-pop="1" data-oid="' + c.official_id + '"><span class="c">' + c.cost + '</span><span class="nm">' + esc(c.name) + '</span><span class="n">' + right + '</span></div>';
  }).join('');
  return { d, total: list.reduce((a, x) => a + x.n, 0), rows };
}
function countBy(arr) { const m = {}; arr.forEach(c => m[c] = (m[c] || 0) + 1); return m; }

// ---------------- デッキ一覧（対戦・盤面再現では画面の端のドロワー） ----------------
function currentDrawerDeck() {
  if (MODE === 'setup') return { id: SETUP.decks[0], hand: SETUP.sides[0].hand.map(h => cardOf(h.oid) && cardOf(h.oid).id) };
  const g = APP.game;
  if (g && g.started && g.myDeckId) return { id: g.myDeckId, remain: S && S.deck_counts, hand: S && S.hand.map(h => h.card) };
  return null;
}
function drawerRender() {
  const box = q$('drawer');
  if (MODE === 'mull' || !box.classList.contains('open')) return;
  const cur = currentDrawerDeck();
  if (!cur) { box.querySelector('.list').innerHTML = '<span class="tip">デッキを選ぶと一覧が出ます</span>'; q$('drawerTitle').textContent = 'デッキ一覧'; return; }
  let info;
  try { const remain = {}; if (cur.remain) cur.remain.forEach(([c, n]) => remain[c] = n); info = deckRows(cur.id, countBy(cur.hand || []), cur.remain ? remain : null); }
  catch (e) { box.querySelector('.list').innerHTML = '<span class="tip">' + esc(e.message) + '</span>'; return; }
  q$('drawerTitle').textContent = info.d.name + '（' + info.total + '枚）';
  box.querySelector('.list').innerHTML = info.rows;
}
function toggleDrawer(force) {
  const box = q$('drawer');
  const on = force != null ? force : !box.classList.contains('open');
  box.classList.toggle('open', on);
  q$('drawerTab').textContent = on ? 'デッキ ▶' : 'デッキ ◀';
  q$('drawerTab').style.right = on ? '274px' : '0';
  drawerRender();
}

// 選んでいたデッキが削除された・使えなくなったときは、使える先頭のデッキに戻す
function ensureDecks() {
  INFO.decks = APP.decks.listing();   // 最新の一覧（削除・保存を反映）
  const ready = INFO.decks.filter(d => d.ready);
  const ok = id => id && ready.some(d => d.id === id);
  const fb = (ready.find(d => d.id === 'b:0') || ready[0]).id;
  let changed = false;
  if (!ok(MULL.deckId)) { MULL.deckId = fb; MULL.phase = 'idle'; MULL.history = []; MULL.count = 0; changed = true; }
  SETUP.decks = SETUP.decks.map(d => ok(d) ? d : fb);
  return changed;
}

// ---------------- モード切替 ----------------
function setMode(m) {
  MODE = m;
  q$('game').style.display = m === 'play' ? '' : 'none';
  q$('mullView').classList.toggle('on', m === 'mull');
  q$('setupView').classList.toggle('on', m === 'setup');
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
  q$('status').style.display = m === 'play' ? '' : 'none';
  q$('drawerTab').style.display = m === 'mull' ? 'none' : '';
  if (m === 'mull') toggleDrawer(false);
  if (m === 'play') { q$('settingsBtn').style.display = ''; if (S) render(); else { q$('status').className = 'wait'; q$('status').textContent = '「設定・新しいゲーム」からゲームを始めてください'; q$('settings').classList.add('open'); } }
  else { q$('settingsBtn').style.display = 'none'; q$('settings').classList.remove('open'); q$('cancelTop').style.display = 'none'; q$('againTop').style.display = 'none'; }
  if (m === 'mull') mullRender();
  if (m === 'setup') setupRender();
  drawerRender();
}

// ---------------- マリガン練習（ゲーム開始時のマリガンだけ） ----------------
const MULL = { order: [], view: GM.lsGet('swwb.mull.view', 'img'), deckId: null, first: '', phase: 'idle', hand0: [], hand1: [], mask: 0, seed: 0, count: 0, history: [], kept: 0 };
const mcall = o => SW.call({ slot: 1, ...o });
function mullDeal() {
  ensureDecks();
  const d = APP.decks.resolve(MULL.deckId);
  let seed = Math.floor(Math.random() * 2 ** 31);   // 毎回シードを変える
  const base = { op: 'reset', class0: d.class, cards0: d.cards, class1: d.class, cards1: d.cards };
  let o;
  for (let k = 0; k < 64; k++) {
    mcall({ ...base, seed });
    if (MULL.first === '') break;
    o = mcall({ op: 'observe', seat: 0 });
    if (o.going_first === (MULL.first === '1')) break;
    seed = (seed + 1) % 2 ** 31;
  }
  // 先に動く相手（ボット）のマリガンを済ませる
  let guard = 0;
  o = mcall({ op: 'observe', seat: 0 });
  while (!o.finished && !o.is_active && guard++ < 50) { mcall({ op: 'step', id: mcall({ op: 'bot', kind: 2 }).id }); o = mcall({ op: 'observe', seat: 0 }); }
  MULL.seed = seed; MULL.count++; MULL.phase = 'choose'; MULL.mask = 0;
  MULL.hand0 = o.my_hand.slice(); MULL.hand1 = []; MULL.goingFirst = o.going_first; MULL.deckSize = o.my_deck_size; MULL.oppHand = o.opp_hand_size;
}
function mullToggle(i) {
  if (MULL.phase !== 'choose') return;
  mcall({ op: 'step', id: 1 + i });
  MULL.mask = mcall({ op: 'observe', seat: 0 }).mull_mask;
  mullRender();
}
function mullConfirm() {
  if (MULL.phase !== 'choose') return;
  const mask = MULL.mask;
  mcall({ op: 'step', id: 0 });
  const o = mcall({ op: 'observe', seat: 0 });
  MULL.hand1 = o.my_hand.slice(); MULL.deckSize = o.my_deck_size;
  MULL.order = mcall({ op: 'deck', seat: 0 });   // 山札の上から（引く順）
  MULL.kept = MULL.hand0.length - popcnt(mask);
  MULL.phase = 'result'; MULL.doneMask = mask;
  MULL.history.unshift({ n: MULL.count, hand0: MULL.hand0.slice(), mask, hand1: MULL.hand1.slice(), first: MULL.goingFirst });
  if (MULL.history.length > 12) MULL.history.pop();
  mullRender();
}
function mullAgain() { mullDeal(); mullRender(); }
function mullPrimary() { if (MULL.phase === 'choose') mullConfirm(); else mullAgain(); }

/** 山札の並び（上から）。画像つき / 画像なしの一覧を切り替える */
function deckOrderHtml() {
  const o = MULL.order, img = MULL.view === 'img';
  const head = '<div class="dohead"><b>山札（上から ' + o.length + '枚）</b><span class="tip">1枚目が次に引くカード</span><span class="seg"><button data-dview="img"' + (img ? ' class="on"' : '') + '>画像</button><button data-dview="list"' + (!img ? ' class="on"' : '') + '>一覧</button></span></div>';
  let body;
  if (img) body = '<div class="dogrid">' + o.map((c, i) => '<div class="dot1" data-pop="1" data-cid="' + c + '"><img loading="lazy" src="' + imgUrl(INFO.cards[c]) + '" alt="' + esc(INFO.cards[c].name) + '"><span class="no">' + (i + 1) + '</span></div>').join('') + '</div>';
  else body = '<div class="dolist">' + o.map((c, i) => { const k = INFO.cards[c]; return '<div class="dr" data-pop="1" data-cid="' + c + '"><span class="no">' + (i + 1) + '</span><span class="c">' + k.cost + '</span><span class="nm">' + esc(k.name) + '</span></div>'; }).join('') + '</div>';
  return '<div class="deckorder">' + head + '<div class="dobody">' + body + '</div></div>';
}
function mullRender() {
  if (ensureDecks() || MULL.phase === 'idle') mullDeal();
  const v = q$('mullView');
  const decks = INFO.decks.filter(d => d.ready);
  const opt = d => '<option value="' + esc(d.id) + '"' + (d.id === MULL.deckId ? ' selected' : '') + '>' + (d.custom ? '★' : '') + INFO.classes[d.class] + '・' + esc(d.name) + '</option>';
  const handNow = MULL.phase === 'result' ? MULL.hand1 : MULL.hand0;
  const dk = deckRows(MULL.deckId, countBy(handNow), null);
  const me = APP.decks.resolve(MULL.deckId);
  const choose = MULL.phase === 'choose';
  // 左: デッキ一覧（常時表示）
  const left = '<div class="panel mdeck"><select id="mullDeck">' + decks.map(opt).join('') + '</select>' +
    '<div class="row" style="margin:6px 0"><select id="mullFirst"><option value="">先攻/後攻 ランダム</option><option value="1"' + (MULL.first === '1' ? ' selected' : '') + '>先攻</option><option value="0"' + (MULL.first === '0' ? ' selected' : '') + '>後攻</option></select><button id="mullEdit">デッキ編集</button></div>' +
    '<h3>' + esc(dk.d.name) + '（' + dk.total + '枚）</h3><div class="list">' + dk.rows + '</div></div>';
  // 中央: 対戦画面と同じ並び
  const oppInfo = '<div class="info">' + leaderOrb(me.class, '20') + '<div class="chips"><span class="chip">' + INFO.classes[me.class] + '</span><span class="chip">相手（' + (MULL.goingFirst ? '後攻' : '先攻') + '）</span></div>' + backsHtml(MULL.oppHand || 4) + '<span class="chip">手札 ' + (MULL.oppHand || 4) + '</span><span class="chip" style="margin-left:auto">山札 ' + (40 - (MULL.oppHand || 4)) + '</span></div>';
  const prompt = choose ? '入れ替えるカードをクリック → マリガン確定（Enter）' : 'マリガン後の手札です。「もう一度」で新しいシードの手札を配ります（Enter）';
  const returned = MULL.phase === 'result' ? MULL.hand0.filter((c, i) => (MULL.doneMask >> i) & 1) : [];
  const myBoard = returned.length ? returned.map(c => handTile(INFO.cards[c], { cls: ['out'], tag: '戻した', tagCls: 'gray', attrs: 'data-pop="1" data-cid="' + c + '"' })).join('') : '<span class="empty">' + (choose ? '自分の場' : '戻したカードはありません') + '</span>';
  const myInfo = '<div class="info">' + leaderOrb(me.class, '20') + '<div class="chips"><span class="chip">' + INFO.classes[me.class] + '</span><span class="chip">' + (MULL.goingFirst ? '先攻' : '後攻') + '</span><span class="chip">試行 #' + MULL.count + '</span><span class="chip">シード ' + MULL.seed + '</span></div><span class="chip" style="margin-left:auto">山札 ' + MULL.deckSize + '</span></div>';
  const hand = handNow.map((c, i) => {
    const cl = ['playable'];
    let tag = '', tagCls = '';
    if (choose && ((MULL.mask >> i) & 1)) { cl.push('mark'); tag = '入れ替え'; tagCls = 'red'; }
    if (!choose && i >= MULL.kept) { cl.push('new'); tag = '引いた'; tagCls = 'gold'; }
    return handTile(INFO.cards[c], { cls: cl, tag, tagCls, attrs: 'data-mt="' + i + '" data-cid="' + c + '"' });
  }).join('');
  const center = '<div class="mcenter' + (MULL.phase === 'result' ? ' res' : '') + '">' + oppInfo + '' + (MULL.phase === 'result' ? deckOrderHtml() : '<div class="board"><span class="empty">相手の場</span></div>') + '<div class="board">' + myBoard + '</div>' + myInfo + '<div class="hand-row" id="mullHand">' + hand + '</div>' + (choose ? '<div class="mprompt">' + prompt + '</div>' : '') + '</div>';
  // 右: 丸ボタン + 履歴
  const hist = MULL.history.map(h => '<div><b>#' + h.n + '（' + (h.first ? '先' : '後') + '）</b> ' + h.hand0.map((c, i) => ((h.mask >> i) & 1) ? '<s>' + esc(INFO.cards[c].name) + '</s>' : esc(INFO.cards[c].name)).join('、') + ' <b>→</b> <b>' + h.hand1.map(c => esc(INFO.cards[c].name)).join('、') + '</b></div>').join('') || '<span class="tip">まだありません</span>';
  const right = '<div class="mright"><button class="round" id="mullBtn">' + (choose ? 'マリガン<br>確定' : 'もう一度') + '<small>Enter</small></button><div class="tip" style="text-align:center">' + (choose ? popcnt(MULL.mask) + ' 枚を入れ替え' : '新しいシードで配り直し') + '</div><div class="panel hist" id="mullHist"><div class="tip" style="margin-bottom:4px">履歴（新しい順）</div>' + hist + '</div></div>';
  v.innerHTML = left + center + right;
  q$('mullDeck').onchange = e => { MULL.deckId = e.target.value; MULL.history = []; MULL.count = 0; MULL.phase = 'idle'; mullRender(); };
  q$('mullFirst').onchange = e => { MULL.first = e.target.value; MULL.phase = 'idle'; mullRender(); };
  q$('mullEdit').onclick = () => openEditor();
  q$('mullBtn').onclick = mullPrimary;
  v.querySelectorAll('[data-mt]').forEach(el => { el.onclick = () => mullToggle(+el.dataset.mt); el.oncontextmenu = e => { e.preventDefault(); showCardPop(INFO.cards[+el.dataset.cid]); }; });
  v.querySelectorAll('[data-cid][data-pop]').forEach(el => { el.onclick = () => showCardPop(INFO.cards[+el.dataset.cid]); });
  v.querySelectorAll('.mdeck .dr').forEach(el => { el.onclick = () => showCardPop(cardOf(+el.dataset.oid)); });
  v.querySelectorAll('.deckorder [data-cid]').forEach(el => { el.onclick = () => showCardPop(INFO.cards[+el.dataset.cid]); });
  v.querySelectorAll('[data-dview]').forEach(b => b.onclick = () => { MULL.view = b.dataset.dview; GM.lsSet('swwb.mull.view', MULL.view); mullRender(); });
  watchRows([q$('mullHand')]); requestAnimationFrame(() => fitRow(q$('mullHand')));
}

// ---------------- 盤面再現（対戦画面のまま直接編集） ----------------
const LIMITS = { leader_hp: [1, 99], pp: [0, 20], max_pp: [0, 10], evo_left: [0, 2], sep: [0, 2], epp: [0, 1], shadows: [0, 99] };
function newSide() { return { leader_hp: 20, pp: 4, max_pp: 4, evo_left: 2, sep: 0, epp: 0, shadows: 0, hand: [], board: [], dirty: false }; }
const SETUP = { first: 0, active: 0, n: 4, decks: [null, null], sides: [newSide(), newSide()] };
let SEL = null;       // {w:'board'|'hand', si, i}
let SETUP_MSG = '';   // 開始時のエラーなど
const turnNo = () => (SETUP.active === SETUP.first ? 2 * SETUP.n - 1 : 2 * SETUP.n);
const ownTurns = si => (si === SETUP.first ? (turnNo() + 1) >> 1 : turnNo() >> 1);
/** 手番・ターン数から PP・進化・超進化・エクストラPPの既定値を入れる（手で直した席は、force でなければ触らない） */
function applyDefaults(si, force) {
  const s = SETUP.sides[si];
  if (s.dirty && !force) return;
  const t = ownTurns(si);
  s.pp = s.max_pp = Math.min(t, 10);
  s.evo_left = 2;
  s.sep = t >= (si === SETUP.first ? 7 : 6) ? 2 : 0;
  s.epp = si === SETUP.first ? 0 : 1;
  if (force) s.dirty = false;
}
function resetSetup() { SETUP.sides = [newSide(), newSide()]; SETUP.first = 0; SETUP.active = 0; SETUP.n = 4; SEL = null; applyDefaults(0); applyDefaults(1); }
function defaultBoardUnit(c) { return { oid: c.official_id, atk: c.atk, hp: c.hp, max_hp: c.hp, evolved: false, super_evolved: false, can_attack: true, attacked: false, countdown: c.countdown || 0, kw: 0 }; }
function setupToEngine() {
  const side = s => ({
    leader_hp: s.leader_hp, pp: s.pp, max_pp: s.max_pp, evo_left: s.evo_left, sep: s.sep, epp: s.epp, shadows: s.shadows,
    hand: s.hand.map(h => ({ oid: h.oid, cost: h.cost == null || h.cost === '' ? undefined : +h.cost })),
    board: s.board.map(u => ({ oid: u.oid, atk: u.atk, hp: u.hp, max_hp: u.max_hp, evolved: u.evolved, super_evolved: u.super_evolved, can_attack: u.can_attack, attacked: u.attacked, countdown: cardOf(u.oid).kind === 'amulet' ? u.countdown : undefined, kw: u.kw || 0 })),
  });
  return { first: SETUP.first, active: SETUP.active, turn: turnNo(), sides: [side(SETUP.sides[0]), side(SETUP.sides[1])] };
}
/** そのカードが、この席のデッキから来たものか（枚数も数える）。違うなら注記を返す */
function notInDeckNote(si, c) {
  if (c.token) return 'トークン（生成カード扱い。山札には影響しません）';
  let n = 0;
  try { const d = APP.decks.resolve(SETUP.decks[si]); const e = d.cards.find(([o]) => o === c.official_id); n = e ? e[1] : 0; } catch (e) { return ''; }
  const s = SETUP.sides[si];
  const used = [...s.hand, ...s.board].filter(x => x.oid === c.official_id).length;
  if (n === 0) return 'この席のデッキに無いカードです（生成カード扱い。山札から減りません）';
  if (used > n) return 'デッキの採用枚数（' + n + '枚）を超えています（超えた分は生成カード扱い）';
  return '';
}
function setupProblems() {
  const p = [];
  for (const si of [0, 1]) {
    const s = SETUP.sides[si], who = si === 0 ? '自分' : '相手';
    if (s.pp > s.max_pp) p.push(who + ': PP が最大PPより多い（エンジンは許しますが、ターン開始で最大PPまで戻ります）');
    if (si === SETUP.active && s.board.some(u => cardOf(u.oid).kind === 'follower') && s.board.filter(u => cardOf(u.oid).kind === 'follower').every(u => u.attacked || !u.can_attack)) p.push(who + ': 手番の席のフォロワーが全員「攻撃済」か「攻撃不可」です');
  }
  if (SETUP.active === 1 && SETUP.sides[1].hand.length === 0 && SETUP.sides[1].board.length === 0) p.push('相手の手番ですが、相手の手札も場も空です（相手は何もしません）');
  return p;
}
function startFromSetup() {
  try {
    APP.game.start({ my_deck: SETUP.decks[0], bot_deck: SETUP.decks[1], setup: setupToEngine(), seed: Math.floor(Math.random() * 2 ** 31) });
  } catch (e) { SETUP_MSG = e.message; setupRender(); return; }
  SETUP_MSG = '';
  S = APP.game.state(); INS = null; OVHIDE = false;
  setMode('play');
}
const getSel = () => { if (!SEL) return null; const s = SETUP.sides[SEL.si]; const x = (SEL.w === 'hand' ? s.hand : s.board)[SEL.i]; return x ? { x, c: cardOf(x.oid) } : null; };
const stepper = (path, v, extra) => '<span class="stp"><button data-st="' + path + ':-1">−</button><b>' + v + '</b><button data-st="' + path + ':1">＋</button></span>' + (extra || '');
function sideInfoHtml(si) {
  const s = SETUP.sides[si], cls = cardOfDeckClass(si), who = si === 0 ? '自分' : '相手';
  const hp = '<input type="number" class="hpin" title="リーダーの体力（クリックして入力）" data-hp="' + si + '" min="1" max="99" value="' + s.leader_hp + '">';
  return '<div class="info">' + leaderOrb(cls, hp) + '<div class="chips"><b>' + who + '</b>' +
    '<span class="chip">PP <span class="orbs">' + orbsHtml(s.max_pp, s.pp, 'orb', 'data-pp', si + ':') + '</span> ' + s.pp + '/' + s.max_pp + ' ' + stepper(si + ':max_pp', '最大' + s.max_pp) + '</span>' +
    '<span class="chip">進化 <span class="orbs">' + orbsHtml(2, s.evo_left, 'dot ep', 'data-dot', si + ':evo_left:') + '</span></span>' +
    '<span class="chip">超進化 <span class="orbs">' + orbsHtml(2, s.sep, 'dot sep', 'data-dot', si + ':sep:') + '</span></span>' +
    '<span class="chip' + (s.epp ? ' onchip' : '') + '" data-tog="' + si + ':epp" style="cursor:pointer">エクストラPP ' + (s.epp ? 'あり' : 'なし') + '</span>' +
    '<span class="chip">墓場 ' + stepper(si + ':shadows', s.shadows) + '</span></div></div>';
}
function cardOfDeckClass(si) { try { return APP.decks.resolve(SETUP.decks[si]).class; } catch (e) { return 0; } }
function sideBoardHtml(si) {
  const s = SETUP.sides[si];
  const tag = '<span class="rowtag">' + (si === 0 ? '自分' : '相手') + 'の場 ' + s.board.length + '/5</span>';
  const units = s.board.map((u, i) => unitTile(cardOf(u.oid), { ...u, cls: (SEL && SEL.w === 'board' && SEL.si === si && SEL.i === i ? ['sel'] : []), attrs: 'data-sel="board:' + si + ':' + i + '"' })).join('');
  return tag + units + (s.board.length < 5 ? slotTile('u', 'data-add="board:' + si + '"') : '');
}
function sideHandHtml(si) {
  const s = SETUP.sides[si];
  const tag = '<span class="rowtag">' + (si === 0 ? '自分' : '相手') + 'の手札 ' + s.hand.length + '/9</span>';
  const tiles = s.hand.map((h, i) => handTile(cardOf(h.oid), { cost: h.cost == null ? null : h.cost, cls: ['playable'].concat(SEL && SEL.w === 'hand' && SEL.si === si && SEL.i === i ? ['sel'] : []), attrs: 'data-sel="hand:' + si + ':' + i + '"' })).join('');
  return tag + tiles + (s.hand.length < 9 ? slotTile('h', 'data-add="hand:' + si + '"') : '');
}
function editorPanelHtml() {
  const g = getSel();
  if (!g) {
    return '<div class="tip" style="line-height:1.7">場・手札のカードをクリックして編集します。「＋」の枠でカードを追加します。<br>右クリックでカードの詳細。</div>' +
      '<div class="sec">手札をデッキからランダムに配る</div><div class="row"><input type="number" id="dealN" min="0" max="9" value="5" style="width:54px"> 枚 <button data-deal="0">自分</button><button data-deal="1">相手</button></div>' +
      '<div class="sec">手番・ターンから既定値</div><div class="row"><button data-defaults="all">PP・進化などを入れ直す</button></div><div class="tip">ターン数・先攻・手番を変えると自動で入ります（手で直した席は変わりません）。</div>';
  }
  const { x, c } = g, p = SEL.w + ':' + SEL.si + ':' + SEL.i;
  let h = '<img src="' + imgUrl(c) + '" alt="" data-pop="1" data-oid="' + c.official_id + '" style="cursor:pointer"><div class="nm">' + esc(c.name) + '</div><div class="tip">' + INFO.classes[c.class] + ' ・ ' + { follower: 'フォロワー', spell: 'スペル', amulet: 'アミュレット' }[c.kind] + ' ・ コスト' + c.cost + '</div>';
  const row = (label, body) => '<div class="erow"><span>' + label + '</span>' + body + '</div>';
  const tg = (f, label) => '<label class="tgl"><input type="checkbox" data-edt="' + f + '"' + (x[f] ? ' checked' : '') + '> ' + label + '</label>';
  const kb = (bit, label) => '<label class="tgl"><input type="checkbox" data-edk="' + bit + '"' + (((x.kw || 0) & bit) ? ' checked' : '') + '> ' + label + '</label>';
  if (SEL.w === 'hand') {
    h += row('コスト', stepper('ed:cost', x.cost == null ? c.cost : x.cost) + (x.cost == null ? '' : '<button data-edx="resetcost">元に戻す</button>'));
  } else if (c.kind === 'amulet') {
    h += row('カウント', stepper('ed:countdown', x.countdown));
    h += '<div class="erow">' + tg('can_attack', 'アクト可') + '</div>';
  } else {
    h += row('攻撃力', stepper('ed:atk', x.atk)) + row('体力', stepper('ed:hp', x.hp)) + row('最大体力', stepper('ed:max_hp', x.max_hp));
    h += '<div class="erow">' + tg('evolved', '進化') + tg('super_evolved', '超進化') + '</div><div class="erow">' + tg('can_attack', '攻撃可') + tg('attacked', '攻撃済') + '</div>';
    h += '<div class="erow">' + kb(1, '守護付与') + kb(2, '疾走付与') + kb(4, '突進付与') + '</div>';
  }
  const note = notInDeckNote(SEL.si, c);
  if (note) h += '<div class="tip" style="color:var(--warn);margin-top:4px">' + note + '</div>';
  h += '<div class="erow"><button data-edx="left">◀</button><button data-edx="right">▶</button><button class="danger" data-edx="del">削除</button><button data-edx="close">選択解除</button></div>';
  h += '<div class="tx">' + fmt(c.text) + '</div>';
  return h;
}
function setupRender() {
  ensureDecks();
  const decks = INFO.decks.filter(d => d.ready);
  const opt = cur => decks.map(d => '<option value="' + esc(d.id) + '"' + (d.id === cur ? ' selected' : '') + '>' + (d.custom ? '★' : '') + INFO.classes[d.class] + '・' + esc(d.name) + '</option>').join('');
  const saved = GM.lsGet(GM.SETUP_KEY, {});
  const names = Object.keys(saved);
  const bar = '<div class="mbar row">' +
    '<label class="fld">自分のデッキ <select id="sDeck0">' + opt(SETUP.decks[0]) + '</select></label>' +
    '<label class="fld">相手のデッキ <select id="sDeck1">' + opt(SETUP.decks[1]) + '</select></label>' +
    '<label class="fld">先攻 <select id="sFirst"><option value="0"' + (SETUP.first === 0 ? ' selected' : '') + '>自分</option><option value="1"' + (SETUP.first === 1 ? ' selected' : '') + '>相手</option></select></label>' +
    '<label class="fld">手番 <select id="sActive"><option value="0"' + (SETUP.active === 0 ? ' selected' : '') + '>自分</option><option value="1"' + (SETUP.active === 1 ? ' selected' : '') + '>相手</option></select></label>' +
    '<label class="fld">手番の席の <span class="stp"><button data-sn="-1">−</button><b>' + SETUP.n + '</b><button data-sn="1">＋</button></span> ターン目</label></div>';
  const probs = setupProblems();
  const left = '<div class="panel" id="sEditor">' + editorPanelHtml() + '</div>';
  const center = '<div class="mcenter setup">' + sideInfoHtml(1) +
    '<div class="strip">' + sideHandHtml(1) + '</div>' +
    '<div class="board" data-bd="1">' + sideBoardHtml(1) + '</div><div class="board" data-bd="0">' + sideBoardHtml(0) + '</div>' +
    sideInfoHtml(0) + '<div class="hand-row" id="sHand">' + sideHandHtml(0) + '</div></div>';
  const right = '<div class="mright"><button class="round gold" id="sStart">この盤面で<br>開始</button>' +
    '<div class="msg" id="sMsg">' + (SETUP_MSG ? '<span style="color:var(--bad)">' + esc(SETUP_MSG) + '</span>' : '') + probs.map(x => '<div class="warn">' + esc(x) + '</div>').join('') + '</div>' +
    '<div class="panel col-btns"><select id="sLoad"><option value="">保存した盤面…</option>' + names.map(n => '<option>' + esc(n) + '</option>').join('') + '</select>' +
    '<button id="sSave">保存</button><button id="sDel">削除</button><button id="sExport">コードをコピー</button><button id="sImport">コードを貼り付け</button><button id="sSwap">自分⇔相手 入れ替え</button><button id="sReset">初期化</button></div></div>';
  const v = q$('setupView');
  v.innerHTML = bar + '<div class="mg">' + left + center + right + '</div>';
  bindSetup(v);
  watchRows([q$('sHand'), ...v.querySelectorAll('.strip')]); requestAnimationFrame(() => { fitRow(q$('sHand')); v.querySelectorAll('.strip').forEach(fitRow); });
}
function bindSetup(v) {
  const reDefaults = () => { applyDefaults(0); applyDefaults(1); setupRender(); drawerRender(); };
  q$('sDeck0').onchange = e => { SETUP.decks[0] = e.target.value; setupRender(); drawerRender(); };
  q$('sDeck1').onchange = e => { SETUP.decks[1] = e.target.value; setupRender(); };
  q$('sFirst').onchange = e => { SETUP.first = +e.target.value; if (!((SETUP.active === SETUP.first))) { /* 手番はそのまま */ } reDefaults(); };
  q$('sActive').onchange = e => { SETUP.active = +e.target.value; reDefaults(); };
  v.querySelectorAll('[data-sn]').forEach(b => b.onclick = () => { SETUP.n = Math.max(1, Math.min(30, SETUP.n + +b.dataset.sn)); reDefaults(); });
  // ステッパー（リーダー側の数値）
  v.querySelectorAll('[data-st]').forEach(b => b.onclick = () => {
    const [a, f, d] = b.dataset.st.split(':');
    if (a === 'ed') { editStep(f, +d); return; }
    const s = SETUP.sides[+a], [lo, hi] = LIMITS[f];
    s[f] = Math.max(lo, Math.min(hi, s[f] + +d)); s.dirty = true;
    if (f === 'max_pp' && s.pp > s.max_pp) s.pp = s.max_pp;
    setupRender();
  });
  v.querySelectorAll('[data-hp]').forEach(i => i.onchange = () => { const s = SETUP.sides[+i.dataset.hp]; s.leader_hp = Math.max(1, Math.min(99, +i.value || 1)); setupRender(); });
  // PP の玉・進化／超進化の点: クリックでその数にする（同じ所をもう一度押すと1つ減る）
  v.querySelectorAll('[data-pp]').forEach(o => o.onclick = () => { const [si, k] = o.dataset.pp.split(':').map(Number); const s = SETUP.sides[si]; s.pp = s.pp === k + 1 ? k : k + 1; s.dirty = true; setupRender(); });
  v.querySelectorAll('[data-dot]').forEach(d => d.onclick = () => { const [si, f, k] = d.dataset.dot.split(':'); const s = SETUP.sides[+si]; s[f] = s[f] === +k + 1 ? +k : +k + 1; s.dirty = true; setupRender(); });
  v.querySelectorAll('[data-tog]').forEach(t => t.onclick = () => { const [si, f] = t.dataset.tog.split(':'); const s = SETUP.sides[+si]; s[f] = s[f] ? 0 : 1; s.dirty = true; setupRender(); });
  // 選択・追加
  v.querySelectorAll('[data-sel]').forEach(el => {
    el.onclick = () => { const [w, si, i] = el.dataset.sel.split(':'); SEL = { w, si: +si, i: +i }; setupRender(); };
    el.oncontextmenu = e => { e.preventDefault(); const [w, si, i] = el.dataset.sel.split(':'); const x = (w === 'hand' ? SETUP.sides[+si].hand : SETUP.sides[+si].board)[+i]; if (x) showCardPop(cardOf(x.oid)); };
  });
  v.querySelectorAll('[data-add]').forEach(el => el.onclick = () => addCard(el.dataset.add));
  q$('sEditor').addEventListener('click', e => { const t = e.target.closest('[data-pop]'); if (t && t.dataset.oid) showCardPop(cardOf(+t.dataset.oid)); });
  bindEditor(v);
  q$('sStart').onclick = startFromSetup;
  q$('sSave').onclick = () => {
    const name = (prompt('盤面の名前') || '').trim(); if (!name) return;
    const all = GM.lsGet(GM.SETUP_KEY, {}); all[name] = JSON.parse(JSON.stringify(SETUP));
    if (!GM.lsSet(GM.SETUP_KEY, all)) alert('保存できませんでした'); setupRender();
  };
  q$('sLoad').onchange = e => { const s = GM.lsGet(GM.SETUP_KEY, {})[e.target.value]; if (s) loadSetup(s); };
  q$('sDel').onclick = () => { const n = q$('sLoad').value; if (!n) { alert('削除する盤面を「保存した盤面…」で選んでください'); return; } if (!confirm('「' + n + '」を削除しますか？')) return; const all = GM.lsGet(GM.SETUP_KEY, {}); delete all[n]; GM.lsSet(GM.SETUP_KEY, all); setupRender(); };
  q$('sExport').onclick = async () => { const t = JSON.stringify(SETUP); try { await navigator.clipboard.writeText(t); alert('盤面のコードをコピーしました'); } catch (e) { prompt('コピーして保存してください', t); } };
  q$('sImport').onclick = () => { const t = prompt('盤面のコードを貼り付け'); if (!t) return; try { loadSetup(JSON.parse(t)); } catch (e) { alert('コードを読み込めません: ' + e.message); } };
  q$('sSwap').onclick = () => { SETUP.sides.reverse(); SETUP.decks.reverse(); SETUP.first = 1 - SETUP.first; SETUP.active = 1 - SETUP.active; SEL = null; setupRender(); drawerRender(); };
  q$('sReset').onclick = () => { if (confirm('盤面を初期化します。よろしいですか？')) { resetSetup(); setupRender(); drawerRender(); } };
}
function bindEditor(v) {
  v.querySelectorAll('[data-deal]').forEach(b => b.onclick = () => dealHand(+b.dataset.deal, Math.max(0, Math.min(9, +q$('dealN').value || 0))));
  v.querySelectorAll('[data-defaults]').forEach(b => b.onclick = () => { applyDefaults(0, true); applyDefaults(1, true); setupRender(); drawerRender(); });
  v.querySelectorAll('[data-edt]').forEach(el => el.onchange = () => editToggle(el.dataset.edt, el.checked));
  v.querySelectorAll('[data-edk]').forEach(el => el.onchange = () => { const g = getSel(); if (!g) return; const bit = +el.dataset.edk; g.x.kw = el.checked ? (g.x.kw || 0) | bit : (g.x.kw || 0) & ~bit; setupRender(); });
  v.querySelectorAll('[data-edx]').forEach(el => el.onclick = () => editAction(el.dataset.edx));
}
function editStep(f, d) {
  const g = getSel(); if (!g) return; const x = g.x, c = g.c;
  if (f === 'cost') { x.cost = Math.max(0, Math.min(20, (x.cost == null ? c.cost : x.cost) + d)); if (x.cost === c.cost) x.cost = null; }
  else if (f === 'countdown') x.countdown = Math.max(0, Math.min(99, x.countdown + d));
  else { x[f] = Math.max(f === 'atk' ? -9 : 0, Math.min(99, x[f] + d)); if (f === 'hp' && x.hp > x.max_hp) x.max_hp = x.hp; if (f === 'max_hp' && x.hp > x.max_hp) x.hp = x.max_hp; }
  setupRender();
}
function editToggle(f, on) {
  const g = getSel(); if (!g) return; const x = g.x, c = g.c;
  x[f] = on;
  if (f === 'evolved' || f === 'super_evolved') {   // 進化の +2/+2・+3/+3 を反映（あとで増減できる）
    if (f === 'super_evolved' && on) x.evolved = true;
    if (f === 'evolved' && !on) x.super_evolved = false;
    const bonus = x.super_evolved ? 3 : (x.evolved ? 2 : 0);
    x.atk = c.atk + bonus; x.hp = c.hp + bonus; x.max_hp = c.hp + bonus;
  }
  if (f === 'attacked' && on) x.can_attack = true;
  setupRender();
}
function editAction(a) {
  const g = getSel(); if (!g) return; const s = SETUP.sides[SEL.si], list = SEL.w === 'hand' ? s.hand : s.board;
  if (a === 'del') { list.splice(SEL.i, 1); SEL = null; }
  else if (a === 'close') SEL = null;
  else if (a === 'resetcost') g.x.cost = null;
  else if (a === 'left' || a === 'right') { const j = SEL.i + (a === 'left' ? -1 : 1); if (j >= 0 && j < list.length) { [list[SEL.i], list[j]] = [list[j], list[SEL.i]]; SEL.i = j; } }
  setupRender(); drawerRender();
}
function addCard(spec) {
  const [w, si] = spec.split(':'); const s = SETUP.sides[+si];
  openPicker((w === 'hand' ? '手札に追加' : '場に追加') + '（' + (+si === 0 ? '自分' : '相手') + '）', c => {
    if (w === 'hand') { if (s.hand.length < 9) s.hand.push({ oid: c.official_id, cost: null }); }
    else if (c.kind === 'spell') { alert('スペルは場に置けません'); return false; }
    else if (s.board.length < 5) s.board.push(defaultBoardUnit(c));
    SEL = { w, si: +si, i: (w === 'hand' ? s.hand : s.board).length - 1 };
    setupRender(); drawerRender(); return true;
  }, { boardOnly: w === 'board', side: +si, keep: w === 'hand' });
}
function dealHand(si, n) {
  let d;
  try { d = APP.decks.resolve(SETUP.decks[si]); } catch (e) { alert(e.message); return; }
  const s = SETUP.sides[si];
  const pool = []; d.cards.forEach(([oid, k]) => { for (let j = 0; j < k; j++) pool.push(oid); });
  [...s.hand, ...s.board].forEach(x => { const j = pool.indexOf(x.oid); if (j >= 0) pool.splice(j, 1); });
  for (let k = pool.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [pool[k], pool[j]] = [pool[j], pool[k]]; }
  s.hand = pool.slice(0, n).map(oid => ({ oid, cost: null })).sort((a, b) => cardOf(a.oid).cost - cardOf(b.oid).cost);
  SEL = null; setupRender(); drawerRender();
}
function loadSetup(s) {
  const ok = s && s.sides && s.sides.length === 2 && s.sides.every(x => Array.isArray(x.hand) && Array.isArray(x.board) && x.hand.every(h => cardOf(h.oid)) && x.board.every(u => cardOf(u.oid)));
  if (!ok) { alert('盤面のデータが不正です'); return; }
  SETUP.first = s.first | 0; SETUP.active = s.active | 0; SETUP.n = s.n | 0 || 4; SETUP.sides = s.sides.map(x => ({ dirty: true, ...x })); SEL = null;
  if (s.decks && s.decks.every(d => INFO.decks.some(x => x.id === d && x.ready))) SETUP.decks = s.decks;
  setupRender(); drawerRender();
}

// ---------------- カード選択（手札・場への追加） ----------------
let PICK = { cb: null, boardOnly: false, deckOids: new Set(), deckClass: 0 };
function openPicker(title, cb, opt) {
  opt = opt || {};
  let deckOids = new Set(), deckClass = 0;
  try { const d = APP.decks.resolve(SETUP.decks[opt.side || 0]); d.cards.forEach(([o]) => deckOids.add(o)); deckClass = d.class; } catch (e) { /* デッキ未選択 */ }
  PICK = { cb, boardOnly: !!opt.boardOnly, deckOids, deckClass };
  q$('pickTitle').textContent = title;
  q$('pickClass').value = 'deck';
  q$('pickKeep').checked = !!opt.keep;
  q$('pickQ').value = '';
  q$('picker').classList.add('on');
  pickRender();
  q$('pickQ').focus();
}
function pickRender() {
  const q = q$('pickQ').value.trim().toLowerCase(), cls = q$('pickClass').value, kind = q$('pickKind').value;
  const tok = q$('pickTok').checked, rot = q$('pickRot').checked;
  let pool = INFO.cards.filter(c => (tok || !c.token) && (!rot || c.rot || c.token)
    && (cls === '' || (cls === 'deck' ? (c.class === PICK.deckClass || c.class === 0 || c.token) : c.class === +cls))
    && (!kind || c.kind === kind) && (!PICK.boardOnly || c.kind !== 'spell') && (!q || (c.name + ' ' + c.text).toLowerCase().includes(q)));
  pool.sort((a, b) => (PICK.deckOids.has(b.official_id) - PICK.deckOids.has(a.official_id)) || a.cost - b.cost || a.official_id - b.official_id);
  const more = pool.length > 240; pool = pool.slice(0, 240);
  q$('pickPool').innerHTML = pool.map(c => '<div class="pk' + (PICK.deckOids.has(c.official_id) ? ' indeck' : '') + '" data-o="' + c.official_id + '" title="' + esc(c.name) + '"><img loading="lazy" src="' + imgUrl(c) + '" alt=""><div class="nm">' + c.cost + ' ' + esc(c.name) + '</div></div>').join('') + (more ? '<div class="tip">表示は240件まで。絞り込んでください。</div>' : '');
  q$('pickPool').querySelectorAll('.pk').forEach(el => {
    el.onclick = () => { const done = PICK.cb(cardOf(+el.dataset.o)); if (done !== false && !q$('pickKeep').checked) q$('picker').classList.remove('on'); };
    el.oncontextmenu = e => { e.preventDefault(); showCardPop(cardOf(+el.dataset.o)); };
  });
}

// ---------------- 初期化 ----------------
function initModes() {
  const tabs = document.createElement('div'); tabs.className = 'tabs';
  tabs.innerHTML = '<button data-mode="play">対戦</button><button data-mode="mull">マリガン練習</button><button data-mode="setup">盤面再現</button>';
  q$('topbar').insertBefore(tabs, q$('status'));
  tabs.onclick = e => { const b = e.target.closest('button'); if (b) setMode(b.dataset.mode); };
  const mk = (tag, id, cls) => { const e = document.createElement(tag); e.id = id; if (cls) e.className = cls; document.body.appendChild(e); return e; };
  mk('div', 'mullView', 'view'); mk('div', 'setupView', 'view');
  const dr = mk('div', 'drawer'); dr.innerHTML = '<h3 id="drawerTitle">デッキ一覧</h3><div class="tip">クリックでカード詳細</div><div class="list"></div>';
  dr.addEventListener('click', e => { const r = e.target.closest('.dr'); if (r) showCardPop(cardOf(+r.dataset.oid)); });
  const tab = mk('button', 'drawerTab'); tab.textContent = 'デッキ ◀'; tab.onclick = () => toggleDrawer();
  mk('div', 'cardpop');
  const pk = mk('div', 'picker');
  pk.innerHTML = '<div class="top"><b id="pickTitle">カードを選ぶ</b><input type="search" id="pickQ" placeholder="カード名・テキスト" size="20"><select id="pickClass"><option value="deck">このデッキ＋中立＋トークン</option><option value="">全クラス</option>' + INFO.classes.map((n, i) => '<option value="' + i + '">' + n + '</option>').join('') + '</select><select id="pickKind"><option value="">全種別</option><option value="follower">フォロワー</option><option value="spell">スペル</option><option value="amulet">アミュレット</option></select><label><input type="checkbox" id="pickTok" checked> トークンも</label><label><input type="checkbox" id="pickRot"> ローテのみ</label><label><input type="checkbox" id="pickKeep"> 続けて追加</label><button id="pickClose">閉じる</button><span class="tip">クリックで追加 / 右クリックで詳細 / デッキのカードが先頭</span></div><div class="body"><div class="pool" id="pickPool"></div></div>';
  q$('pickClose').onclick = () => pk.classList.remove('on');
  ['pickQ', 'pickClass', 'pickKind', 'pickTok', 'pickRot'].forEach(id => { q$(id).oninput = pickRender; q$(id).onchange = pickRender; });
  const baseRender = render; render = function () { baseRender(); if (MODE === 'play') drawerRender(); };
  const baseFill = fillDeckSelects;
  fillDeckSelects = function () { baseFill(); if (MODE === 'mull') mullRender(); if (MODE === 'setup') setupRender(); };
  const ready = INFO.decks.filter(d => d.ready);
  MULL.deckId = (ready.find(d => d.id === 'b:0') || ready[0]).id;
  SETUP.decks = [MULL.deckId, MULL.deckId];
  applyDefaults(0); applyDefaults(1);
  window.addEventListener('resize', () => { if (MODE === 'mull' && q$('mullHand')) fitRow(q$('mullHand')); if (MODE === 'setup' && q$('sHand')) { fitRow(q$('sHand')); q$('setupView').querySelectorAll('.strip').forEach(fitRow); } });
  document.addEventListener('keydown', e => {
    if (e.target.matches('input,select,textarea')) return;
    if (MODE === 'mull' && e.key === 'Enter') { e.preventDefault(); mullPrimary(); }
  });
  setMode('mull');   // 最初はマリガン練習
}

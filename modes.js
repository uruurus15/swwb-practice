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
function showCardPop(c, opt) {
  const el = q$('cardpop');
  const kind = { follower: 'フォロワー', spell: 'スペル', amulet: 'アミュレット' }[c.kind];
  const st = c.kind === 'follower' ? ' ・ ' + c.atk + '/' + c.hp : (c.countdown ? ' ・ カウントダウン' + c.countdown : '');
  const rel = opt && opt.side != null ? (c.related || []).map(cardOf).filter(Boolean) : [];
  const relHtml = rel.length ? '<div class="sec">関連カード（' + (opt.side === 0 ? '自分' : '相手') + 'の手札・場に出す）</div><div class="relgrid">' + rel.map(r => '<div class="rel"><img data-pop="1" data-oid="' + r.official_id + '" src="' + imgUrl(r) + '" alt="" title="' + esc(r.name) + '"><div class="nm">' + esc(r.name) + '</div><div class="rb"><button data-prel="' + opt.side + ':' + r.official_id + ':hand">手札</button><button data-prel="' + opt.side + ':' + r.official_id + ':board"' + (r.kind === 'spell' ? ' disabled' : '') + '>場</button></div></div>').join('') + '</div>' : '';
  el.innerHTML = '<button class="popx" title="閉じる">×</button><img src="' + imgUrl(c) + '" alt=""><div><div class="nm">' + esc(c.name) + '</div><div class="tip">' + INFO.classes[c.class] + ' ・ ' + kind + ' ・ コスト' + c.cost + st + (c.enhance ? ' ・ エンハンス' + c.enhance : '') + '</div><div class="tx">' + fmt(c.text) + '</div>' + relHtml + '</div>';
  el.classList.add('on');
}
document.addEventListener('click', e => {
  const el = q$('cardpop');
  if (!el || !el.classList.contains('on')) return;
  const pb = e.target.closest('[data-prel]');
  if (pb && el.contains(pb)) { const [si, oid, w] = pb.dataset.prel.split(':'); addToSide(+si, +oid, w, { keepSel: true }); return; }
  if (e.target.closest('.popx') || !(el.contains(e.target) || e.target.closest('[data-pop]'))) el.classList.remove('on');
}, true);

// ---------------- 共通の部品（見た目は対戦画面と同じ） ----------------
function unitTile(c, o) {
  const bonus = o.super_evolved ? 3 : (o.evolved ? 2 : 0);
  const amu = c.kind === 'amulet';
  const bits = (c.kw | 0) | (o.kw | 0);
  const kws = GM.kwNames(bits).map(kwChip).join('');
  const evtag = amu ? '' : (o.super_evolved ? '<span class="evtag">超進化</span>' : (o.evolved ? '<span class="evtag">進化</span>' : ''));
  const cls = ['u'];
  if (amu) cls.push('amulet');
  if (bits & 1) cls.push('ward');
  if (o.super_evolved) cls.push('sevo'); else if (o.evolved) cls.push('evo');
  (o.cls || []).forEach(x => cls.push(x));
  const atkCls = o.atk > c.atk + bonus ? 'up' : (o.atk < c.atk + bonus ? 'down' : '');
  const hpCls = o.hp < o.max_hp ? 'down' : (o.max_hp > c.hp + bonus ? 'up' : '');
  const stat = (amu && isEvidence(c)) ? '<div class="cd ev" title="証拠の数">' + (o.evidence || 1) + '</div>' : amu ? '<div class="cd">' + o.countdown + '</div>' : '<div class="b atk ' + atkCls + '">' + o.atk + '</div><div class="b hp ' + hpCls + '">' + o.hp + '</div>';
  return '<div class="' + cls.join(' ') + '" ' + (o.attrs || '') + '><div class="art"><img src="' + imgUrl(c) + '" alt="' + esc(c.name) + '" draggable="false"></div><div class="kws">' + kws + '</div>' + stat + evtag + '</div>';
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
  if (MODE === 'mull' || MODE === 'amull' || !box.classList.contains('open')) return;
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
  const ready = INFO.decks.filter(deckListed);
  const ok = id => id && ready.some(d => d.id === id);
  const fb = (ready.find(d => d.id === 'b:0') || ready[0]).id;
  let changed = false;
  if (!ok(MULL.deckId)) { MULL.deckId = fb; MULL.phase = 'idle'; MULL.history = []; MULL.count = 0; changed = true; }
  SETUP.decks = SETUP.decks.map(d => ok(d) ? d : fb);
  return changed;
}

// ---------------- モード切替 ----------------
function setMode(m) {
  const prevMode = MODE;
  MODE = m;
  q$('game').style.display = m === 'play' ? '' : 'none';
  q$('mullView').classList.toggle('on', m === 'mull');
  q$('amullView').classList.toggle('on', m === 'amull');
  q$('setupView').classList.toggle('on', m === 'setup');
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
  q$('status').style.display = m === 'play' ? '' : 'none';
  q$('drawerTab').style.display = (m === 'mull' || m === 'amull' || m === 'setup') ? 'none' : '';   // 盤面再現は左にデッキ列がある
  if (m === 'mull' || m === 'amull' || m === 'setup') toggleDrawer(false);
  if (prevMode === 'amull' && m === 'mull') MULL.phase = 'idle';   // 自動マリガンが同じエンジン枠を使うので、マリガン練習は配り直す
  if (m === 'play') { q$('settingsBtn').style.display = ''; if (S) render(); else { q$('status').className = 'wait'; q$('status').textContent = '「設定・新しいゲーム」からゲームを始めてください'; q$('settings').classList.add('open'); } }
  else { q$('settingsBtn').style.display = 'none'; q$('settings').classList.remove('open'); q$('cancelTop').style.display = 'none'; q$('againTop').style.display = 'none'; }
  if (m === 'mull') mullRender();
  if (m === 'amull') amRender();
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
  const decks = INFO.decks.filter(deckListed);
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
  q$('mullEdit').onclick = () => { EDIT_FOR = 'mull'; openEditor(); edLoadDeck(MULL.deckId); };
  q$('mullBtn').onclick = mullPrimary;
  v.querySelectorAll('[data-mt]').forEach(el => { el.onclick = () => mullToggle(+el.dataset.mt); el.oncontextmenu = e => { e.preventDefault(); showCardPop(INFO.cards[+el.dataset.cid]); }; });
  v.querySelectorAll('[data-cid][data-pop]').forEach(el => { el.onclick = () => showCardPop(INFO.cards[+el.dataset.cid]); });
  v.querySelectorAll('.mdeck .dr').forEach(el => { el.onclick = () => showCardPop(cardOf(+el.dataset.oid)); });
  v.querySelectorAll('.deckorder [data-cid]').forEach(el => { el.onclick = () => showCardPop(INFO.cards[+el.dataset.cid]); });
  v.querySelectorAll('[data-dview]').forEach(b => b.onclick = () => { MULL.view = b.dataset.dview; GM.lsSet('swwb.mull.view', MULL.view); mullRender(); });
  watchRows([q$('mullHand')]); requestAnimationFrame(() => fitRow(q$('mullHand')));
}

// ---------------- 自動マリガン確認（ルールに沿ってマリガンを自動で10回） ----------------
// ルール（カードは公式IDで持つ。デッキごとに localStorage へ保存）:
//   単キープ（4枠）: そのカードを n 枚（1〜3）までキープ
//   セットキープ・基本（5セット）: 基本のカードが手札にあれば基本を n 枚キープし、セット側の各カードも、それぞれの枚数までキープ（セット側は5枠）
//   セットキープ・特殊（5セット、4枠。2枠以上埋める）: 埋めたカードが手札にすべてそろったら、それぞれ 1 枚ずつ（同じカードを複数枠に入れたらその枚数）キープ
//   どのルールにも当たらないカードは、すべて入れ替える。同じカードを複数のルールがキープさせるときは、いちばん多い枚数を採用する
const AM_KEY = 'swwb.amull.v1';
const AM = { deckId: null, first: '', runs: [], rules: null, busy: false };
const AM_SINGLE = 4, AM_SETS = 5, AM_BASES = 4, AM_PARTNERS = 5, AM_COMBOS = 5, AM_COMBO_SLOTS = 4;
function amEmptyRules() {
  const slot = () => ({ oid: null, n: 1 });
  return {
    single: Array.from({ length: AM_SINGLE }, slot),
    sets: Array.from({ length: AM_SETS }, () => ({ bases: Array.from({ length: AM_BASES }, slot), partners: Array.from({ length: AM_PARTNERS }, slot) })),
    combos: Array.from({ length: AM_COMBOS }, () => Array.from({ length: AM_COMBO_SLOTS }, () => ({ oid: null, n: 1 }))),
  };
}
/** 保存されたルールを、いまの形に合わせて読み込む（足りない枠は空にし、存在しないカードは外す） */
function amNormalize(r) {
  const base = amEmptyRules();
  const fix = (dst, src) => {
    if (!src || typeof src !== 'object') return;
    const n = Math.max(1, Math.min(3, +src.n || 1));
    dst.n = n;
    dst.oid = src.oid != null && cardOf(+src.oid) ? +src.oid : null;
  };
  r = r || {};
  base.single.forEach((s, i) => fix(s, (r.single || [])[i]));
  base.sets.forEach((s, i) => {
    const o = (r.sets || [])[i] || {};
    const bs = o.bases || (o.base ? [o.base] : []);   // 以前の形（基本が1枠）の保存データも読む
    s.bases.forEach((b, k) => fix(b, bs[k]));
    s.partners.forEach((p, j) => fix(p, (o.partners || [])[j]));
  });
  base.combos.forEach((c, i) => c.forEach((s, j) => fix(s, ((r.combos || [])[i] || [])[j])));
  return base;
}
function amLoadRules() { AM.rules = amNormalize((GM.lsGet(AM_KEY, {}) || {})[AM.deckId]); }
function amSaveRules() { const all = GM.lsGet(AM_KEY, {}) || {}; all[AM.deckId] = AM.rules; GM.lsSet(AM_KEY, all); }
function amSlot(path) {   // 'single:0' / 'set:2:b:1'（基本側）/ 'set:2:p:3'（セット側）/ 'combo:1:2'
  const p = path.split(':'), r = AM.rules;
  if (p[0] === 'single') return r.single[+p[1]];
  if (p[0] === 'set') return p[2] === 'b' ? r.sets[+p[1]].bases[+p[3]] : r.sets[+p[1]].partners[+p[3]];
  return r.combos[+p[1]][+p[2]];
}
const amName = oid => (cardOf(oid) || { name: '?' }).name;

/** 手札（カードIDの並び）にルールを当てる。キープする手札の位置の集合と、理由（カードIDごと）を返す */
function amEvaluate(hand, rules) {
  const count = {};
  hand.forEach(c => { count[c] = (count[c] || 0) + 1; });
  const need = {};   // カードID -> {n, why:[]}
  const want = (oid, n, why) => {
    const c = cardOf(oid); if (!c) return;
    const have = count[c.id] || 0; if (!have) return;
    const k = Math.min(n, have);
    const e = need[c.id] || (need[c.id] = { n: 0, why: [] });
    if (k > e.n) e.n = k;
    if (!e.why.includes(why)) e.why.push(why);
  };
  rules.single.forEach(s => { if (s.oid != null) want(s.oid, s.n, '単キープ'); });
  rules.sets.forEach(s => {   // 基本側のどれかが1枚以上手札にあれば、手札にある基本側と、セット側をキープする
    const bases = s.bases.filter(b => b.oid != null && cardOf(b.oid) && count[cardOf(b.oid).id]);
    if (!bases.length) return;
    const names = bases.map(b => amName(b.oid)).join('+');
    bases.forEach(b => want(b.oid, b.n, 'セット(基本) ' + names + ' の基本'));
    s.partners.forEach(p => { if (p.oid != null) want(p.oid, p.n, 'セット(基本) ' + names + ' と'); });
  });
  rules.combos.forEach(c => {
    const oids = c.filter(s => s.oid != null).map(s => s.oid);
    if (oids.length < 2) return;
    const req = {};
    oids.forEach(o => { const cd = cardOf(o); if (cd) req[cd.id] = (req[cd.id] || 0) + 1; });
    if (!Object.keys(req).every(id => (count[id] || 0) >= req[id])) return;
    const why = 'セット(特殊) ' + oids.map(amName).join('+');
    oids.forEach(o => want(o, req[cardOf(o).id], why));
  });
  const keep = new Set(), used = {};
  hand.forEach((c, i) => {
    const e = need[c];
    if (e && (used[c] || 0) < e.n) { keep.add(i); used[c] = (used[c] || 0) + 1; }
  });
  return { keep, why: need };
}

/** 1 回ぶん: 配る → ルールどおりにマリガン → 結果と山札の並びを記録 */
function amRunOnce() {
  const d = APP.decks.resolve(AM.deckId);
  let seed = Math.floor(Math.random() * 2 ** 31);
  const base = { op: 'reset', class0: d.class, cards0: d.cards, class1: d.class, cards1: d.cards };
  let o;
  for (let k = 0; k < 64; k++) {
    mcall({ ...base, seed });
    if (AM.first === '') break;
    o = mcall({ op: 'observe', seat: 0 });
    if (o.going_first === (AM.first === '1')) break;
    seed = (seed + 1) % 2 ** 31;
  }
  let guard = 0;
  o = mcall({ op: 'observe', seat: 0 });
  while (!o.finished && !o.is_active && guard++ < 50) { mcall({ op: 'step', id: mcall({ op: 'bot', kind: 2 }).id }); o = mcall({ op: 'observe', seat: 0 }); }
  const hand0 = o.my_hand.slice(), goingFirst = o.going_first;
  const ev = amEvaluate(hand0, AM.rules);
  hand0.forEach((c, i) => { if (!ev.keep.has(i)) mcall({ op: 'step', id: 1 + i }); });   // 入れ替えるカードに印を付ける
  mcall({ op: 'step', id: 0 });
  const o2 = mcall({ op: 'observe', seat: 0 });
  const order = mcall({ op: 'deck', seat: 0 });
  const kept = ev.keep.size;
  return { seed, goingFirst, hand0, keep: [...ev.keep], hand1: o2.my_hand.slice(), order, kept, why: ev.why };
}
function amRun10() {
  if (AM.busy) return;
  AM.busy = true;
  try {
    ensureDecks();
    AM.runs = [];
    for (let i = 1; i <= 10; i++) { const r = amRunOnce(); r.n = i; AM.runs.push(r); }
  } finally { AM.busy = false; }
  amRender(true);   // 結果は先頭から見せる
}

const amSlotHtml = (path, label) => {
  const s = amSlot(path);
  const c = s.oid != null ? cardOf(s.oid) : null;
  const cnt = '<select class="amn" data-amn="' + path + '" title="キープする最大枚数">' + [1, 2, 3].map(n => '<option value="' + n + '"' + (s.n === n ? ' selected' : '') + '>' + n + '枚</option>').join('') + '</select>';
  const hasCount = !path.startsWith('combo');
  if (!c) return '<div class="amslot empty" data-amadd="' + path + '" title="カードを選ぶ">＋ ' + esc(label) + '</div>';
  return '<div class="amslot"><img src="' + imgUrl(c) + '" alt="" data-pop="1" data-cid="' + c.id + '"><span class="nm" data-amadd="' + path + '" title="クリックで変更">' + esc(c.name) + '</span>' + (hasCount ? cnt : '') + '<button class="amx" data-amdel="' + path + '" title="この枠を空にする">×</button></div>';
};
function amRulesHtml() {
  let h = '<div class="sec">単キープ（4枠）<span class="tip"> 設定したカードを、指定の枚数までキープ</span></div>';
  for (let i = 0; i < AM_SINGLE; i++) h += amSlotHtml('single:' + i, 'カード ' + (i + 1));
  h += '<div class="sec">セットキープ（基本）（5セット）<span class="tip"> 基本側が1枚以上あれば、基本側とセット側をキープ</span></div>';
  for (let i = 0; i < AM_SETS; i++) {
    h += '<div class="amset"><div class="amsh">セット ' + (i + 1) + '<span class="tip"> 基本側（どれか1枚以上あれば有効）</span></div><div class="ampart ambase">';
    for (let k = 0; k < AM_BASES; k++) h += amSlotHtml('set:' + i + ':b:' + k, '基本 ' + (k + 1));
    h += '</div><div class="amsh" style="margin-top:2px">セット側</div><div class="ampart">';
    for (let j = 0; j < AM_PARTNERS; j++) h += amSlotHtml('set:' + i + ':p:' + j, 'セット側 ' + (j + 1));
    h += '</div></div>';
  }
  h += '<div class="sec">セットキープ（特殊）（5セット、2枠以上）<span class="tip"> 埋めた枠のカードがそろったらキープ</span></div>';
  for (let i = 0; i < AM_COMBOS; i++) {
    const filled = AM.rules.combos[i].filter(s => s.oid != null).length;
    h += '<div class="amset"><div class="amsh">組み合わせ ' + (i + 1) + (filled === 1 ? ' <span class="amwarn">（2枠以上で有効）</span>' : '') + '</div><div class="ampart">';
    for (let j = 0; j < AM_COMBO_SLOTS; j++) h += amSlotHtml('combo:' + i + ':' + j, 'カード ' + (j + 1));
    h += '</div></div>';
  }
  return h;
}
const amThumb = (c, cls, tag, extra) => '<div class="amc ' + cls + '" data-pop="1" data-cid="' + c + '"' + (extra || '') + '><img loading="lazy" src="' + imgUrl(INFO.cards[c]) + '" alt="' + esc(INFO.cards[c].name) + '" title="' + esc(INFO.cards[c].name) + '">' + (tag ? '<span class="tg">' + tag + '</span>' : '') + '</div>';
function amRunHtml(r) {
  const keep = new Set(r.keep);
  const initial = r.hand0.map((c, i) => amThumb(c, keep.has(i) ? 'kept' : 'out', keep.has(i) ? 'キープ' : '入替')).join('');
  const after = r.hand1.map((c, i) => amThumb(c, i >= r.kept ? 'new' : '', i >= r.kept ? '引いた' : '')).join('');
  const reasons = [...new Set(Object.entries(r.why).filter(([id, e]) => e.n > 0).flatMap(([id, e]) => e.why.map(w => INFO.cards[+id].name + '（' + w + '）')))];
  const why = '<div class="amwhy"><div class="amlb">キープの理由</div>' + (reasons.length ? '<ul>' + reasons.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '<div class="tip">ルールに当たるカードがなく、すべて入れ替えました</div>') + '</div>';
  // 山札の並び（上から）: 折りたたまず横一列。この列の中だけ横にスクロールする
  const order = '<div class="amorder"><span class="amlb">山札（上から ' + r.order.length + ' 枚）</span><div class="amstrip">' + r.order.map((c, i) => '<div class="amc sm" data-pop="1" data-cid="' + c + '"><img loading="lazy" src="' + imgUrl(INFO.cards[c]) + '" alt="" title="' + esc(INFO.cards[c].name) + '"><span class="no">' + (i + 1) + '</span></div>').join('') + '</div></div>';
  return '<div class="amrun"><div class="amrh"><b>#' + r.n + '</b> <span class="chip">' + (r.goingFirst ? '先攻' : '後攻') + '</span> <span class="chip">シード ' + r.seed + '</span> <span class="chip">キープ ' + r.kept + ' 枚 / 入れ替え ' + (r.hand0.length - r.kept) + ' 枚</span></div>' +
    '<div class="amrow"><span class="amlb">初期手札</span>' + initial + '<span class="amarrow">→</span><span class="amlb">マリガン後</span>' + after + why + '</div>' + order + '</div>';
}
function amRender(resetRuns) {
  ensureDecks();
  if (!AM.deckId || !INFO.decks.some(d => d.ready && d.id === AM.deckId)) { AM.deckId = MULL.deckId; AM.runs = []; AM.rules = null; }
  if (!AM.rules) amLoadRules();
  const v = q$('amullView');
  const pl = v.querySelector('.amleft'), pr = v.querySelector('.amruns');
  const sl = pl ? pl.scrollTop : 0, sr = pr && !resetRuns ? pr.scrollTop : 0;
  const decks = INFO.decks.filter(deckListed);
  const opt = d => '<option value="' + esc(d.id) + '"' + (d.id === AM.deckId ? ' selected' : '') + '>' + (d.custom ? '★' : '') + INFO.classes[d.class] + '・' + esc(d.name) + '</option>';
  const left = '<div class="panel amleft"><div class="row"><select id="amDeck" style="flex:1;min-width:0">' + decks.map(opt).join('') + '</select><button id="amEdit">デッキ編集</button></div>' +
    '<div class="row" style="margin:6px 0"><select id="amFirst"><option value="">先攻/後攻 ランダム</option><option value="1"' + (AM.first === '1' ? ' selected' : '') + '>先攻</option><option value="0"' + (AM.first === '0' ? ' selected' : '') + '>後攻</option></select><button id="amClear" class="danger">ルールを全部消す</button></div>' +
    '<div class="tip" style="line-height:1.6">ルールはデッキごとにこのブラウザへ保存されます。ルールに当たらないカードは、すべて入れ替えます。同じカードを複数のルールがキープさせるときは、いちばん多い枚数を採用します。</div>' + amRulesHtml() + '</div>';
  const right = '<div class="amright"><div class="amtop"><button class="primary" id="amGo">自動マリガン（10回）</button><span class="tip">押すたびに新しいシードで、初期手札 → ルールどおりにマリガン を 10 回くり返します（Enter でも可）</span></div><div class="amruns panel">' +
    (AM.runs.length ? AM.runs.map(amRunHtml).join('') : '<div class="tip" style="padding:14px;line-height:1.8">左でマリガンのルールを設定して、「自動マリガン（10回）」を押してください。<br>10 回ぶんの初期手札・マリガン後の手札（右にキープの理由）・山札の並びが、ここに並びます。</div>') + '</div></div>';
  v.innerHTML = left + right;
  v.querySelector('.amleft').scrollTop = sl; v.querySelector('.amruns').scrollTop = sr;
  q$('amDeck').onchange = e => { AM.deckId = e.target.value; AM.runs = []; amLoadRules(); amRender(); };
  q$('amFirst').onchange = e => { AM.first = e.target.value; };
  q$('amEdit').onclick = () => { EDIT_FOR = 'amull'; openEditor(); edLoadDeck(AM.deckId); };
  q$('amClear').onclick = () => { if (confirm('このデッキのマリガンルールをすべて消しますか？')) { AM.rules = amEmptyRules(); amSaveRules(); AM.runs = []; amRender(); } };
  q$('amGo').onclick = amRun10;
  v.querySelectorAll('[data-amadd]').forEach(el => el.onclick = () => {
    const path = el.dataset.amadd;
    openPicker('マリガンルールに入れるカード', c => { amSlot(path).oid = c.official_id; amSaveRules(); amRender(); }, { deckId: AM.deckId, deckOnly: true });
  });
  v.querySelectorAll('[data-amdel]').forEach(el => el.onclick = () => { const s = amSlot(el.dataset.amdel); s.oid = null; s.n = 1; amSaveRules(); amRender(); });
  v.querySelectorAll('[data-amn]').forEach(el => el.onchange = () => { amSlot(el.dataset.amn).n = +el.value; amSaveRules(); });
  v.querySelectorAll('[data-cid][data-pop]').forEach(el => el.onclick = () => showCardPop(INFO.cards[+el.dataset.cid]));
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
function defaultBoardUnit(c) { return { oid: c.official_id, atk: c.atk, hp: c.hp, max_hp: c.hp, evolved: false, super_evolved: false, can_attack: true, attacked: false, countdown: c.countdown || 0, evidence: isEvidence(c) ? 1 : 0, kw: 0 }; }
function setupToEngine() {
  const side = s => ({
    leader_hp: s.leader_hp, pp: s.pp, max_pp: s.max_pp, evo_left: s.evo_left, sep: s.sep, epp: s.epp, shadows: s.shadows,
    hand: s.hand.map(h => ({ oid: h.oid, cost: h.cost == null || h.cost === '' ? undefined : +h.cost })),
    board: s.board.map(u => ({ oid: u.oid, atk: u.atk, hp: u.hp, max_hp: u.max_hp, evolved: u.evolved, super_evolved: u.super_evolved, can_attack: u.can_attack, attacked: u.attacked, countdown: cardOf(u.oid).kind === 'amulet' ? u.countdown : undefined, evidence: u.evidence || undefined, kw: u.kw || 0 })),
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
const relBadge = c => (c.related && c.related.length) ? '<span class="relbadge" title="関連カード（トークンなど）あり。選ぶと右側から出せます">◆</span>' : '';
function withBadge(html, c, del) {
  const x = del ? '<button class="xdel" data-del="' + del + '" title="このカードを消す（選択中は Delete キーでも）">×</button>' : '';
  const b = relBadge(c) + x;
  return b ? html.replace(/<\/div>$/, b + '</div>') : html;
}
function sideBoardHtml(si) {
  const s = SETUP.sides[si];
  const tag = '<span class="rowtag">' + (si === 0 ? '自分' : '相手') + 'の場 ' + s.board.length + '/5</span>';
  const units = s.board.map((u, i) => withBadge(unitTile(cardOf(u.oid), { ...u, cls: (SEL && SEL.w === 'board' && SEL.si === si && SEL.i === i ? ['sel'] : []), attrs: 'data-sel="board:' + si + ':' + i + '"' }), cardOf(u.oid), 'board:' + si + ':' + i)).join('');
  return tag + units + (s.board.length < 5 ? slotTile('u', 'data-add="board:' + si + '"') : '');
}
function sideHandHtml(si) {
  const s = SETUP.sides[si];
  const tag = '<span class="rowtag">' + (si === 0 ? '自分' : '相手') + 'の手札 ' + s.hand.length + '/9</span>';
  const tiles = s.hand.map((h, i) => withBadge(handTile(cardOf(h.oid), { cost: h.cost == null ? null : h.cost, cls: ['playable'].concat(SEL && SEL.w === 'hand' && SEL.si === si && SEL.i === i ? ['sel'] : []), attrs: 'data-sel="hand:' + si + ':' + i + '"' }), cardOf(h.oid), 'hand:' + si + ':' + i)).join('');
  return tag + tiles + (s.hand.length < 9 ? slotTile('h', 'data-add="hand:' + si + '"') : '');
}
function editorPanelHtml() {
  const g = getSel();
  if (!g) {
    return '<div class="tip" style="line-height:1.7">場・手札のカードをクリックして編集します。「＋」の枠でカードを追加します。<br>右クリックでカードの詳細。</div>' +
      '<div class="sec">まとめて消す</div><div class="row"><button data-clear="hand:0">自分の手札</button><button data-clear="board:0">自分の場</button><button data-clear="hand:1">相手の手札</button><button data-clear="board:1">相手の場</button></div>' +
      '<div class="sec">手札をデッキからランダムに配る</div><div class="row"><input type="number" id="dealN" min="0" max="9" value="5" style="width:54px"> 枚 <button data-deal="0">自分</button><button data-deal="1">相手</button></div>' +
      '<div class="sec">手番・ターンから既定値</div><div class="row"><button data-defaults="all">PP・進化などを入れ直す</button></div><div class="tip">ターン数・先攻・手番を変えると自動で入ります（手で直した席は変わりません）。</div>';
  }
  const { x, c } = g, p = SEL.w + ':' + SEL.si + ':' + SEL.i;
  let h = '<img src="' + imgUrl(c) + '" alt="" data-pop="1" data-oid="' + c.official_id + '" style="cursor:pointer"><div class="nm">' + esc(c.name) + '</div><div class="tip">' + INFO.classes[c.class] + ' ・ ' + { follower: 'フォロワー', spell: 'スペル', amulet: 'アミュレット' }[c.kind] + ' ・ コスト' + c.cost + '</div>';
  h += relatedHtml(c);
  const row = (label, body) => '<div class="erow"><span>' + label + '</span>' + body + '</div>';
  const tg = (f, label) => '<label class="tgl"><input type="checkbox" data-edt="' + f + '"' + (x[f] ? ' checked' : '') + '> ' + label + '</label>';
  const kb = (bit, label) => '<label class="tgl"><input type="checkbox" data-edk="' + bit + '"' + (((x.kw || 0) & bit) ? ' checked' : '') + '> ' + label + '</label>';
  if (SEL.w === 'hand') {
    h += row('コスト', stepper('ed:cost', x.cost == null ? c.cost : x.cost) + (x.cost == null ? '' : '<button data-edx="resetcost">元に戻す</button>'));
  } else if (c.kind === 'amulet') {
    h += isEvidence(c) ? row('証拠', stepper('ed:evidence', x.evidence || 1)) : row('カウント', stepper('ed:countdown', x.countdown));
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
/** 関連カード（トークン・生成されるカード）を、選択中のカードと同じ側の手札・場に出すボタン */
function relatedHtml(c) {
  const rel = (c.related || []).map(cardOf).filter(Boolean);
  if (!rel.length) return '';
  return '<div class="sec">関連カード（トークンなど）</div><div class="relgrid">' + rel.map(r =>
    '<div class="rel"><img data-pop="1" data-oid="' + r.official_id + '" src="' + imgUrl(r) + '" alt="' + esc(r.name) + '" title="' + esc(r.name) + '"><div class="nm">' + esc(r.name) + '</div><div class="rb"><button data-rel="' + r.official_id + ':hand">手札</button><button data-rel="' + r.official_id + ':board"' + (r.kind === 'spell' ? ' disabled title="スペルは場に置けません"' : '') + '>場</button></div></div>').join('') + '</div>';
}
function deckPanelHtml(si) {
  const decks = INFO.decks.filter(deckListed);
  const opt = cur => decks.map(d => '<option value="' + esc(d.id) + '"' + (d.id === cur ? ' selected' : '') + '>' + (d.custom ? '★' : '') + INFO.classes[d.class] + '・' + esc(d.name) + '</option>').join('');
  let rows = '';
  try {
    const d = APP.decks.resolve(SETUP.decks[si]), s = SETUP.sides[si];
    const used = countBy([...s.hand, ...s.board].map(x => x.oid));
    const list = d.cards.map(([oid, n]) => ({ c: cardOf(oid), n })).filter(x => x.c).sort((a, b) => a.c.cost - b.c.cost || a.c.official_id - b.c.official_id);
    rows = list.map(({ c, n }) => {
      const r = n - (used[c.official_id] || 0);
      return '<div class="dr' + (r <= 0 ? ' zero' : '') + '" data-dc="' + c.official_id + '" data-ds="' + si + '" title="クリックで手札に追加 / 盤面へドラッグ / 右クリックで詳細"><span class="c">' + c.cost + '</span><span class="nm">' + esc(c.name) + '</span>' + (c.related && c.related.length ? '<span class="rb2" title="関連カードあり">◆</span>' : '') + '<span class="n">残り ' + Math.max(r, 0) + '/' + n + '</span></div>';
    }).join('');
  } catch (e) { rows = '<span class="tip">' + esc(e.message) + '</span>'; }
  return '<div class="panel dpanel" data-dside="' + si + '"><div class="dph"><b>' + (si === 0 ? '自分' : '相手') + 'のデッキ</b><span class="tip">手札・場へドラッグ</span></div>' +
    '<div class="row" style="flex-wrap:nowrap"><select data-dsel="' + si + '" style="min-width:0;flex:1">' + opt(SETUP.decks[si]) + '</select><button data-dedit="' + si + '">編集</button></div><div class="list">' + rows + '</div></div>';
}
let FLASH = { t: '', until: 0, timer: null };
function flashMsg(t) {
  FLASH.t = t; FLASH.until = Date.now() + 4000;
  const el = q$('sMsg');
  if (el) { const f = el.querySelector('.flash'); if (f) f.textContent = t; else el.insertAdjacentHTML('afterbegin', '<div class="flash">' + esc(t) + '</div>'); }
  clearTimeout(FLASH.timer);
  FLASH.timer = setTimeout(() => { FLASH.t = ''; const e = q$('sMsg'); const f = e && e.querySelector('.flash'); if (f) f.remove(); }, 4000);
}
/** 指定した席の手札・場にカードを足す（ドラッグ・クリック・関連カード共通）。足せたら true。メッセージは画面内に出す */
function addToSide(si, oid, where, opt) {
  opt = opt || {};
  const c = cardOf(oid), s = SETUP.sides[si], who = si === 0 ? '自分' : '相手';
  if (where === 'board') {
    if (c.kind === 'spell') { flashMsg('スペルは場に置けません（手札に置いてください）'); return false; }
    if (s.board.length >= 5) { flashMsg(who + 'の場がいっぱいです（5/5）'); return false; }
    s.board.push(defaultBoardUnit(c));
  } else {
    if (s.hand.length >= 9) { flashMsg(who + 'の手札がいっぱいです（9/9）'); return false; }
    s.hand.push({ oid, cost: null });
  }
  if (!opt.keepSel) SEL = { w: where, si, i: (where === 'hand' ? s.hand : s.board).length - 1 };
  setupRender(); drawerRender();
  flashMsg(who + 'の' + (where === 'hand' ? '手札' : '場') + 'に「' + c.name + '」を追加');
  return true;
}
function setupRender() {
  ensureDecks();
  const saved = GM.lsGet(GM.SETUP_KEY, {});
  const names = Object.keys(saved);
  const bar = '<div class="mbar row">' +
    '<label class="fld">先攻 <select id="sFirst"><option value="0"' + (SETUP.first === 0 ? ' selected' : '') + '>自分</option><option value="1"' + (SETUP.first === 1 ? ' selected' : '') + '>相手</option></select></label>' +
    '<label class="fld">手番 <select id="sActive"><option value="0"' + (SETUP.active === 0 ? ' selected' : '') + '>自分</option><option value="1"' + (SETUP.active === 1 ? ' selected' : '') + '>相手</option></select></label>' +
    '<label class="fld">手番の席の <span class="stp"><button data-sn="-1">−</button><b>' + SETUP.n + '</b><button data-sn="1">＋</button></span> ターン目</label>' +
    '<span class="menuwrap"><button id="sMenuBtn">保存・読み込み ▾</button><div id="sMenu" class="panel col-btns"><select id="sLoad"><option value="">保存した盤面…</option>' + names.map(n => '<option>' + esc(n) + '</option>').join('') + '</select>' +
    '<button id="sSave">保存</button><button id="sDel">削除</button><button id="sExport">コードをコピー</button><button id="sImport">コードを貼り付け</button><button id="sSwap">自分⇔相手 入れ替え</button><button id="sReset">初期化</button></div></span></div>';
  const probs = setupProblems();
  const left = '<div class="dcol">' + deckPanelHtml(1) + deckPanelHtml(0) + '</div>';
  const center = '<div class="mcenter setup">' + sideInfoHtml(1) +
    '<div class="strip" data-hs="1">' + sideHandHtml(1) + '</div>' +
    '<div class="board" data-bd="1">' + sideBoardHtml(1) + '</div><div class="board" data-bd="0">' + sideBoardHtml(0) + '</div>' +
    sideInfoHtml(0) + '<div class="hand-row" id="sHand" data-hs="0">' + sideHandHtml(0) + '</div></div>';
  const flash = FLASH.t && Date.now() < FLASH.until ? '<div class="flash">' + esc(FLASH.t) + '</div>' : '';
  const right = '<div class="mright"><button class="round gold" id="sStart">この盤面で<br>開始</button>' +
    '<div class="msg" id="sMsg">' + flash + (SETUP_MSG ? '<span style="color:var(--bad)">' + esc(SETUP_MSG) + '</span>' : '') + probs.map(x => '<div class="warn">' + esc(x) + '</div>').join('') + '</div>' +
    '<div class="panel" id="sEditor">' + editorPanelHtml() + '</div></div>';
  const v = q$('setupView');
  const keepScroll = [...v.querySelectorAll('.dpanel .list')].map(l => l.scrollTop);
  v.innerHTML = bar + '<div class="mg setupg">' + left + center + right + '</div>';
  v.querySelectorAll('.dpanel .list').forEach((l, i) => { l.scrollTop = keepScroll[i] || 0; });
  bindSetup(v);
  watchRows([q$('sHand'), ...v.querySelectorAll('.strip')]);
  requestAnimationFrame(() => { fitRow(q$('sHand')); v.querySelectorAll('.strip').forEach(fitRow); });
}
function bindSetup(v) {
  const reDefaults = () => { applyDefaults(0); applyDefaults(1); setupRender(); drawerRender(); };
  v.querySelectorAll('[data-dsel]').forEach(s => s.onchange = () => { SETUP.decks[+s.dataset.dsel] = s.value; setupRender(); drawerRender(); });
  v.querySelectorAll('[data-dedit]').forEach(b => b.onclick = () => { EDIT_FOR = +b.dataset.dedit; openEditor(); edLoadDeck(SETUP.decks[EDIT_FOR]); });
  v.querySelectorAll('.dpanel .dr').forEach(r => r.oncontextmenu = e => { e.preventDefault(); showCardPop(cardOf(+r.dataset.dc), { side: +r.dataset.ds }); });
  q$('sMenuBtn').onclick = e => { e.stopPropagation(); q$('sMenu').classList.toggle('open'); };
  q$('sMenu').onclick = e => e.stopPropagation();
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
  v.querySelectorAll('[data-del]').forEach(b => { b.onclick = e => { e.stopPropagation(); const [w, si, i] = b.dataset.del.split(':'); removeCard(w, +si, +i); }; b.oncontextmenu = e => e.stopPropagation(); });
  v.querySelectorAll('[data-clear]').forEach(b => b.onclick = () => { const [w, si] = b.dataset.clear.split(':'); clearRow(w, +si); });
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
  v.querySelectorAll('[data-rel]').forEach(b => b.onclick = () => { if (!SEL) return; const [oid, w] = b.dataset.rel.split(':'); addToSide(SEL.si, +oid, w, { keepSel: true }); });
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
  else if (f === 'evidence') x.evidence = Math.max(1, Math.min(99, (x.evidence || 1) + d));
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
/** 置いたカードを消す（選択中の位置がずれないよう直す） */
function removeCard(w, si, i) {
  const list = w === 'hand' ? SETUP.sides[si].hand : SETUP.sides[si].board;
  const x = list[i]; if (!x) return;
  list.splice(i, 1);
  if (SEL && SEL.w === w && SEL.si === si) { if (SEL.i === i) SEL = null; else if (SEL.i > i) SEL.i--; }
  setupRender(); drawerRender();
  flashMsg((si === 0 ? '自分' : '相手') + 'の' + (w === 'hand' ? '手札' : '場') + 'から「' + cardOf(x.oid).name + '」を消しました');
}
function clearRow(w, si) {
  const s = SETUP.sides[si], list = w === 'hand' ? s.hand : s.board;
  if (!list.length) { flashMsg('消すカードがありません'); return; }
  if (!confirm((si === 0 ? '自分' : '相手') + 'の' + (w === 'hand' ? '手札' : '場') + 'の ' + list.length + ' 枚をすべて消しますか？')) return;
  list.length = 0;
  if (SEL && SEL.w === w && SEL.si === si) SEL = null;
  setupRender(); drawerRender();
  flashMsg((si === 0 ? '自分' : '相手') + 'の' + (w === 'hand' ? '手札' : '場') + 'を空にしました');
}
function addCard(spec) {
  const [w, si] = spec.split(':');
  openPicker((w === 'hand' ? '手札に追加' : '場に追加') + '（' + (+si === 0 ? '自分' : '相手') + '）', c => addToSide(+si, c.official_id, w), { boardOnly: w === 'board', side: +si, keep: w === 'hand' });
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

// ---------------- デッキ一覧からのドラッグ（ポインタイベント。マウスでもタッチでも動く） ----------------
let DRAG = null;
let EDIT_FOR = null;   // デッキ編集を開いた画面・席（0/1/'mull'）。保存したら、その席のデッキを保存したものに切り替える
function dropTarget(x, y) {
  const el = document.elementFromPoint(x, y);
  const t = el && el.closest ? el.closest('[data-hs],[data-bd]') : null;
  if (!t) return null;
  return { el: t, where: t.dataset.hs != null ? 'hand' : 'board', side: +(t.dataset.hs != null ? t.dataset.hs : t.dataset.bd) };
}
function endDrag() {
  if (!DRAG) return;
  if (DRAG.ghost) DRAG.ghost.remove();
  document.querySelectorAll('#setupView .drop, #setupView .drop-hot').forEach(e => e.classList.remove('drop', 'drop-hot'));
  document.body.classList.remove('dragging');
  DRAG = null;
}
function initSetupDrag() {
  const root = q$('setupView');
  root.addEventListener('pointerdown', e => {
    if (MODE !== 'setup' || e.button !== 0) return;
    const r = e.target.closest('.dpanel .dr[data-dc]'); if (!r) return;
    DRAG = { oid: +r.dataset.dc, si: +r.dataset.ds, x: e.clientX, y: e.clientY, moved: false, ghost: null, pid: e.pointerId };
  });
  document.addEventListener('pointermove', e => {
    if (!DRAG || e.pointerId !== DRAG.pid || MODE !== 'setup') return;
    if (!DRAG.moved) {
      if (Math.hypot(e.clientX - DRAG.x, e.clientY - DRAG.y) < 6) return;
      DRAG.moved = true;
      const g = document.createElement('div'); g.className = 'ghost'; g.innerHTML = '<img src="' + imgUrl(cardOf(DRAG.oid)) + '" alt="">'; document.body.appendChild(g); DRAG.ghost = g;
      document.body.classList.add('dragging');
      root.querySelectorAll('[data-hs="' + DRAG.si + '"],[data-bd="' + DRAG.si + '"]').forEach(t => t.classList.add('drop'));
    }
    DRAG.ghost.style.left = e.clientX + 'px'; DRAG.ghost.style.top = e.clientY + 'px';
    root.querySelectorAll('.drop-hot').forEach(t => t.classList.remove('drop-hot'));
    const t = dropTarget(e.clientX, e.clientY);
    if (t && t.side === DRAG.si) t.el.classList.add('drop-hot');
  });
  document.addEventListener('pointerup', e => {
    if (!DRAG || e.pointerId !== DRAG.pid) return;
    const d = DRAG;
    const t = d.moved ? dropTarget(e.clientX, e.clientY) : null;
    endDrag();
    if (MODE !== 'setup') return;
    if (!d.moved) { addToSide(d.si, d.oid, 'hand'); return; }            // 動かさなければクリック: 手札に追加
    if (!t) return;
    if (t.side !== d.si) { const who = d.si === 0 ? '自分' : '相手'; flashMsg(who + 'のデッキのカードは、' + who + 'の手札・場にだけ置けます'); return; }
    addToSide(d.si, d.oid, t.where);
  });
  document.addEventListener('pointercancel', () => endDrag());
  document.addEventListener('click', () => { if (MODE === 'setup') { const mn = q$('sMenu'); if (mn) mn.classList.remove('open'); } });
}

// ---------------- カード選択（手札・場への追加） ----------------
let PICK = { cb: null, boardOnly: false, deckOids: new Set(), deckClass: 0 };
function openPicker(title, cb, opt) {
  opt = opt || {};
  let deckOids = new Set(), deckClass = 0;
  try { const d = APP.decks.resolve(opt.deckId || SETUP.decks[opt.side || 0]); d.cards.forEach(([o]) => deckOids.add(o)); deckClass = d.class; } catch (e) { /* デッキ未選択 */ }
  PICK = { cb, boardOnly: !!opt.boardOnly, deckOids, deckClass, deckOnly: !!opt.deckOnly };
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
    && (PICK.deckOnly ? PICK.deckOids.has(c.official_id) : (cls === '' || (cls === 'deck' ? (c.class === PICK.deckClass || c.class === 0 || c.token) : c.class === +cls)))
    && (!kind || c.kind === kind) && (!PICK.boardOnly || c.kind !== 'spell') && (!q || (c.name + ' ' + c.text).toLowerCase().includes(q)));
  pool.sort((a, b) => (PICK.deckOids.has(b.official_id) - PICK.deckOids.has(a.official_id)) || a.cost - b.cost || a.official_id - b.official_id);
  const more = pool.length > 240; pool = pool.slice(0, 240);
  q$('pickPool').innerHTML = pool.map(c => '<div class="pk' + (PICK.deckOids.has(c.official_id) ? ' indeck' : '') + '" data-o="' + c.official_id + '" title="' + esc(c.name) + '"><img loading="lazy" src="' + imgUrl(c) + '" alt=""><div class="nm">' + c.cost + ' ' + esc(c.name) + '</div></div>').join('') + (more ? '<div class="tip">表示は240件まで。絞り込んでください。</div>' : '');
  q$('pickPool').querySelectorAll('.pk').forEach(el => {
    el.onclick = () => { const done = PICK.cb(cardOf(+el.dataset.o)); if (done !== false && !q$('pickKeep').checked) q$('picker').classList.remove('on'); };
    el.oncontextmenu = e => { e.preventDefault(); showCardPop(cardOf(+el.dataset.o)); };
  });
}

// デッキ編集で保存したとき（index.html の保存処理から呼ばれる）: 編集を開いた席のデッキを、保存したデッキに切り替える
function onDeckSaved(name, ready) {
  const who = EDIT_FOR;
  EDIT_FOR = null;
  if (who === null) return;
  if (!ready) { if (MODE === 'setup') flashMsg('「' + name + '」は未完成（40枚ではない等）なので、デッキは切り替えていません'); return; }
  const id = 'c:' + name;
  if (who === 'amull' && MODE === 'amull') { AM.deckId = id; AM.runs = []; AM.rules = null; amRender(); }
  else if (who === 'mull' && MODE === 'mull') { MULL.deckId = id; MULL.history = []; MULL.count = 0; MULL.phase = 'idle'; mullRender(); }
  else if ((who === 0 || who === 1) && MODE === 'setup') {
    SETUP.decks[who] = id; setupRender(); drawerRender();
    flashMsg((who === 0 ? '自分' : '相手') + 'のデッキを「' + name + '」に切り替えました');
  }
}

// ---------------- 初期化 ----------------
function initModes() {
  const tabs = document.createElement('div'); tabs.className = 'tabs';
  tabs.innerHTML = '<button data-mode="play">対戦</button><button data-mode="mull">マリガン練習</button><button data-mode="amull">自動マリガン確認</button><button data-mode="setup">盤面再現</button>';
  q$('topbar').insertBefore(tabs, q$('status'));
  tabs.onclick = e => { const b = e.target.closest('button'); if (b) setMode(b.dataset.mode); };
  const mk = (tag, id, cls) => { const e = document.createElement(tag); e.id = id; if (cls) e.className = cls; document.body.appendChild(e); return e; };
  mk('div', 'mullView', 'view'); mk('div', 'amullView', 'view'); mk('div', 'setupView', 'view');
  const dr = mk('div', 'drawer'); dr.innerHTML = '<h3 id="drawerTitle">デッキ一覧</h3><div class="tip">クリックでカード詳細</div><div class="list"></div>';
  dr.addEventListener('click', e => { const r = e.target.closest('.dr'); if (r) showCardPop(cardOf(+r.dataset.oid)); });
  const tab = mk('button', 'drawerTab'); tab.textContent = 'デッキ ◀'; tab.onclick = () => toggleDrawer();
  mk('div', 'cardpop');
  const pk = mk('div', 'picker');
  pk.innerHTML = '<div class="top"><b id="pickTitle">カードを選ぶ</b><input type="search" id="pickQ" placeholder="カード名・テキスト" size="20"><select id="pickClass"><option value="deck">このデッキ＋中立＋トークン</option><option value="">全クラス</option>' + INFO.classes.map((n, i) => '<option value="' + i + '">' + n + '</option>').join('') + '</select><select id="pickKind"><option value="">全種別</option><option value="follower">フォロワー</option><option value="spell">スペル</option><option value="amulet">アミュレット</option></select><label><input type="checkbox" id="pickTok" checked> トークンも</label><label><input type="checkbox" id="pickRot"> ローテのみ</label><label><input type="checkbox" id="pickKeep"> 続けて追加</label><button id="pickClose">閉じる</button><span class="tip">クリックで追加 / 右クリックで詳細 / デッキのカードが先頭</span></div><div class="body"><div class="pool" id="pickPool"></div></div>';
  q$('pickClose').onclick = () => pk.classList.remove('on');
  ['pickQ', 'pickClass', 'pickKind', 'pickTok', 'pickRot'].forEach(id => { q$(id).oninput = pickRender; q$(id).onchange = pickRender; });
  initSetupDrag();
  const baseRender = render; render = function () { baseRender(); if (MODE === 'play') drawerRender(); };
  const baseFill = fillDeckSelects;
  fillDeckSelects = function () { baseFill(); if (MODE === 'mull') mullRender(); if (MODE === 'amull') amRender(); if (MODE === 'setup') setupRender(); };
  const ready = INFO.decks.filter(deckListed);
  MULL.deckId = (ready.find(d => d.id === 'b:0') || ready[0]).id;
  SETUP.decks = [MULL.deckId, MULL.deckId];
  AM.deckId = MULL.deckId;
  applyDefaults(0); applyDefaults(1);
  window.addEventListener('resize', () => { if (MODE === 'mull' && q$('mullHand')) fitRow(q$('mullHand')); if (MODE === 'setup' && q$('sHand')) { fitRow(q$('sHand')); q$('setupView').querySelectorAll('.strip').forEach(fitRow); } });
  document.addEventListener('keydown', e => {
    if (e.target.matches('input,select,textarea')) return;
    if (MODE === 'mull' && e.key === 'Enter') { e.preventDefault(); mullPrimary(); }
    if (MODE === 'amull' && e.key === 'Enter' && !q$('picker').classList.contains('on')) { e.preventDefault(); amRun10(); }
    if (MODE === 'setup' && (e.key === 'Delete' || e.key === 'Backspace') && SEL && !q$('picker').classList.contains('on')) { e.preventDefault(); removeCard(SEL.w, SEL.si, SEL.i); }
  });
  setMode('mull');   // 最初はマリガン練習
}

/** 環境の絞り込みで隠れるデッキでも、いま選んでいるデッキ（マリガン練習・自動マリガン確認・盤面再現）は一覧に残す */
function deckListed(d) {
  if (!d.ready) return false;
  return deckShown(d) || [typeof MULL !== 'undefined' && MULL.deckId, typeof AM !== 'undefined' && AM.deckId, ...((typeof SETUP !== 'undefined' && SETUP.decks) || [])].includes(d.id);
}

/** 証拠（種族21）のアミュレットか */
function isEvidence(c) { return c.kind === 'amulet' && (c.tribes || []).includes(21); }

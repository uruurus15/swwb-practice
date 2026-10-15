// モード切替（対戦 / マリガン練習 / 盤面再現）・デッキ一覧ドロワー・カード詳細・カード選択。
// index.html のスクリプト（S, INFO, api, render, byOid など）のあとで initModes() が呼ばれる。
let MODE = 'play';
const SW = window.SWWB, GM = window.SWWBGame;
const q$ = id => document.getElementById(id);
const imgUrl = c => 'cardimg/' + c.official_id + '.webp';
const popcnt = n => { let k = 0; while (n) { k += n & 1; n >>= 1; } return k; };
const cardOf = oid => byOid()[oid];

// ---------------- カード詳細（クリックで表示） ----------------
function showCardPop(c) {
  const el = q$('cardpop');
  const kind = { follower: 'フォロワー', spell: 'スペル', amulet: 'アミュレット' }[c.kind];
  const st = c.kind === 'follower' ? ' ・ ' + c.atk + '/' + c.hp : (c.countdown ? ' ・ カウントダウン' + c.countdown : '');
  el.innerHTML = '<img src="' + imgUrl(c) + '" alt=""><div><div class="nm">' + esc(c.name) + '</div><div class="tip">' + INFO.classes[c.class] + ' ・ ' + kind + ' ・ コスト' + c.cost + st + (c.enhance ? ' ・ エンハンス' + c.enhance : '') + '</div><div class="tx">' + fmt(c.text) + '</div></div>';
  el.classList.add('on');
}
document.addEventListener('click', e => { const el = q$('cardpop'); if (el && el.classList.contains('on') && !e.target.closest('[data-pop]')) el.classList.remove('on'); }, true);

// ---------------- デッキ一覧（画面の端に出すドロワー） ----------------
const DRAWER = { open: false };
function deckEntries(deckId) {
  const d = APP.decks.resolve(deckId);
  const list = d.cards.map(([oid, n]) => ({ c: cardOf(oid), n })).filter(x => x.c);
  list.sort((a, b) => a.c.cost - b.c.cost || a.c.official_id - b.c.official_id);
  return { d, list };
}
function currentDrawerDeck() {
  if (MODE === 'mull') return { id: MULL.deckId, hand: MULL.phase === 'result' ? MULL.hand1 : MULL.hand0 };
  if (MODE === 'setup') return { id: SETUP.decks[0], hand: SETUP.sides[0].hand.map(h => cardOf(h.oid) && cardOf(h.oid).id) };
  const g = APP.game;
  if (g && g.started && g.myDeckId) return { id: g.myDeckId, remain: S && S.deck_counts, hand: S && S.hand.map(h => h.card) };
  return null;
}
function drawerRender() {
  const box = q$('drawer');
  if (!box.classList.contains('open')) return;
  const cur = currentDrawerDeck();
  if (!cur) { box.querySelector('.list').innerHTML = '<span class="tip">デッキを選ぶと一覧が出ます</span>'; q$('drawerTitle').textContent = 'デッキ一覧'; return; }
  let info;
  try { info = deckEntries(cur.id); } catch (e) { box.querySelector('.list').innerHTML = '<span class="tip">' + esc(e.message) + '</span>'; return; }
  const remain = {}; if (cur.remain) cur.remain.forEach(([c, n]) => remain[c] = n);
  const inHand = {}; (cur.hand || []).forEach(c => inHand[c] = (inHand[c] || 0) + 1);
  q$('drawerTitle').textContent = info.d.name + '（' + info.list.reduce((a, x) => a + x.n, 0) + '枚）';
  box.querySelector('.list').innerHTML = info.list.map(({ c, n }) => {
    const r = cur.remain ? (remain[c.id] || 0) : null;
    const h = inHand[c.id] || 0;
    const cls = ['dr']; if (h) cls.push('hit'); if (r === 0) cls.push('zero');
    const right = r != null ? '山札 ' + r + '/' + n + (h ? ' ・手札 ' + h : '') : (h ? '手札 ' + h + ' / ' + n : '×' + n);
    return '<div class="' + cls.join(' ') + '" data-pop="1" data-oid="' + c.official_id + '"><span class="c">' + c.cost + '</span><span class="nm">' + esc(c.name) + '</span><span class="n">' + right + '</span></div>';
  }).join('');
}
function toggleDrawer(force) {
  const box = q$('drawer');
  const on = force != null ? force : !box.classList.contains('open');
  box.classList.toggle('open', on);
  q$('drawerTab').textContent = on ? 'デッキ ▶' : 'デッキ ◀';
  q$('drawerTab').style.right = on ? '274px' : '0';
  drawerRender();
}

// ---------------- モード切替 ----------------
function setMode(m) {
  MODE = m;
  q$('game').style.display = m === 'play' ? '' : 'none';
  q$('mullView').classList.toggle('on', m === 'mull');
  q$('setupView').classList.toggle('on', m === 'setup');
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
  q$('status').style.display = m === 'play' ? '' : 'none';
  if (m === 'play') { q$('settingsBtn').style.display = ''; if (S) render(); else { q$('status').className = 'wait'; q$('status').textContent = '「設定・新しいゲーム」からゲームを始めてください'; q$('settings').classList.add('open'); } }
  else { q$('settingsBtn').style.display = 'none'; q$('settings').classList.remove('open'); q$('cancelTop').style.display = 'none'; q$('againTop').style.display = 'none'; }
  if (m === 'mull' && MULL.phase === 'idle') mullDeal();
  if (m === 'mull') mullRender();
  if (m === 'setup') setupRender();
  drawerRender();
}

// ---------------- マリガン練習 ----------------
const MULL = { deckId: null, first: '', phase: 'idle', hand0: [], hand1: [], mask: 0, seed: 0, count: 0, history: [] };
function mullDeal() {
  const d = APP.decks.resolve(MULL.deckId);
  let seed = Math.floor(Math.random() * 2 ** 31);   // 毎回シードを変える
  const base = { op: 'reset', class0: d.class, cards0: d.cards, class1: d.class, cards1: d.cards };
  let o;
  for (let k = 0; k < 64; k++) {
    SW.call({ slot: 1, ...base, seed });
    if (MULL.first === '') break;
    o = SW.call({ slot: 1, op: 'observe', seat: 0 });
    if (o.going_first === (MULL.first === '1')) break;
    seed = (seed + 1) % 2 ** 31;
  }
  // 先に動く相手（ボット）のマリガンを済ませる
  let guard = 0;
  o = SW.call({ slot: 1, op: 'observe', seat: 0 });
  while (!o.finished && !o.is_active && guard++ < 50) {
    const a = SW.call({ slot: 1, op: 'bot', kind: 2 }).id;
    SW.call({ slot: 1, op: 'step', id: a });
    o = SW.call({ slot: 1, op: 'observe', seat: 0 });
  }
  MULL.seed = seed; MULL.count++; MULL.phase = 'choose'; MULL.mask = 0; MULL.first = MULL.first;
  MULL.hand0 = o.my_hand.slice(); MULL.hand1 = []; MULL.goingFirst = o.going_first;
}
function mullToggle(i) {
  if (MULL.phase !== 'choose') return;
  SW.call({ slot: 1, op: 'step', id: 1 + i });
  MULL.mask = SW.call({ slot: 1, op: 'observe', seat: 0 }).mull_mask;
  mullRender();
}
function mullConfirm() {
  if (MULL.phase !== 'choose') return;
  const mask = MULL.mask;
  SW.call({ slot: 1, op: 'step', id: 0 });
  const o = SW.call({ slot: 1, op: 'observe', seat: 0 });
  MULL.hand1 = o.my_hand.slice();
  MULL.kept = MULL.hand0.length - popcnt(mask);
  MULL.phase = 'result';
  MULL.history.unshift({ n: MULL.count, hand0: MULL.hand0.slice(), mask, hand1: MULL.hand1.slice(), first: MULL.goingFirst });
  if (MULL.history.length > 12) MULL.history.pop();
  mullRender();
}
function mullAgain() { mullDeal(); mullRender(); }
function mullTile(cid, cls, i) {
  const c = INFO.cards[cid];
  return '<div class="mc ' + (cls || '') + '" data-pop="1" data-mc="' + (i == null ? '' : i) + '" data-cid="' + cid + '"><img src="' + imgUrl(c) + '" alt="' + esc(c.name) + '"><span class="cost">' + c.cost + '</span></div>';
}
function mullRender() {
  const v = q$('mullView');
  const decks = INFO.decks.filter(d => d.ready);
  const sel = '<select id="mullDeck">' + decks.map(d => '<option value="' + esc(d.id) + '"' + (d.id === MULL.deckId ? ' selected' : '') + '>' + (d.custom ? '★' : '') + INFO.classes[d.class] + '・' + esc(d.name) + '</option>').join('') + '</select>';
  const firstSel = '<select id="mullFirst"><option value="">先攻/後攻 ランダム</option><option value="1"' + (MULL.first === '1' ? ' selected' : '') + '>先攻</option><option value="0"' + (MULL.first === '0' ? ' selected' : '') + '>後攻</option></select>';
  let html = '<div class="row"><b>デッキ</b> ' + sel + firstSel + '<button id="mullEdit">デッキ編集</button><span class="tip">配り直すたびにシード（山札の順序）が変わります。カードを右クリック/クリックで詳細。</span></div>';
  if (MULL.phase === 'choose') {
    html += '<div class="row" style="margin-top:10px"><button class="gold bigbtn" id="mullOk">マリガン確定（Enter）</button><span class="tip">' + popcnt(MULL.mask) + ' 枚を入れ替え</span></div>';
    html += '<div class="sec">最初の手札（入れ替えるカードをクリック）　試行 #' + MULL.count + ' ・ ' + (MULL.goingFirst ? '先攻' : '後攻') + ' ・ シード ' + MULL.seed + '</div><div class="row" style="gap:18px;padding-top:10px">' + MULL.hand0.map((c, i) => mullTile(c, ((MULL.mask >> i) & 1) ? 'mark' : '', i)).join('') + '</div>';
  } else if (MULL.phase === 'result') {
    html += '<div class="row" style="margin-top:10px"><button class="primary bigbtn" id="mullAgain">もう一度（新しいシード・Enter）</button><span class="tip">戻したカードそのものは引き直されません（残りの山札から引いたあとで混ぜます）</span></div>';
    html += '<div class="sec">最初の手札　試行 #' + MULL.count + ' ・ ' + (MULL.goingFirst ? '先攻' : '後攻') + ' ・ シード ' + MULL.seed + '</div><div class="row" style="gap:18px;padding-top:10px">' + MULL.hand0.map((c, i) => mullTile(c, ((MULL.history[0].mask >> i) & 1) ? 'out' : 'keep', null)).join('') + '</div>';
    html += '<div class="sec">マリガン後の手札（' + MULL.hand1.length + '枚）</div><div class="row" style="gap:18px;padding-top:10px">' + MULL.hand1.map((c, i) => mullTile(c, i >= MULL.kept ? 'new' : 'keep', null)).join('') + '</div>';
  }
  if (MULL.history.length) {
    html += '<div class="sec">履歴</div><div class="hist">' + MULL.history.map(h => '#' + h.n + '（' + (h.first ? '先' : '後') + '）: ' + h.hand0.map((c, i) => ((h.mask >> i) & 1) ? '<s>' + esc(INFO.cards[c].name) + '</s>' : esc(INFO.cards[c].name)).join('、') + ' <b>→</b> <b>' + h.hand1.map(c => esc(INFO.cards[c].name)).join('、') + '</b>').join('<br>') + '</div>';
  }
  v.innerHTML = html;
  q$('mullDeck').onchange = e => { MULL.deckId = e.target.value; MULL.history = []; MULL.count = 0; mullDeal(); mullRender(); drawerRender(); };
  q$('mullFirst').onchange = e => { MULL.first = e.target.value; mullDeal(); mullRender(); };
  q$('mullEdit').onclick = () => openEditor();
  if (q$('mullOk')) q$('mullOk').onclick = mullConfirm;
  if (q$('mullAgain')) q$('mullAgain').onclick = mullAgain;
  v.querySelectorAll('[data-mc]').forEach(el => {
    el.onclick = () => { if (el.dataset.mc !== '') mullToggle(+el.dataset.mc); else showCardPop(INFO.cards[+el.dataset.cid]); };
    el.oncontextmenu = e => { e.preventDefault(); showCardPop(INFO.cards[+el.dataset.cid]); };
  });
  drawerRender();
}

// ---------------- 盤面再現 ----------------
function newSide(me) { return { leader_hp: 20, pp: 4, max_pp: 4, evo_left: 2, sep: 0, epp: 0, shadows: 0, hand: [], board: [] }; }
const SETUP = { first: 0, active: 0, n: 4, decks: [null, null], sides: [newSide(), newSide()] };
const KIND_JP = { follower: 'フォロワー', spell: 'スペル', amulet: 'アミュレット' };

function defaultBoardUnit(c) {
  return { oid: c.official_id, atk: c.atk, hp: c.hp, max_hp: c.hp, evolved: false, super_evolved: false, can_attack: true, attacked: false, countdown: c.countdown || 0, kw: 0 };
}
function setupToEngine() {
  const turn = SETUP.active === SETUP.first ? 2 * SETUP.n - 1 : 2 * SETUP.n;
  const side = s => ({
    leader_hp: s.leader_hp, pp: s.pp, max_pp: s.max_pp, evo_left: s.evo_left, sep: s.sep, epp: s.epp, shadows: s.shadows,
    hand: s.hand.map(h => ({ oid: h.oid, cost: h.cost == null || h.cost === '' ? undefined : +h.cost })),
    board: s.board.map(u => ({ oid: u.oid, atk: u.atk, hp: u.hp, max_hp: u.max_hp, evolved: u.evolved, super_evolved: u.super_evolved, can_attack: u.can_attack, attacked: u.attacked, countdown: cardOf(u.oid).kind === 'amulet' ? u.countdown : undefined, kw: u.kw || 0 })),
  });
  return { first: SETUP.first, active: SETUP.active, turn, sides: [side(SETUP.sides[0]), side(SETUP.sides[1])] };
}
function startFromSetup() {
  const j = setupToEngine();
  const r = APP.game;
  try {
    r.start({ my_deck: SETUP.decks[0], bot_deck: SETUP.decks[1], setup: j, seed: Math.floor(Math.random() * 2 ** 31) });
  } catch (e) { alert(e.message); return; }
  S = r.state(); INS = null; OVHIDE = false;
  setMode('play');
}
function numField(label, path, min, max, w) {
  return '<label class="fld">' + label + ' <input type="number" data-f="' + path + '" min="' + min + '" max="' + max + '" value="' + path.split('.').reduce((o, k) => o[k], SETUP) + '"></label>';
}
function sideHtml(si) {
  const s = SETUP.sides[si], who = si === 0 ? '自分' : '相手', p = 'sides.' + si + '.';
  let h = '<div class="side-ed"><h3>' + who + '</h3>';
  h += numField('リーダー体力', p + 'leader_hp', 1, 99) + numField('PP', p + 'pp', 0, 20) + numField('最大PP', p + 'max_pp', 0, 10) + numField('進化', p + 'evo_left', 0, 2) + numField('超進化', p + 'sep', 0, 2) + numField('エクストラPP', p + 'epp', 0, 1) + numField('墓場', p + 'shadows', 0, 99);
  h += '<div class="sec" style="margin-top:6px">手札（' + s.hand.length + '/9）</div><div class="row" style="align-items:flex-start">';
  h += s.hand.map((x, i) => {
    const c = cardOf(x.oid);
    return '<div class="chipc"><button class="x" data-del="hand:' + si + ':' + i + '">×</button><img data-pop="1" data-oid="' + x.oid + '" src="' + imgUrl(c) + '" alt=""><div class="nm">' + esc(c.name) + '</div><label>コスト <input type="number" min="0" max="20" placeholder="' + c.cost + '" value="' + (x.cost == null ? '' : x.cost) + '" data-hc="' + si + ':' + i + '"></label></div>';
  }).join('');
  h += '<button data-add="hand:' + si + '"' + (s.hand.length >= 9 ? ' disabled' : '') + '>＋ 手札を追加</button></div>';
  h += '<div class="sec">場（' + s.board.length + '/5・フォロワー＋アミュレット）</div><div class="row" style="align-items:flex-start">';
  h += s.board.map((u, i) => {
    const c = cardOf(u.oid), amu = c.kind === 'amulet';
    const nf = (k, w) => '<label>' + w + ' <input type="number" min="' + (k === 'countdown' ? 0 : -9) + '" max="99" value="' + u[k] + '" data-bf="' + si + ':' + i + ':' + k + '"></label>';
    const kwc = (bit, w) => '<label><input type="checkbox" data-bk="' + si + ':' + i + ':' + bit + '"' + (((u.kw || 0) & bit) ? ' checked' : '') + '> ' + w + '</label>';
    const ck = (k, w) => '<label><input type="checkbox" data-bc="' + si + ':' + i + ':' + k + '"' + (u[k] ? ' checked' : '') + '> ' + w + '</label>';
    return '<div class="chipc" style="width:128px"><button class="x" data-del="board:' + si + ':' + i + '">×</button><img data-pop="1" data-oid="' + u.oid + '" src="' + imgUrl(c) + '" alt=""><div class="nm">' + esc(c.name) + (amu ? '（アミュレット）' : '') + '</div>' +
      (amu ? nf('countdown', 'カウント') : nf('atk', '攻撃') + nf('hp', '体力') + nf('max_hp', '最大') + ck('evolved', '進化') + ck('super_evolved', '超進化') + ck('can_attack', '攻撃可') + ck('attacked', '攻撃済') + kwc(1, '守護付与') + kwc(2, '疾走付与') + kwc(4, '突進付与')) +
      '<div class="mv"><button data-mv="' + si + ':' + i + ':-1">◀</button><button data-mv="' + si + ':' + i + ':1">▶</button></div></div>';
  }).join('');
  h += '<button data-add="board:' + si + '"' + (s.board.length >= 5 ? ' disabled' : '') + '>＋ 場に追加</button></div></div>';
  return h;
}
function setupRender() {
  const decks = INFO.decks.filter(d => d.ready);
  if (!SETUP.decks[0]) SETUP.decks = [decks[0].id, decks[0].id];
  const opt = cur => decks.map(d => '<option value="' + esc(d.id) + '"' + (d.id === cur ? ' selected' : '') + '>' + (d.custom ? '★' : '') + INFO.classes[d.class] + '・' + esc(d.name) + '</option>').join('');
  const saved = GM.lsGet(GM.SETUP_KEY, {});
  const names = Object.keys(saved);
  let html = '<div class="row" style="margin-bottom:8px"><b>盤面再現</b><span class="tip">お互いの手札・PP・リーダー体力・場を指定して、その局面から（相手はルールベースボット）遊べます。</span></div>';
  html += '<div class="side-ed" style="margin-bottom:12px"><div class="row">' +
    '<label class="fld">自分のデッキ <select id="sDeck0">' + opt(SETUP.decks[0]) + '</select></label>' +
    '<label class="fld">相手のデッキ <select id="sDeck1">' + opt(SETUP.decks[1]) + '</select></label>' +
    '<label class="fld">先攻 <select id="sFirst"><option value="0"' + (SETUP.first === 0 ? ' selected' : '') + '>自分</option><option value="1"' + (SETUP.first === 1 ? ' selected' : '') + '>相手</option></select></label>' +
    '<label class="fld">手番 <select id="sActive"><option value="0"' + (SETUP.active === 0 ? ' selected' : '') + '>自分</option><option value="1"' + (SETUP.active === 1 ? ' selected' : '') + '>相手</option></select></label>' +
    '<label class="fld">手番の席の <input type="number" data-f="n" min="1" max="30" value="' + SETUP.n + '"> ターン目</label>' +
    '</div><div class="row">' +
    '<button class="gold bigbtn" id="sStart">この盤面で開始</button>' +
    '<select id="sLoad"><option value="">保存した盤面を読み込む…</option>' + names.map(n => '<option>' + esc(n) + '</option>').join('') + '</select>' +
    '<button id="sSave">保存</button><button id="sDel">削除</button><button id="sExport">コードをコピー</button><button id="sImport">コードを貼り付け</button><button id="sReset">初期化</button>' +
    '</div></div>';
  html += '<div class="sgrid">' + sideHtml(1) + sideHtml(0) + '</div>';
  q$('setupView').innerHTML = html;
  const v = q$('setupView');
  v.querySelectorAll('[data-f]').forEach(el => el.onchange = () => {
    const path = el.dataset.f.split('.'); let o = SETUP; for (let k = 0; k < path.length - 1; k++) o = o[path[k]];
    o[path[path.length - 1]] = +el.value;
  });
  q$('sDeck0').onchange = e => { SETUP.decks[0] = e.target.value; drawerRender(); };
  q$('sDeck1').onchange = e => { SETUP.decks[1] = e.target.value; };
  q$('sFirst').onchange = e => { SETUP.first = +e.target.value; };
  q$('sActive').onchange = e => { SETUP.active = +e.target.value; };
  v.querySelectorAll('[data-hc]').forEach(el => el.onchange = () => { const [si, i] = el.dataset.hc.split(':').map(Number); SETUP.sides[si].hand[i].cost = el.value === '' ? null : +el.value; });
  v.querySelectorAll('[data-bf]').forEach(el => el.onchange = () => { const [si, i, k] = el.dataset.bf.split(':'); SETUP.sides[+si].board[+i][k] = +el.value; });
  v.querySelectorAll('[data-bc]').forEach(el => el.onchange = () => {
    const [si, i, k] = el.dataset.bc.split(':'); const u = SETUP.sides[+si].board[+i]; u[k] = el.checked;
    const c = cardOf(u.oid);
    if (k === 'evolved' || k === 'super_evolved') {   // 進化の+2/+2・+3/+3を反映（直接入力で上書き可）
      if (k === 'super_evolved' && el.checked) u.evolved = true;
      if (k === 'evolved' && !el.checked) u.super_evolved = false;
      const bonus = u.super_evolved ? 3 : (u.evolved ? 2 : 0);
      u.atk = c.atk + bonus; u.hp = c.hp + bonus; u.max_hp = c.hp + bonus;
      setupRender();
    }
  });
  v.querySelectorAll('[data-bk]').forEach(el => el.onchange = () => { const [si, i, bit] = el.dataset.bk.split(':').map(Number); const u = SETUP.sides[si].board[i]; u.kw = el.checked ? (u.kw || 0) | bit : (u.kw || 0) & ~bit; });
  v.querySelectorAll('[data-del]').forEach(el => el.onclick = () => { const [w, si, i] = el.dataset.del.split(':'); SETUP.sides[+si][w].splice(+i, 1); setupRender(); drawerRender(); });
  v.querySelectorAll('[data-mv]').forEach(el => el.onclick = () => {
    const [si, i, d] = el.dataset.mv.split(':').map(Number); const b = SETUP.sides[si].board, j = i + d;
    if (j >= 0 && j < b.length) { [b[i], b[j]] = [b[j], b[i]]; setupRender(); }
  });
  v.querySelectorAll('[data-add]').forEach(el => el.onclick = () => {
    const [w, si] = el.dataset.add.split(':'); const s = SETUP.sides[+si];
    openPicker((w === 'hand' ? '手札に追加' : '場に追加') + '（' + (+si === 0 ? '自分' : '相手') + '）', c => {
      if (w === 'hand') { if (s.hand.length < 9) s.hand.push({ oid: c.official_id, cost: null }); }
      else if (c.kind === 'spell') { alert('スペルは場に置けません'); return false; }
      else if (s.board.length < 5) s.board.push(defaultBoardUnit(c));
      setupRender(); drawerRender(); return true;
    }, w === 'board');
  });
  v.querySelectorAll('[data-pop]').forEach(el => { el.oncontextmenu = e => { e.preventDefault(); showCardPop(cardOf(+el.dataset.oid)); }; el.onclick = () => showCardPop(cardOf(+el.dataset.oid)); });
  q$('sStart').onclick = startFromSetup;
  q$('sSave').onclick = () => {
    const name = (prompt('盤面の名前') || '').trim(); if (!name) return;
    const all = GM.lsGet(GM.SETUP_KEY, {}); all[name] = JSON.parse(JSON.stringify(SETUP));
    if (!GM.lsSet(GM.SETUP_KEY, all)) alert('保存できませんでした'); setupRender();
  };
  q$('sLoad').onchange = e => { const all = GM.lsGet(GM.SETUP_KEY, {}); const s = all[e.target.value]; if (s) loadSetup(s); };
  q$('sDel').onclick = () => { const n = q$('sLoad').value; if (!n) { alert('削除する盤面を「読み込む」で選んでください'); return; } if (!confirm('「' + n + '」を削除しますか？')) return; const all = GM.lsGet(GM.SETUP_KEY, {}); delete all[n]; GM.lsSet(GM.SETUP_KEY, all); setupRender(); };
  q$('sExport').onclick = async () => { const t = JSON.stringify(SETUP); try { await navigator.clipboard.writeText(t); alert('盤面のコードをコピーしました'); } catch (e) { prompt('コピーして保存してください', t); } };
  q$('sImport').onclick = () => { const t = prompt('盤面のコードを貼り付け'); if (!t) return; try { loadSetup(JSON.parse(t)); } catch (e) { alert('コードを読み込めません: ' + e.message); } };
  q$('sReset').onclick = () => { if (confirm('盤面を初期化します。よろしいですか？')) { SETUP.sides = [newSide(), newSide()]; SETUP.first = 0; SETUP.active = 0; SETUP.n = 4; setupRender(); drawerRender(); } };
}
function loadSetup(s) {
  const ok = s && s.sides && s.sides.length === 2 && s.sides.every(x => Array.isArray(x.hand) && Array.isArray(x.board) && x.hand.every(h => cardOf(h.oid)) && x.board.every(u => cardOf(u.oid)));
  if (!ok) { alert('盤面のデータが不正です'); return; }
  SETUP.first = s.first | 0; SETUP.active = s.active | 0; SETUP.n = s.n | 0 || 4; SETUP.sides = s.sides;
  if (s.decks && s.decks.every(d => INFO.decks.some(x => x.id === d && x.ready))) SETUP.decks = s.decks;
  setupRender(); drawerRender();
}

// ---------------- カード選択（手札・場への追加） ----------------
let PICK = { cb: null, boardOnly: false };
function openPicker(title, cb, boardOnly) {
  PICK = { cb, boardOnly };
  q$('pickTitle').textContent = title;
  q$('picker').classList.add('on');
  pickRender();
  q$('pickQ').focus();
}
function pickRender() {
  const q = q$('pickQ').value.trim().toLowerCase(), cls = q$('pickClass').value, kind = q$('pickKind').value;
  const tok = q$('pickTok').checked, rot = q$('pickRot').checked;
  let pool = INFO.cards.filter(c => (tok || !c.token) && (!rot || c.rot || c.token) && (cls === '' || c.class === +cls) && (!kind || c.kind === kind)
    && (!PICK.boardOnly || c.kind !== 'spell') && (!q || (c.name + ' ' + c.text).toLowerCase().includes(q)));
  pool.sort((a, b) => a.cost - b.cost || a.official_id - b.official_id);
  const more = pool.length > 240; pool = pool.slice(0, 240);
  q$('pickPool').innerHTML = pool.map(c => '<div class="pk" data-o="' + c.official_id + '" title="' + esc(c.name) + '"><img loading="lazy" src="' + imgUrl(c) + '" alt=""><div class="nm">' + c.cost + ' ' + esc(c.name) + '</div></div>').join('') + (more ? '<div class="tip">表示は240件まで。絞り込んでください。</div>' : '');
  q$('pickPool').querySelectorAll('.pk').forEach(el => {
    el.onclick = () => { const done = PICK.cb(cardOf(+el.dataset.o)); if (done !== false && !q$('pickKeep').checked) q$('picker').classList.remove('on'); };
    el.oncontextmenu = e => { e.preventDefault(); showCardPop(cardOf(+el.dataset.o)); };
  });
}

// ---------------- 初期化 ----------------
function initModes() {
  const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'modes.css'; document.head.appendChild(css);
  const tabs = document.createElement('div'); tabs.className = 'tabs';
  tabs.innerHTML = '<button data-mode="play">対戦</button><button data-mode="mull">マリガン練習</button><button data-mode="setup">盤面再現</button>';
  const top = q$('topbar'); top.insertBefore(tabs, q$('status'));
  tabs.onclick = e => { const b = e.target.closest('button'); if (b) setMode(b.dataset.mode); };
  const mk = (tag, id, cls) => { const e = document.createElement(tag); e.id = id; if (cls) e.className = cls; document.body.appendChild(e); return e; };
  mk('div', 'mullView', 'view'); mk('div', 'setupView', 'view');
  const dr = mk('div', 'drawer'); dr.innerHTML = '<h3 id="drawerTitle">デッキ一覧</h3><div class="tip">クリックでカード詳細</div><div class="list"></div>';
  const tab = mk('button', 'drawerTab'); tab.textContent = 'デッキ ◀'; tab.onclick = () => toggleDrawer();
  mk('div', 'cardpop');
  const pk = mk('div', 'picker');
  pk.innerHTML = '<div class="top"><b id="pickTitle">カードを選ぶ</b><input type="search" id="pickQ" placeholder="カード名・テキスト" size="20"><select id="pickClass"><option value="">全クラス</option>' + INFO.classes.map((n, i) => '<option value="' + i + '">' + n + '</option>').join('') + '</select><select id="pickKind"><option value="">全種別</option><option value="follower">フォロワー</option><option value="spell">スペル</option><option value="amulet">アミュレット</option></select><label><input type="checkbox" id="pickTok" checked> トークンも</label><label><input type="checkbox" id="pickRot"> ローテのみ</label><label><input type="checkbox" id="pickKeep"> 続けて追加</label><button id="pickClose">閉じる</button><span class="tip">クリックで追加 / 右クリックで詳細</span></div><div class="body"><div class="pool" id="pickPool"></div></div>';
  q$('pickClose').onclick = () => pk.classList.remove('on');
  ['pickQ', 'pickClass', 'pickKind', 'pickTok', 'pickRot'].forEach(id => { q$(id).oninput = pickRender; q$(id).onchange = pickRender; });
  drawer_click();
  // 既存の render にドロワー更新を足す
  const baseRender = render; render = function () { baseRender(); if (MODE === 'play') drawerRender(); };
  const baseFill = fillDeckSelects;
  fillDeckSelects = function () { baseFill(); if (MODE === 'mull') mullRender(); if (MODE === 'setup') setupRender(); };
  const ready = INFO.decks.filter(d => d.ready);
  MULL.deckId = (ready.find(d => d.id === 'b:0') || ready[0]).id;
  SETUP.decks = [MULL.deckId, MULL.deckId];
  document.addEventListener('keydown', e => {
    if (e.target.matches('input,select,textarea')) return;
    if (MODE === 'mull') {
      if (e.key === 'Enter') { e.preventDefault(); if (MULL.phase === 'choose') mullConfirm(); else if (MULL.phase === 'result') mullAgain(); }
    }
  });
  setMode('mull');   // 最初はマリガン練習
}
function drawer_click() {
  q$('drawer').addEventListener('click', e => { const r = e.target.closest('.dr'); if (r) showCardPop(cardOf(+r.dataset.oid)); });
}

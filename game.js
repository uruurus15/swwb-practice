// 対戦の進行・表示用の状態づくり（train/play_web.py と labels.py の移植）。サーバーは無く、全部ブラウザの中で動く。
(function (root) {
  const KW_NAMES = [[1, '守護'], [2, '疾走'], [4, '突進'], [8, '必殺'], [16, 'ドレイン'], [32, 'バリア'], [64, '潜伏'], [128, 'オーラ']];
  const CLASS_NAMES = ['中立', 'エルフ', 'ロイヤル', 'ウィッチ', 'ドラゴン', 'ナイトメア', 'ビショップ', 'ネメシス'];
  const call = o => root.SWWB.call(o);
  const kwNames = bits => KW_NAMES.filter(([b]) => bits & b).map(([, n]) => n);

  // ---------------- デッキの保存（ブラウザの localStorage） ----------------
  const LS_KEY = 'swwb.practice.decks.v1';
  const SETUP_KEY = 'swwb.practice.setups.v1';
  function lsGet(k, d) { try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : d; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }

  class DeckStore {
    constructor() { this.builtin = call({ op: 'decks' }); this.custom = lsGet(LS_KEY, []); }
    listing() {
      const out = this.builtin.map((d, i) => ({ id: 'b:' + i, name: d.name, class: d.class, ready: d.ready, rot: d.rot !== false, custom: false, cards: d.cards }));
      for (const d of this.custom) {
        const why = call({ op: 'check_deck', class: d.class, cards: d.cards });
        out.push({ id: 'c:' + d.name, name: d.name, class: d.class, ready: why === null, reason: why, custom: true, cards: d.cards });
      }
      return out;
    }
    resolve(id) {
      const d = this.listing().find(x => x.id === id);
      if (!d) throw new Error('デッキ ' + id + ' が見つかりません');
      if (!d.ready) throw new Error('デッキ「' + d.name + '」は使えません: ' + (d.reason || '未実装のカードを含みます'));
      return d;
    }
    save(name, cls, cards) {
      name = (name || '').trim();
      if (!name || name.length > 40) throw new Error('デッキ名は1〜40文字で入力してください');
      if (this.builtin.some(d => d.name === name)) throw new Error('組み込みデッキと同じ名前は使えません（別名で保存してください）');
      const clean = cards.filter(([, n]) => n > 0).map(([o, n]) => [+o, +n]).sort((a, b) => a[0] - b[0]);
      if (!(cls >= 0 && cls <= 7) || clean.some(([, n]) => n > 3)) throw new Error('デッキの内容が不正です');
      this.custom = this.custom.filter(d => d.name !== name).concat([{ name, class: +cls, cards: clean }]);
      if (!lsSet(LS_KEY, this.custom)) throw new Error('ブラウザに保存できませんでした（プライベートモードなど）');
    }
    remove(name) { this.custom = this.custom.filter(d => d.name !== name); lsSet(LS_KEY, this.custom); }
  }

  // ---------------- 行動の説明（labels.py） ----------------
  class Labeler {
    constructor(cards) { this.cards = cards; }
    cname(cid) { return this.cards[cid].name; }
    label(obs, a) {
      const p = obs.pending, hand = obs.my_hand, board = obs.my_board, opp = obs.opp_board;
      if (a === 0) return { 4: 'マリガン確定', 6: '融合を確定' }[p] || 'ターン終了';
      if (a >= 33 && a <= 41) return this.cname(hand[a - 33]) + ' に融合する';
      if (a >= 1 && a <= 9) {
        const i = a - 1;
        if (p === 6) return '融合素材: ' + this.cname(hand[i]) + ' を切替' + (((obs.mull_mask >> i) & 1) ? '（外す）' : '');
        if (p === 4) return 'マリガン: ' + this.cname(hand[i]) + ' を入れ替え切替' + (((obs.mull_mask >> i) & 1) ? '（戻す）' : '');
        if (p === 3) return 'モード ' + (i + 1) + ' を選ぶ';
        if (p === 5) return i === 0 ? '進化する' : '超進化する';
        return this.cname(hand[i]) + ' をプレイ（コスト' + obs.my_hand_cost[i] + '）';
      }
      if (a >= 10 && a <= 14) { const u = board[a - 10]; return u[8] ? this.cname(u[0]) + ' のアクト' : this.cname(u[0]) + ' で攻撃'; }
      if (a >= 15 && a <= 19) return this.cname(board[a - 15][0]) + ' を進化/超進化';
      if (a >= 20 && a <= 24) return '対象: 味方 ' + this.cname(board[a - 20][0]);
      if (a >= 25 && a <= 29) return '対象: 敵 ' + this.cname(opp[a - 25][0]);
      if (a === 30) return '対象: 敵リーダー';
      if (a === 31) return p === 0 ? (obs.my_epp_active ? 'エクストラPPを取りやめ' : 'エクストラPPを発動（PP+1）') : '対象: 自分のリーダー';
      return p === 6 ? '融合をやめる' : 'キャンセル';
    }
  }

  // ---------------- 対戦 ----------------
  class Game {
    constructor(cards, decks) {
      this.cards = cards; this.decks = decks; this.labeler = new Labeler(cards);
      this.log = []; this.history = []; this.bot = 'heuristic'; this.human = 0; this.started = false;
    }
    obs(seat) { return call({ op: 'observe', seat }); }
    cname(c) { return this.cards[c].name; }

    /** opts: {my_deck, bot_deck, first (true/false/null), seed, setup, bot} */
    start(opts) {
      const mine = this.decks.resolve(opts.my_deck), theirs = this.decks.resolve(opts.bot_deck || opts.my_deck);
      let seed = opts.seed != null ? opts.seed : Math.floor(Math.random() * 2 ** 31);
      const base = { op: 'reset', class0: mine.class, cards0: mine.cards, class1: theirs.class, cards1: theirs.cards };
      if (opts.setup) call({ ...base, seed, setup: opts.setup });
      else {
        // 先攻・後攻は席のシードで決まるので、希望に合うシードを探す
        for (let k = 0; k < 64; k++) {
          call({ ...base, seed });
          if (opts.first == null || this.obs(0).going_first === !!opts.first) break;
          seed = (seed + 1) % 2 ** 31;
        }
      }
      this.myDeckId = opts.my_deck;
      this.fromSetup = opts.setup ? { my_deck: opts.my_deck, bot_deck: opts.bot_deck, setup: opts.setup } : null;   // 「同じ盤面からもう一度」用
      this.seed = seed; this.human = 0; this.history = []; this.started = true;
      this.bot = opts.bot || 'heuristic';
      const o = this.obs(0);
      this.log = ['新しいゲーム' + (opts.setup ? '（盤面再現）' : '（シード ' + seed + '）') + '。あなたは' + (opts.setup ? '' : (o.going_first ? '先攻' : '後攻') + '（') + mine.name + (opts.setup ? '' : '）') + '、相手: ルールベースボット（' + theirs.name + '）'];
      this.runBot();
    }

    runBot() {
      let guard = 0;
      let o = this.obs(0);
      while (!o.finished && !o.is_active && guard++ < 5000) {
        const a = call({ op: 'bot', kind: this.bot === 'random' ? 1 : 2 }).id;
        this.log.push('相手: ' + this.labeler.label(this.obs(1), a));
        call({ op: 'step', id: a });
        o = this.obs(0);
      }
      if (o.finished) this.log.push(o.result === 0 ? '引き分け' : (o.result > 0 ? 'あなたの勝ち！' : 'あなたの負け…'));
    }

    act(a) {
      const o = this.obs(0);
      if (o.finished || !o.is_active) throw new Error('今は操作できません');
      if (!o.legal_mask[a]) throw new Error('その操作はできません');
      this.log.push('あなた: ' + this.labeler.label(o, a));
      call({ op: 'snap' });
      this.history.push(this.log.length - 1);
      if (this.history.length > 400) this.history.shift();
      call({ op: 'step', id: a });
      this.runBot();
    }

    undo() {
      if (!this.history.length) throw new Error('戻せる操作がありません');
      call({ op: 'restore' });
      this.log.length = this.history.pop();
      this.log.push('（一手戻した）');
    }

    unit(u) {
      return { card: u[0], name: this.cname(u[0]), atk: u[1], hp: u[2], max_hp: u[3], kw: kwNames(u[4]), evolved: u[5], attacks: u[6], summoned: u[7], amulet: u[8], super: u[9], countdown: u[10] };
    }

    state() {
      const o = this.obs(0);
      const mine = o.is_active && !o.finished;
      const actions = [];
      if (mine) o.legal_mask.forEach((ok, a) => { if (ok) actions.push({ id: a, label: this.labeler.label(o, a) }); });
      const hand = o.my_hand.map((c, i) => ({
        card: c, name: this.cname(c), cost: o.my_hand_cost[i], pay: o.my_hand_pay[i], enhanced: o.my_hand_enhanced[i],
        kw: kwNames(o.my_hand_kw[i]), marked: !!((o.mull_mask >> i) & 1),
      }));
      return {
        turn: o.turn, mine, finished: o.finished, result: o.result, pending: o.pending,
        pending_card: o.pending_card >= 0 ? this.cname(o.pending_card) : null,
        my: { hp: o.my_leader_hp, pp: o.my_pp, max_pp: o.my_max_pp, evo: o.my_evo_left, sep: o.my_sep, epp: o.my_epp, epp_active: o.my_epp_active, faith: o.my_faith, deck: o.my_deck_size, crests: o.my_crests, can_evolve: o.my_can_evolve_now, going_first: o.going_first, class: o.my_class },
        opp: { hp: o.opp_leader_hp, max_pp: o.opp_max_pp, evo: o.opp_evo_left, sep: o.opp_sep, hand: o.opp_hand_size, deck: o.opp_deck_size, crests: o.opp_crests, class: o.opp_class },
        hand, my_board: o.my_board.map(u => this.unit(u)), opp_board: o.opp_board.map(u => this.unit(u)),
        my_grave: o.my_grave.map(c => this.cname(c)), opp_grave: o.opp_grave.map(c => this.cname(c)),
        deck_counts: o.my_deck_counts,
        actions, log: this.log.slice(-60), bot: this.bot === 'random' ? 'ランダムボット' : 'ルールベースボット', can_undo: this.history.length > 0,
      };
    }
  }

  // ---------------- 既存UIが使う「サーバーAPI」の代わり ----------------
  function makeApi(cards) {
    const decks = new DeckStore();
    const game = new Game(cards, decks);
    const info = () => ({ cards, bots: ['heuristic', 'random'], decks: decks.listing(), classes: CLASS_NAMES });
    async function api(path, body) {
      try {
        if (path.startsWith('/api/info')) return info();
        if (path.startsWith('/api/state')) return game.started ? game.state() : null;
        if (path.startsWith('/api/act')) { game.act(+body.id); return game.state(); }
        if (path.startsWith('/api/undo')) { game.undo(); return game.state(); }
        if (path.startsWith('/api/new')) {
          game.start({ my_deck: body.my_deck, bot_deck: body.bot_deck, first: body.first, bot: body.bot, seed: body.seed });
          return game.state();
        }
        if (path.startsWith('/api/start')) { game.start(body); return game.state(); }
        if (path.startsWith('/api/deck/save')) { decks.save(body.name, body.class, body.cards); return { decks: decks.listing() }; }
        if (path.startsWith('/api/deck/delete')) { decks.remove(body.name); return { decks: decks.listing() }; }
        return { error: 'unknown api ' + path };
      } catch (e) { return { error: e.message }; }
    }
    return { api, game, decks, info };
  }

  root.SWWBGame = { makeApi, Game, DeckStore, Labeler, KW_NAMES, CLASS_NAMES, kwNames, lsGet, lsSet, SETUP_KEY };
  if (typeof module !== 'undefined') module.exports = root.SWWBGame;
})(typeof window !== 'undefined' ? window : globalThis);

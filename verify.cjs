// verify.js — 렌더 체크 + 기능 구동 테스트 하네스
// 사용: node verify.js poker-tracker.jsx
const fs = require("fs");
const babel = require("@babel/core");
const React = require("react");
const TestRenderer = require("react-test-renderer");
const { act } = TestRenderer;

global.IS_REACT_ACT_ENVIRONMENT = true;
const file = process.argv[2] || "poker-tracker.jsx";
const src = fs.readFileSync(file, "utf8");

// ── 브라우저 전역 목 ─────────────────────────────────────────────
function makeLocalStorage(seed = {}) {
  const store = { ...seed };
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { for (const k in store) delete store[k]; },
    _store: store,
  };
}
function installGlobals(seed) {
  const listeners = {};
  const win = {
    localStorage: makeLocalStorage(seed),
    addEventListener: (t, fn) => { (listeners[t] ||= []).push(fn); },
    removeEventListener: (t, fn) => {
      if (listeners[t]) listeners[t] = listeners[t].filter((f) => f !== fn);
    },
    confirm: () => true,
    _dispatch: (t, ev) => { (listeners[t] || []).forEach((fn) => fn(ev)); },
  };
  global.window = win;
  global.localStorage = win.localStorage;
  global.navigator = { clipboard: { writeText: () => Promise.resolve() } };
  global.document = {
    body: { appendChild: () => {}, removeChild: () => {} },
    createElement: () => ({ style: {}, focus: () => {}, select: () => {}, setSelectionRange: () => {}, value: "" }),
    execCommand: () => true,
  };
  global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  return win;
}

// ── JSX 트랜스파일 → 컴포넌트 평가 ───────────────────────────────
function loadComponent(source) {
  // import / export default 제거
  let code = source
    .replace(/^import\s+React[^\n]*\n/m, "")
    .replace(/export\s+default\s+function\s+PokerTracker/, "function PokerTracker");
  const out = babel.transform(code, {
    presets: [["@babel/preset-env", { targets: { node: "current" }, modules: "commonjs" }], "@babel/preset-react"],
    filename: "poker-tracker.jsx",
  }).code;
  // 트랜스파일 후 반환문 부착 (babel은 top-level return 거부)
  const body = out + "\nreturn PokerTracker;\n";
  const { useState, useEffect, useCallback } = React;
  const factory = new Function("React", "useState", "useEffect", "useCallback", body);
  return factory(React, useState, useEffect, useCallback);
}

// 내부 순수함수/컴포넌트를 꺼내오는 로더 (유닛 테스트용)
function loadInternals(source) {
  let code = source
    .replace(/^import\s+React[^\n]*\n/m, "")
    .replace(/export\s+default\s+function\s+PokerTracker/, "function PokerTracker");
  const out = babel.transform(code, {
    presets: [["@babel/preset-env", { targets: { node: "current" }, modules: "commonjs" }], "@babel/preset-react"],
    filename: "poker-tracker.jsx",
  }).code;
  const body = out + "\nreturn { handToText, cardsToText, streetsOf, GAME_TYPES, CardPickerModal, processPreflopEntries, streetIsDraw, handAtStreet, computeSortedActionable, computeNextToAct, drawCount, drawInfoText, parseCard, cardIsSuited, score5, scoreBest, computeEquity, getActionLabel, studAllCards, studUpCards, studCardAt };\n";
  const { useState, useEffect, useCallback } = React;
  const factory = new Function("React", "useState", "useEffect", "useCallback", body);
  return factory(React, useState, useEffect, useCallback);
}


function flattenText(node) {
  if (node == null || node === false) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join("");
  if (node.children) return flattenText(node.children);
  return "";
}
function nodeText(testInstance) {
  // testInstance.children 재귀 텍스트
  try {
    const collect = (inst) => {
      let t = "";
      for (const c of inst.children || []) {
        if (typeof c === "string") t += c;
        else if (c && c.children) t += collect(c);
      }
      return t;
    };
    return collect(testInstance);
  } catch { return ""; }
}
// onClick prop을 가진, 주어진 텍스트를 포함하는 첫 버튼 클릭
function clickByText(root, substr) {
  const buttons = root.findAll(
    (n) => n.props && typeof n.props.onClick === "function",
    { deep: true }
  );
  for (const b of buttons) {
    const txt = nodeText(b);
    if (txt.includes(substr)) {
      act(() => { b.props.onClick({ stopPropagation() {}, preventDefault() {} }); });
      return txt;
    }
  }
  throw new Error(`clickByText: '${substr}' 버튼 못 찾음`);
}

// ══════════════════════════════════════════════════════════════════
const results = [];
function check(name, fn) {
  try { fn(); results.push(["PASS", name, ""]); }
  catch (e) { results.push(["FAIL", name, e.message]); }
}

// ── 1) 렌더 체크 (게임별) ────────────────────────────────────────
for (const gt of ["holdem", "plo4", "td27", "tdA5", "badugi", "sd27"]) {
  check(`render:${gt}`, () => {
    installGlobals({ pt_gametype: JSON.stringify(gt) });
    const Comp = loadComponent(src);
    let r;
    act(() => { r = TestRenderer.create(React.createElement(Comp)); });
    if (!r.toJSON()) throw new Error("빈 렌더");
    r.unmount();
  });
}

// 4명 좌석 + 버튼 시드로 드로우 게임 진행 검증
// ── 헤즈업 라운드 완료 헬퍼 (다음버튼이 '라운드 완료 시에만' 보이므로 실제로 완료시킴) ──
function _clickRank(root, rank) {
  const b = root.findAll(
    (n) => n.props && typeof n.props.onClick === "function" && nodeText(n) === rank + rank,
    { deep: true }
  );
  if (!b.length) throw new Error(`랭크 ${rank} 버튼 없음`);
  act(() => { b[0].props.onClick({ stopPropagation() {} }); });
}
function _kbd(root, key) {
  act(() => { window._dispatch("keydown", { key, target: { tagName: "DIV" }, preventDefault() {}, stopPropagation() {} }); });
}
function _dealCurrent(root, cardCount, ranks) {
  // 프리플랍 현재 액터 딜 카드 입력 (이미 있으면/버튼 없으면 스킵)
  const deal = root.findAll(
    (n) => n.props && typeof n.props.title === "string" && n.props.title.startsWith("딜 카드 입력/수정") && typeof n.props.onClick === "function",
    { deep: true }
  );
  if (!deal.length) return false;
  act(() => { deal[0].props.onClick({ stopPropagation() {} }); });
  ranks.slice(0, cardCount).forEach((rk) => _clickRank(root, rk));
  _kbd(root, "Enter");
  return true;
}
function _clickAction(root, label) {
  const b = root.findAll(
    (n) => n.props && typeof n.props.onClick === "function" && !n.props.disabled && nodeText(n).trim().startsWith(label),
    { deep: true }
  );
  if (!b.length) return false;
  act(() => { b[0].props.onClick({ stopPropagation() {} }); });
  return true;
}
function _advanceNode(root) {
  return root.findAll(
    (n) => n.props && typeof n.props.onClick === "function" && /로 이동|WINNER 선택|SHOWDOWN/.test(nodeText(n)),
    { deep: true }
  )[0] || null;
}
// 헤즈업으로 현재 스트리트 라운드 완료 (프리플랍=딜+OPEN/CALL, 그 외=CHECK/CHECK)
function completeRoundHU(root, isPreflop, cardCount) {
  const ranks = [["A", "K", "Q", "J", "T"], ["9", "8", "7", "6", "5"]];
  for (let step = 0; step < 2; step++) {
    if (_advanceNode(root)) return;
    if (isPreflop) {
      _dealCurrent(root, cardCount, ranks[step]);
      if (!_clickAction(root, step === 0 ? "OPEN" : "CALL")) _clickAction(root, "CHECK");
    } else {
      if (!_clickAction(root, "CHECK")) _clickAction(root, "CALL");
    }
  }
}
// 라운드 완료 후 다음/위너 버튼 클릭
function advanceStreetHU(root, isPreflop, cardCount) {
  completeRoundHU(root, isPreflop, cardCount);
  const adv = _advanceNode(root);
  if (!adv) throw new Error("진행 버튼이 안 나타남 (라운드 미완료)");
  act(() => { adv.props.onClick({ stopPropagation() {} }); });
}
const _CARD_COUNT = { holdem: 2, plo4: 4, plo5: 5, plo6: 6, td27: 5, tdA5: 5, badugi: 4, sd27: 5 };

function drawProgressionTest(gt, expectedSeq, lastLabel) {
  const seats = Array.from({ length: 9 }, (_, i) => ({
    id: i, name: i < 2 ? `P${i}` : "", position: "", active: i < 2, out: false, outCount: 0,
  }));
  installGlobals({
    pt_gametype: JSON.stringify(gt),
    pt_seats: JSON.stringify(seats),
    pt_button: JSON.stringify(0),
  });
  const Comp = loadComponent(src);
  let r;
  act(() => { r = TestRenderer.create(React.createElement(Comp)); });
  const root = r.root;
  const cardCount = _CARD_COUNT[gt] || 2;

  clickByText(root, "NEW HAND");

  const streetNow = () => {
    const labels = root.findAll(
      (n) => n.props && n.props.style && n.props.style.color === "#f59e0b"
        && n.props.style.fontSize === 14 && n.props.style.fontWeight === 900,
      { deep: true }
    );
    return labels.length ? nodeText(labels[0]) : "(없음)";
  };

  for (let i = 0; i < expectedSeq.length; i++) {
    const cur = streetNow();
    if (cur !== expectedSeq[i]) {
      throw new Error(`${gt} step${i}: 기대 ${expectedSeq[i]}, 실제 ${cur}`);
    }
    completeRoundHU(root, i === 0, cardCount); // 라운드 완료 → 진행 버튼 등장
    const adv = _advanceNode(root);
    if (i < expectedSeq.length - 1) {
      if (!adv) throw new Error(`${gt} step${i}: 진행 버튼 안 나타남(라운드 미완료)`);
      act(() => { adv.props.onClick({ stopPropagation() {} }); });
    } else {
      if (!adv || !nodeText(adv).includes(lastLabel)) {
        throw new Error(`${gt}: 마지막 라벨 '${lastLabel}' 버튼 없음 (adv=${adv ? nodeText(adv) : "null"})`);
      }
    }
  }
  r.unmount();
}

// ── 2) 드로우 구동 테스트 ────────────────────────────────────────
check("td27: Pre→Draw1→Draw2→Draw3 진행", () => {
  drawProgressionTest("td27", ["PREFLOP", "DRAW1", "DRAW2", "DRAW3"], "WINNER");
});
check("sd27: Pre→Draw1 진행", () => {
  drawProgressionTest("sd27", ["PREFLOP", "DRAW1"], "WINNER");
});
check("badugi: Pre→Draw1→Draw2→Draw3 진행", () => {
  drawProgressionTest("badugi", ["PREFLOP", "DRAW1", "DRAW2", "DRAW3"], "WINNER");
});

// ── 3) 비드로우 회귀: holdem Pre→Flop→Turn→River ─────────────────
check("holdem: Pre→Flop→Turn→River 진행", () => {
  drawProgressionTest("holdem", ["PREFLOP", "FLOP", "TURN", "RIVER"], "WINNER");
});

// ── 4) handToText 드로우 베팅줄 핸드 표시 (유닛) ─────────────────
check("handToText: td27 PREFLOP 베팅줄에 5장 핸드 표시", () => {
  installGlobals({});
  const I = loadInternals(src);
  const hand = {
    gameType: "td27",
    streetList: ["PREFLOP", "DRAW1", "DRAW2", "DRAW3"],
    seats: [
      { id: 0, name: "AA", position: "UTG" },
      { id: 1, name: "BB", position: "BB" },
    ],
    cardCount: 5,
    holeCards: {
      0: ["2x", "3x", "4x", "5x", "6x"],
      1: ["4x", "7x", "8x", "Qx", "Jx"],
    },
    board: [null, null, null, null, null],
    streets: {
      PREFLOP: [
        { seatId: 0, playerName: "AA", position: "UTG", action: "open", amountText: null },
        { seatId: 1, playerName: "BB", position: "BB", action: "call", amountText: null },
      ],
      DRAW1: [], DRAW2: [], DRAW3: [],
    },
    winnerName: "AA",
  };
  const txt = I.handToText(hand);
  // cardsToText는 랭크 내림차순 정렬 → 23456→65432, 478QJ→QJ874
  if (!/Pre:/.test(txt)) throw new Error("Pre 줄 없음:\n" + txt);
  if (!txt.includes("65432")) throw new Error("UTG 5장 미표시:\n" + txt);
  if (!txt.includes("QJ874")) throw new Error("BB 5장 미표시:\n" + txt);
  if (!/UTG AA 65432 OPEN/.test(txt)) throw new Error("프리플랍 첫 액션 포맷 불일치:\n" + txt);
  if (!txt.includes("Winner: AA")) throw new Error("위너 줄 없음:\n" + txt);
});

check("handToText: badugi 4장 핸드 표시", () => {
  installGlobals({});
  const I = loadInternals(src);
  const hand = {
    gameType: "badugi",
    streetList: ["PREFLOP", "DRAW1", "DRAW2", "DRAW3"],
    seats: [{ id: 0, name: "X", position: "UTG" }, { id: 1, name: "Y", position: "BB" }],
    cardCount: 4,
    holeCards: { 0: ["Ax", "2x", "3x", "4x"], 1: ["Kx", "Kx", "5x", "6x"] },
    board: [null, null, null, null, null],
    streets: {
      PREFLOP: [
        { seatId: 0, playerName: "X", position: "UTG", action: "open" },
        { seatId: 1, playerName: "Y", position: "BB", action: "fold" },
      ],
      DRAW1: [], DRAW2: [], DRAW3: [],
    },
    winnerName: "X",
  };
  const txt = I.handToText(hand);
  if (!txt.includes("A432")) throw new Error("UTG 4장(정렬 A432) 미표시:\n" + txt);
});

check("handToText: holdem 보드 = 맨 위 한 줄(구분자)", () => {
  installGlobals({});
  const I = loadInternals(src);
  const hand = {
    gameType: "holdem",
    streetList: ["PREFLOP", "FLOP", "TURN", "RIVER"],
    seats: [{ id: 0, name: "X", position: "UTG" }, { id: 1, name: "Y", position: "BB" }],
    cardCount: 2,
    holeCards: { 0: ["Ax", "Kx"], 1: ["Qx", "Qx"] },
    board: ["2x", "7x", "Tx", "9x", "3x"],
    streets: {
      PREFLOP: [
        { seatId: 0, playerName: "X", position: "UTG", action: "open" },
        { seatId: 1, playerName: "Y", position: "BB", action: "call" },
      ],
      FLOP: [{ seatId: 1, playerName: "Y", position: "BB", action: "check" }],
      TURN: [], RIVER: [],
    },
    winnerName: "X",
  };
  const txt = I.handToText(hand);
  const L = txt.split("\n");
  // 0번째 = 이벤트명, 1번째 = 보드 한 줄(플랍 | 턴 | 리버)
  if (L[0] !== "[ No-Limit Hold'em ]") throw new Error("이벤트명이 맨 위가 아님:\n" + txt);
  if (L[1] !== "Board: 2 7 T | 9 | 3") throw new Error("보드 한 줄(구분자) 불일치:\n" + txt);
  if (/Flop: .*2 7 T/.test(txt)) throw new Error("스트리트 줄에 보드가 남아있음:\n" + txt);
  if (!txt.includes("AK")) throw new Error("홀카드 미표시:\n" + txt);
});

check("handToText: 부분 보드(플랍만)도 맨 위 한 줄", () => {
  installGlobals({});
  const I = loadInternals(src);
  const hand = {
    gameType: "holdem", streetList: ["PREFLOP", "FLOP", "TURN", "RIVER"],
    seats: [{ id: 0, name: "X", position: "UTG" }, { id: 1, name: "Y", position: "BB" }],
    cardCount: 2, holeCards: { 0: ["Ax", "Kx"], 1: ["Qx", "Jx"] },
    board: ["2x", "7x", "Tx", null, null],
    streets: {
      PREFLOP: [{ seatId: 0, playerName: "X", position: "UTG", action: "open" }, { seatId: 1, playerName: "Y", position: "BB", action: "call" }],
      FLOP: [{ seatId: 1, playerName: "Y", position: "BB", action: "check" }], TURN: [], RIVER: [],
    },
    winnerName: "X",
  };
  const txt = I.handToText(hand);
  const L = txt.split("\n");
  if (!L[1].startsWith("Board: 2 7 T")) throw new Error("부분 보드 한 줄 불일치:\n" + txt);
  if (/\| /.test(L[1])) throw new Error("미입력 턴/리버에 구분자가 생김:\n" + L[1]);
});

// ── 5) 딜 카드 입력 UI: NEW HAND 후 홀카드 슬롯 수 = cards ────────
function dealSlotCountTest(gt, expectCount) {
  const seats = Array.from({ length: 9 }, (_, i) => ({
    id: i, name: i < 3 ? `P${i}` : "", position: "", active: i < 3, out: false, outCount: 0,
  }));
  installGlobals({
    pt_gametype: JSON.stringify(gt),
    pt_seats: JSON.stringify(seats),
    pt_button: JSON.stringify(0),
  });
  const Comp = loadComponent(src);
  let r;
  act(() => { r = TestRenderer.create(React.createElement(Comp)); });
  const root = r.root;
  clickByText(root, "NEW HAND");
  // NEXT TO ACT 패널의 점선 홀카드 슬롯(border 1.5px dashed #fbbf24) 개수
  const slots = root.findAll(
    (n) => n.props && n.props.style && n.props.style.border === "1.5px dashed #fbbf24",
    { deep: true }
  );
  if (slots.length !== expectCount) {
    throw new Error(`${gt}: 딜 슬롯 ${expectCount} 기대, 실제 ${slots.length}`);
  }
  r.unmount();
}
check("딜 슬롯: td27 = 5장", () => dealSlotCountTest("td27", 5));
check("딜 슬롯: badugi = 4장", () => dealSlotCountTest("badugi", 4));
check("딜 슬롯: holdem = 2장", () => dealSlotCountTest("holdem", 2));

check("ALIVE 행: 임의 플레이어 +카드 탭 → 5장 피커 오픈 (td27)", () => {
  const seats = Array.from({ length: 9 }, (_, i) => ({
    id: i, name: i < 3 ? `P${i}` : "", position: "", active: i < 3, out: false, outCount: 0,
  }));
  installGlobals({
    pt_gametype: JSON.stringify("td27"),
    pt_seats: JSON.stringify(seats),
    pt_button: JSON.stringify(0),
  });
  const Comp = loadComponent(src);
  let r;
  act(() => { r = TestRenderer.create(React.createElement(Comp)); });
  const root = r.root;
  clickByText(root, "NEW HAND");
  // 피커는 아직 닫힘 (카드 선택 텍스트 없음)
  if (nodeText(root).includes("카드 선택 · 랭크")) throw new Error("시작부터 피커 열림");
  // ALIVE 행의 +카드 버튼 클릭
  clickByText(root, "+카드");
  const after = nodeText(root);
  if (!after.includes("카드 선택 · 랭크")) throw new Error("탭 후 피커 안 열림");
  if (!after.includes("5장")) throw new Error("피커가 5장 모드 아님: " + after.slice(0, 120));
  r.unmount();
});

// ── 6) 드로우 헬퍼 (유닛) ────────────────────────────────────────
function mkDrawHand(over = {}) {
  return Object.assign({
    gameType: "td27",
    streetList: ["PREFLOP", "DRAW1", "DRAW2", "DRAW3"],
    seats: [
      { id: 0, name: "A", position: "SB" },
      { id: 1, name: "B", position: "BB" },
      { id: 2, name: "C", position: "D" },
    ],
    cardCount: 5,
    holeCards: {
      0: ["2x", "3x", "4x", "5x", "9x"],
      1: ["7x", "8x", "Tx", "Jx", "Qx"],
      2: ["Ax", "Kx", "2x", "6x", "9x"],
    },
    roundHole: {},
    draws: {},
    streets: { PREFLOP: [], DRAW1: [], DRAW2: [], DRAW3: [] },
  }, over);
}

check("streetIsDraw: PREFLOP=false, DRAW1+=true (td27), holdem=false", () => {
  installGlobals({});
  const I = loadInternals(src);
  const h = mkDrawHand();
  if (I.streetIsDraw(h, 0)) throw new Error("PREFLOP은 드로우 아님");
  if (!I.streetIsDraw(h, 1)) throw new Error("DRAW1은 드로우여야");
  const hold = mkDrawHand({ gameType: "holdem", streetList: ["PREFLOP", "FLOP", "TURN", "RIVER"] });
  if (I.streetIsDraw(hold, 1)) throw new Error("홀덤 FLOP은 드로우 아님");
});

check("handAtStreet: 스냅샷 없으면 딜, 있으면 최신 스냅샷", () => {
  installGlobals({});
  const I = loadInternals(src);
  const h = mkDrawHand({ roundHole: { DRAW1: { 0: ["2x", "3x", "4x", "5x", "7x"] } } });
  // DRAW1 시점 seat0 = 스냅샷, seat1 = 딜(스냅샷 없음)
  if (I.cardsToText(I.handAtStreet(h, 0, 1)) !== "75432") throw new Error("seat0 DRAW1 스냅샷 불일치: " + I.cardsToText(I.handAtStreet(h, 0, 1)));
  if (I.cardsToText(I.handAtStreet(h, 1, 1)) !== I.cardsToText(h.holeCards[1])) throw new Error("seat1은 딜 핸드여야");
  // DRAW2 시점 seat0 = 여전히 DRAW1 스냅샷(최신)
  if (I.cardsToText(I.handAtStreet(h, 0, 2)) !== "75432") throw new Error("seat0 DRAW2 시점도 DRAW1 스냅샷이어야");
});

check("drawCount: 바뀐 카드 수 (멀티셋 차)", () => {
  installGlobals({});
  const I = loadInternals(src);
  // Q9652 → J9875: 유지 9,5 / 바뀜 Q,6,2→J,8,7 = 3장
  const n = I.drawCount(["Qx", "9x", "6x", "5x", "2x"], ["Jx", "9x", "8x", "7x", "5x"]);
  if (n !== 3) throw new Error("3장이어야: " + n);
  // 동일 핸드 → 0 (PAT)
  if (I.drawCount(["Ax", "Kx", "8x", "7x", "6x"], ["Ax", "Kx", "8x", "7x", "6x"]) !== 0) throw new Error("같으면 0");
  // prev 없으면 채워진 장수
  if (I.drawCount(null, ["Ax", "Kx", "?", "?", "?"]) !== 2) throw new Error("prev없음=채워진수(2)");
});

check("drawInfoText: PAT/ND (이전 라운드 대비)", () => {
  installGlobals({});
  const I = loadInternals(src);
  const h = mkDrawHand({
    holeCards: { 0: ["Q?", "9?", "6?", "5?", "2?"].map(x => x[0] + "x") },
    roundHole: { DRAW1: { 0: ["Jx", "9x", "8x", "7x", "5x"] } },
  });
  // DRAW1 seat0: 딜 Q9652 → J9875 = 3D
  if (I.drawInfoText(h, 0, 1) !== "D3") throw new Error("D3 기대: " + I.drawInfoText(h, 0, 1));
  // seat1: DRAW1 스냅샷 없음 → 딜과 동일 → PAT
  if (I.drawInfoText(h, 1, 1) !== "PAT") throw new Error("PAT 기대: " + I.drawInfoText(h, 1, 1));
  // 비드로우 스트리트(0) → 빈 문자열
  if (I.drawInfoText(h, 0, 0) !== "") throw new Error("PREFLOP은 빈 문자열");
});


// ── 7) handToText 드로우 분기 (유닛, 신규 인라인 포맷) ───────────
check("handToText 드로우: 첫액션 '이름 교환수 핸드 액션', 이후 '이름 액션'", () => {
  installGlobals({});
  const I = loadInternals(src);
  // 사용자 예시 재현: ㄹ Q9652→J9875, ㅇ AK876 PAT
  const hand = {
    gameType: "td27",
    streetList: ["PREFLOP", "DRAW1", "DRAW2", "DRAW3"],
    seats: [{ id: 0, name: "ㄹ", position: "UTG" }, { id: 1, name: "ㅇ", position: "D" }],
    cardCount: 5,
    holeCards: {
      0: ["Qx", "9x", "6x", "5x", "2x"],
      1: ["Ax", "Kx", "8x", "7x", "6x"],
    },
    roundHole: {
      DRAW1: {
        0: ["Jx", "9x", "8x", "7x", "5x"], // ㄹ: Q,6,2 → J,8,7 = 3D, J9875
        // ㅇ: 스냅샷 없음 → PAT, AK876 유지
      },
    },
    board: [null, null, null, null, null],
    streets: {
      PREFLOP: [
        { seatId: 0, playerName: "ㄹ", position: "UTG", action: "open" },
        { seatId: 1, playerName: "ㅇ", position: "D", action: "call" },
      ],
      DRAW1: [
        { seatId: 0, playerName: "ㄹ", position: "UTG", action: "check" },
        { seatId: 1, playerName: "ㅇ", position: "D", action: "bet" },
        { seatId: 0, playerName: "ㄹ", position: "UTG", action: "raise" },
        { seatId: 1, playerName: "ㅇ", position: "D", action: "fold" },
      ],
      DRAW2: [], DRAW3: [],
    },
    winnerName: "ㄹ", winnerSeatId: 0,
  };
  const txt = I.handToText(hand);
  // 프리: 포지션+이름+딜핸드
  if (!/Pre: UTG ㄹ Q9652 OPEN \/ D ㅇ AK876 CALL/.test(txt)) throw new Error("Pre 줄 불일치:\n" + txt);
  // 드로우: 한 줄, 첫액션=이름+교환수+핸드, 이후=이름+액션
  if (!txt.includes("Draw 1: ㄹ D3 J9875 CHECK / ㅇ PAT AK876 BET / ㄹ RAISE / ㅇ FOLD")) {
    throw new Error("드로우 줄 불일치:\n" + txt);
  }
  // Winner 최종핸드
  if (!txt.includes("Winner: ㄹ J9875")) throw new Error("위너 최종핸드 불일치:\n" + txt);
});

check("handToText 드로우: 안 바꾼 플레이어는 PAT", () => {
  installGlobals({});
  const I = loadInternals(src);
  const hand = {
    gameType: "td27", streetList: ["PREFLOP", "DRAW1", "DRAW2", "DRAW3"],
    seats: [{ id: 0, name: "A", position: "SB" }, { id: 1, name: "B", position: "BB" }],
    cardCount: 5,
    holeCards: { 0: ["7x", "5x", "4x", "3x", "2x"], 1: ["8x", "7x", "6x", "5x", "4x"] },
    roundHole: { DRAW1: { 1: ["8x", "7x", "6x", "5x", "2x"] } }, // B만 1장 교환, A는 PAT
    board: [null, null, null, null, null],
    streets: {
      PREFLOP: [{ seatId: 0, playerName: "A", position: "SB", action: "open" }, { seatId: 1, playerName: "B", position: "BB", action: "call" }],
      DRAW1: [{ seatId: 0, playerName: "A", position: "SB", action: "check" }, { seatId: 1, playerName: "B", position: "BB", action: "check" }],
      DRAW2: [], DRAW3: [],
    },
    winnerName: "A", winnerSeatId: 0,
  };
  const txt = I.handToText(hand);
  if (!txt.includes("Draw 1: A PAT 75432 CHECK / B D1 87652 CHECK")) throw new Error("PAT/1D 불일치:\n" + txt);
});

check("화면 인라인 로그: 드로우 첫액션에 교환수+핸드 표시 (td27)", () => {
  const seats = Array.from({ length: 9 }, (_, i) => ({
    id: i, name: i < 2 ? `P${i}` : "", position: "", active: i < 2, out: false, outCount: 0,
  }));
  installGlobals({
    pt_gametype: JSON.stringify("td27"),
    pt_seats: JSON.stringify(seats),
    pt_button: JSON.stringify(0),
  });
  const Comp = loadComponent(src);
  let r;
  act(() => { r = TestRenderer.create(React.createElement(Comp)); });
  const root = r.root;
  clickByText(root, "NEW HAND");
  advanceStreetHU(root, true, 5); // → DRAW1 (베팅 페이즈 바로 시작, 드로우 페이즈 없음)
  // 드로우 페이즈 패널이 없어야 함
  if (nodeText(root).includes("· 교환")) throw new Error("드로우 페이즈 패널이 아직 있음");
  // NEXT TO ACT 베팅 패널이 바로 떠야
  if (!nodeText(root).includes("NEXT TO ACT")) throw new Error("DRAW1에서 베팅 패널 바로 안 뜸");
  r.unmount();
});


// ── 8) 쇼다운 핸드 입력 + 풀 스모크 ──────────────────────────────
function reachShowdown(root) {
  clickByText(root, "NEW HAND");
  advanceStreetHU(root, true, 5);   // Pre → Draw1 (딜 + OPEN/CALL)
  advanceStreetHU(root, false, 5);  // Draw1 → Draw2 (CHECK/CHECK)
  advanceStreetHU(root, false, 5);  // Draw2 → Draw3
  advanceStreetHU(root, false, 5);  // Draw3 → 쇼다운(WINNER 선택 클릭)
}

check("쇼다운: +핸드 탭 → 최종핸드 피커 5장 오픈 (td27)", () => {
  const seats = Array.from({ length: 9 }, (_, i) => ({
    id: i, name: i < 2 ? `P${i}` : "", position: "", active: i < 2, out: false, outCount: 0,
  }));
  installGlobals({
    pt_gametype: JSON.stringify("td27"),
    pt_seats: JSON.stringify(seats),
    pt_button: JSON.stringify(0),
  });
  const Comp = loadComponent(src);
  let r;
  act(() => { r = TestRenderer.create(React.createElement(Comp)); });
  const root = r.root;
  reachShowdown(root);
  if (!nodeText(root).includes("WINNER 선택")) throw new Error("쇼다운(위너 선택) 화면 안 뜸");
  // 최종핸드 입력 엔트리(title) 클릭 — 핸드가 채워져 있어도 동일 엔트리
  const hl = root.findAll(
    (n) => n.props && n.props.title === "쇼다운 핸드 입력/수정" && typeof n.props.onClick === "function",
    { deep: true }
  );
  if (!hl.length) throw new Error("쇼다운 핸드 입력 엔트리 못 찾음");
  act(() => { hl[0].props.onClick({ stopPropagation() {}, preventDefault() {} }); });
  const after = nodeText(root);
  if (!after.includes("카드 선택 · 랭크")) throw new Error("쇼다운 핸드 피커 안 열림");
  if (!after.includes("5장")) throw new Error("쇼다운 피커 5장 모드 아님");
  r.unmount();
});

check("풀 스모크: td27 NEW HAND→드로우3→쇼다운→위너확정→리캡 (Winner줄)", () => {
  const seats = Array.from({ length: 9 }, (_, i) => ({
    id: i, name: i < 2 ? `P${i}` : "", position: "", active: i < 2, out: false, outCount: 0,
  }));
  installGlobals({
    pt_gametype: JSON.stringify("td27"),
    pt_seats: JSON.stringify(seats),
    pt_button: JSON.stringify(0),
  });
  const Comp = loadComponent(src);
  let r;
  act(() => { r = TestRenderer.create(React.createElement(Comp)); });
  const root = r.root;
  reachShowdown(root);
  // 키보드로 위너 선택: '1' 토글 → enter 확정
  const ev = (key) => ({ key, target: { tagName: "DIV" }, preventDefault() {}, stopPropagation() {} });
  act(() => { window._dispatch("keydown", ev("1")); });
  act(() => { window._dispatch("keydown", ev("Enter")); });
  const after = nodeText(root);
  if (!after.includes("Winner:")) throw new Error("리캡에 Winner 줄 미표시: " + after.slice(0, 120));
  r.unmount();
});

check("언제든 수정: DRAW1 베팅 페이즈에서 핸드 칩 탭 → 5장 입력 → 스냅샷 반영 (td27)", () => {
  const seats = Array.from({ length: 9 }, (_, i) => ({
    id: i, name: i < 2 ? `P${i}` : "", position: "", active: i < 2, out: false, outCount: 0,
  }));
  installGlobals({
    pt_gametype: JSON.stringify("td27"),
    pt_seats: JSON.stringify(seats),
    pt_button: JSON.stringify(0),
  });
  const Comp = loadComponent(src);
  let r;
  act(() => { r = TestRenderer.create(React.createElement(Comp)); });
  const root = r.root;
  clickByText(root, "NEW HAND");
  advanceStreetHU(root, true, 5); // → DRAW1 (드로우 페이즈 없음, 바로 베팅)
  // ALIVE 행 핸드 칩(이 라운드 핸드 입력/수정) 탭
  const editBtns = root.findAll(
    (n) => n.props && typeof n.props.onClick === "function"
      && n.props.title === "이 라운드 핸드 입력/수정",
    { deep: true }
  );
  if (!editBtns.length) throw new Error("드로우 베팅 페이즈에서 핸드 수정 버튼 없음");
  act(() => { editBtns[0].props.onClick({ stopPropagation() {} }); });
  if (!nodeText(root).includes("5장")) throw new Error("편집 피커 5장 모드 아님");
  // 랭크 7,8,9,T,J 입력 후 Enter
  const clickRank = (rank) => {
    const b = root.findAll(
      (n) => n.props && typeof n.props.onClick === "function" && nodeText(n) === rank + rank,
      { deep: true }
    );
    if (!b.length) throw new Error(`랭크 ${rank} 없음`);
    act(() => { b[0].props.onClick({ stopPropagation() {} }); });
  };
  // 프리플랍 딜로 P1=98765 가 이미 있음 → 편집 피커는 그 핸드로 열림.
  // 채워진 슬롯에선 0번 슬롯만 덮어써지므로 마지막 입력(J)이 반영 → [J,8,7,6,5]
  ["7", "8", "9", "T", "J"].forEach(clickRank);
  act(() => { window._dispatch("keydown", { key: "Enter", target: { tagName: "DIV" }, preventDefault() {}, stopPropagation() {} }); });
  const after = nodeText(root);
  if (!after.includes("J8765")) throw new Error("수정한 핸드(J8765) 스냅샷 미반영: " + after.slice(0, 160));
  r.unmount();
});

check("크래시 가드: 스트리트 키 누락 저장핸드 있어도 렌더 OK", () => {
  // gameType td27인데 streets에 DRAW2/DRAW3 키 누락 (구버전/손상 데이터)
  const badHand = {
    id: 1, number: 1, gameType: "td27",
    streetList: ["PREFLOP", "DRAW1", "DRAW2", "DRAW3"],
    seats: [{ id: 0, name: "A", position: "SB" }, { id: 1, name: "B", position: "BB" }],
    cardCount: 5, holeCards: {}, roundHole: {}, board: [null, null, null, null, null],
    streets: { PREFLOP: [{ seatId: 0, playerName: "A", position: "SB", action: "open" }] }, // DRAW* 키 없음
    winnerName: "A",
  };
  installGlobals({
    pt_gametype: JSON.stringify("td27"),
    pt_hands: JSON.stringify([badHand]),
  });
  const Comp = loadComponent(src);
  let r;
  act(() => { r = TestRenderer.create(React.createElement(Comp)); });
  if (!r.toJSON()) throw new Error("빈 렌더");
  // LOG 탭 → 저장 핸드 펼치기(HandLog 경로) 크래시 없어야
  clickByText(r.root, "LOG");
  const btns = r.root.findAll(n => n.props && typeof n.props.onClick === "function" && nodeText(n).includes("HAND #1"), { deep: true });
  if (btns.length) act(() => { btns[0].props.onClick({ stopPropagation() {} }); });
  r.unmount();
});

check("handToText 홀덤: 보드 미입력 시 ? ? ? 없이 라벨+액션 한 줄", () => {
  installGlobals({});
  const I = loadInternals(src);
  const hand = {
    gameType: "holdem", streetList: ["PREFLOP", "FLOP", "TURN", "RIVER"],
    seats: [{ id: 0, name: "ㄴ", position: "UTG" }, { id: 1, name: "ㅁ", position: "D" }],
    cardCount: 2,
    holeCards: { 0: ["Qx", "9x"], 1: ["Qx", "Qx"] },
    board: [null, null, null, null, null], // 보드 미입력
    streets: {
      PREFLOP: [{ seatId: 0, playerName: "ㄴ", position: "UTG", action: "open" }, { seatId: 1, playerName: "ㅁ", position: "D", action: "raise" }, { seatId: 0, playerName: "ㄴ", position: "UTG", action: "call" }],
      FLOP: [{ seatId: 0, playerName: "ㄴ", position: "UTG", action: "bet" }, { seatId: 1, playerName: "ㅁ", position: "D", action: "call" }],
      TURN: [{ seatId: 0, playerName: "ㄴ", position: "UTG", action: "bet" }, { seatId: 1, playerName: "ㅁ", position: "D", action: "fold" }],
      RIVER: [],
    },
    winnerName: "ㄴ", winnerSeatId: 0,
  };
  const txt = I.handToText(hand);
  if (txt.includes("?")) throw new Error("보드 미입력인데 ? 표시됨:\n" + txt);
  if (!/Flop: Q9 BET \/ QQ CALL/.test(txt)) throw new Error("Flop 라벨+액션 한 줄 아님:\n" + txt);
  if (!/Turn: Q9 BET \/ QQ FOLD/.test(txt)) throw new Error("Turn 라벨+액션 한 줄 아님:\n" + txt);
});

check("히스토리 카드: 저장된 드로우 핸드 펼치면 D라벨/PAT + Winner 핸드 표시", () => {
  const C = s => s.split("").map(x => x + "x");
  const drawHand = {
    id: 1, number: 1, gameType: "td27",
    streetList: ["PREFLOP", "DRAW1", "DRAW2", "DRAW3"],
    seats: [{ id: 0, name: "ㄹ", position: "UTG" }, { id: 1, name: "ㅇ", position: "D" }],
    cardCount: 5,
    holeCards: { 0: C("Q9652"), 1: C("AK876") },
    roundHole: { DRAW1: { 0: C("J9875") } },
    board: [null, null, null, null, null],
    streets: {
      PREFLOP: [{ seatId: 0, playerName: "ㄹ", position: "UTG", action: "open" }, { seatId: 1, playerName: "ㅇ", position: "D", action: "call" }],
      DRAW1: [{ seatId: 0, playerName: "ㄹ", position: "UTG", action: "check" }, { seatId: 1, playerName: "ㅇ", position: "D", action: "bet" }],
      DRAW2: [], DRAW3: [],
    },
    winnerName: "ㄹ", winnerSeatId: 0,
  };
  installGlobals({ pt_gametype: JSON.stringify("td27"), pt_hands: JSON.stringify([drawHand]) });
  const Comp = loadComponent(src);
  let r;
  act(() => { r = TestRenderer.create(React.createElement(Comp)); });
  const root = r.root;
  clickByText(root, "LOG"); // 히스토리 탭으로 전환
  // 펼치기: HAND #1 헤더 버튼 클릭
  const toggles = root.findAll(n => n.props && typeof n.props.onClick === "function" && nodeText(n).includes("HAND #1"), { deep: true });
  if (!toggles.length) throw new Error("펼치기 버튼 없음");
  act(() => { toggles[0].props.onClick({ stopPropagation() {} }); });
  const txt = nodeText(root);
  if (!txt.includes("D3")) throw new Error("드로우 라벨 D3 미표시:\n" + txt.slice(0, 200));
  if (!txt.includes("PAT")) throw new Error("PAT 미표시(ㅇ는 스냅샷 없음=PAT)");
  if (!txt.includes("J9875")) throw new Error("Winner 최종핸드(J9875) 미표시");
  r.unmount();
});

check("handToText: 턴에서 끝나도 River 등 모든 스트리트 항상 표시", () => {
  installGlobals({});
  const I = loadInternals(src);
  const C = s => s.split("").map(x => x + "x");
  const hand = {
    gameType: "holdem", streetList: ["PREFLOP", "FLOP", "TURN", "RIVER"],
    seats: [{ id: 0, name: "ㅇ", position: "D" }, { id: 1, name: "ㄹ", position: "BB" }],
    cardCount: 2, holeCards: { 0: C("QQ"), 1: C("K6") },
    board: [null, null, null, null, null],
    streets: {
      PREFLOP: [{ seatId: 0, playerName: "ㅇ", position: "D", action: "open" }, { seatId: 1, playerName: "ㄹ", position: "BB", action: "call" }],
      FLOP: [{ seatId: 1, playerName: "ㄹ", position: "BB", action: "check" }, { seatId: 0, playerName: "ㅇ", position: "D", action: "bet" }, { seatId: 1, playerName: "ㄹ", position: "BB", action: "call" }],
      TURN: [{ seatId: 1, playerName: "ㄹ", position: "BB", action: "check" }, { seatId: 0, playerName: "ㅇ", position: "D", action: "bet" }, { seatId: 1, playerName: "ㄹ", position: "BB", action: "fold" }],
      RIVER: [],
    },
    winnerName: "ㅇ", winnerSeatId: 0,
  };
  const txt = I.handToText(hand);
  if (!/\bRiver:/.test(txt)) throw new Error("River 라벨 항상 표시돼야:\n" + txt);
  // 빈 스트리트는 라벨만 (뒤에 공백/내용 없음)
  if (!/River:\s*(\n|$)/.test(txt)) throw new Error("빈 River는 라벨만:\n" + JSON.stringify(txt));
});

check("평가기: 족보 순서 (스플러시>포카드>풀하우스>플러시>스트레이트>트립>투페어>페어>하이)", () => {
  installGlobals({});
  const I = loadInternals(src);
  const P = arr => arr.map(I.parseCard);
  const sc = arr => I.scoreBest(P(arr));
  const sf = sc(["9h", "8h", "7h", "6h", "5h"]);
  const quads = sc(["9h", "9d", "9c", "9s", "5h"]);
  const fh = sc(["9h", "9d", "9c", "5s", "5h"]);
  const flush = sc(["Ah", "Jh", "8h", "5h", "2h"]);
  const straight = sc(["9h", "8d", "7c", "6h", "5s"]);
  const trips = sc(["9h", "9d", "9c", "Ks", "2h"]);
  const twoPair = sc(["9h", "9d", "5c", "5s", "Kh"]);
  const pair = sc(["9h", "9d", "Kc", "7s", "2h"]);
  const high = sc(["Ah", "Jd", "8c", "5s", "2h"]);
  const order = [sf, quads, fh, flush, straight, trips, twoPair, pair, high];
  for (let i = 0; i < order.length - 1; i++) {
    if (!(order[i] > order[i + 1])) throw new Error(`순서 위반 idx${i}: ${order[i]} <= ${order[i + 1]}`);
  }
});

check("평가기: 휠(A-5) 스트레이트 < 6하이 스트레이트, 스트레이트 성립", () => {
  installGlobals({});
  const I = loadInternals(src);
  const P = arr => arr.map(I.parseCard);
  const wheel = I.scoreBest(P(["Ah", "5d", "4c", "3s", "2h"]));
  const six = I.scoreBest(P(["6h", "5d", "4c", "3s", "2h"]));
  const pairAces = I.scoreBest(P(["Ah", "Ad", "9c", "5s", "2h"]));
  if (!(wheel > pairAces)) throw new Error("휠은 스트레이트라 원페어보다 강해야");
  if (!(six > wheel)) throw new Error("6하이 스트레이트 > 휠이어야");
});

check("평가기: 플러시 동점은 높은 카드로 결정 + 7장 중 best5 선택", () => {
  installGlobals({});
  const I = loadInternals(src);
  const P = arr => arr.map(I.parseCard);
  const aFlush = I.scoreBest(P(["Ah", "Kh", "8h", "5h", "2h"]));
  const kFlush = I.scoreBest(P(["Kh", "Qh", "8h", "5h", "2h"]));
  if (!(aFlush > kFlush)) throw new Error("A하이 플러시 > K하이 플러시");
  // 7장: 보드3 + 홀2 중 플러시 5장을 골라야
  const seven = I.scoreBest(P(["Ah", "Kh", "Qh", "Jh", "9h", "2s", "3d"]));
  const justFlush = I.scoreBest(P(["Ah", "Kh", "Qh", "9h", "2h"]));
  if (seven < justFlush) throw new Error("7장 평가가 5장보다 약하면 안 됨");
});

check("equity 리버: 완성 보드 단순 승/무", () => {
  installGlobals({});
  const I = loadInternals(src);
  // P1 AA, P2 KK, 보드 무관 → P1 100%
  let r = I.computeEquity(
    [{ seatId: 0, cards: ["Ah", "Ad"] }, { seatId: 1, cards: ["Ks", "Kc"] }],
    ["2c", "7d", "9s", "Th", "Jc"]
  );
  if (!r.ok) throw new Error("ok=false: " + r.reason);
  if (Math.abs(r.players[0].equity - 1) > 1e-9) throw new Error("P1 100% 아님: " + r.players[0].equity);
  // 같은 스트레이트 → 스플릿
  r = I.computeEquity(
    [{ seatId: 0, cards: ["Ah", "Kh"] }, { seatId: 1, cards: ["As", "Ks"] }],
    ["Qc", "Jd", "Th", "2c", "3d"]
  );
  if (Math.abs(r.players[0].equity - 0.5) > 1e-9) throw new Error("스플릿 0.5 아님: " + r.players[0].equity);
  if (Math.abs(r.players[0].tie - 1) > 1e-9) throw new Error("tie 1.0 아님");
});

check("equity 플랍/턴: 완전열거 정확", () => {
  installGlobals({});
  const I = loadInternals(src);
  // AA vs KK, 플랍 2 7 9 레인보우 → AA 압도(>85%)
  const flop = I.computeEquity(
    [{ seatId: 0, cards: ["Ah", "Ad"] }, { seatId: 1, cards: ["Ks", "Kc"] }],
    ["2c", "7d", "9s"]
  );
  if (!flop.exact) throw new Error("플랍은 완전열거여야");
  if (!(flop.players[0].equity > 0.85)) throw new Error("AA 플랍 equity>0.85 기대: " + flop.players[0].equity);
  // 턴까지 → 여전히 완전열거, AA 더 우세
  const turn = I.computeEquity(
    [{ seatId: 0, cards: ["Ah", "Ad"] }, { seatId: 1, cards: ["Ks", "Kc"] }],
    ["2c", "7d", "9s", "Th"]
  );
  if (!turn.exact) throw new Error("턴은 완전열거여야");
  if (!(turn.players[0].equity > 0.9)) throw new Error("AA 턴 equity>0.9 기대: " + turn.players[0].equity);
});

check("equity 프리플랍: AA vs KK ≈ 82% (몬테카를로)", () => {
  installGlobals({});
  const I = loadInternals(src);
  const r = I.computeEquity(
    [{ seatId: 0, cards: ["Ah", "Ad"] }, { seatId: 1, cards: ["Ks", "Kc"] }],
    [],
    { samples: 40000 }
  );
  if (r.exact) throw new Error("프리플랍은 MC여야");
  const e = r.players[0].equity;
  if (e < 0.78 || e > 0.86) throw new Error("AA vs KK equity 78~86% 벗어남: " + e);
});

check("equity 검증 실패: 문양미정/중복/인원부족", () => {
  installGlobals({});
  const I = loadInternals(src);
  // 문양 미정(Ax)
  if (I.computeEquity([{ seatId: 0, cards: ["Ax", "Kx"] }, { seatId: 1, cards: ["Qh", "Qd"] }], []).ok)
    throw new Error("문양 미정인데 ok=true");
  // 중복 카드
  if (I.computeEquity([{ seatId: 0, cards: ["Ah", "Kd"] }, { seatId: 1, cards: ["Ah", "Qd"] }], []).ok)
    throw new Error("중복인데 ok=true");
  // 1명
  if (I.computeEquity([{ seatId: 0, cards: ["Ah", "Kd"] }], []).ok)
    throw new Error("1명인데 ok=true");
});

check("승률 UI: 활성 홀덤 핸드에 '승률 계산' 버튼 노출 (드로우게임엔 없음)", () => {
  const mk = (gt) => {
    const seats = Array.from({ length: 9 }, (_, i) => ({
      id: i, name: i < 2 ? `P${i}` : "", position: "", active: i < 2, out: false, outCount: 0,
    }));
    installGlobals({ pt_gametype: JSON.stringify(gt), pt_seats: JSON.stringify(seats), pt_button: JSON.stringify(0) });
    const Comp = loadComponent(src);
    let r; act(() => { r = TestRenderer.create(React.createElement(Comp)); });
    clickByText(r.root, "NEW HAND");
    const txt = nodeText(r.root);
    r.unmount();
    return txt;
  };
  if (!mk("holdem").includes("📊 승률")) throw new Error("홀덤 활성 핸드에 승률 패널 없음");
  if (mk("td27").includes("📊 승률")) throw new Error("드로우 게임엔 승률 패널 없어야");
});

check("equity 플랍: 셋(55) vs 오버페어(JJ) on 4-5-6 → 셋 압도", () => {
  installGlobals({});
  const I = loadInternals(src);
  const r = I.computeEquity(
    [{ seatId: 0, cards: ["5d", "5s"] }, { seatId: 1, cards: ["Jd", "Jh"] }],
    ["4s", "5h", "6c"]
  );
  if (!r.ok) throw new Error("ok=false: " + r.reason);
  if (!r.exact) throw new Error("플랍은 완전열거여야");
  const set55 = r.players.find(p => p.seatId === 0).equity;
  if (!(set55 > 0.85)) throw new Error("55 셋 equity>0.85 기대(프리플랍 오계산이면 ~0.2): " + set55);
});

check("handToText: 프리플랍 후속 액션은 카드 우선 (이름 아님)", () => {
  installGlobals({});
  const I = loadInternals(src);
  const hand = {
    gameType: "holdem",
    streetList: ["PREFLOP", "FLOP", "TURN", "RIVER"],
    seats: [{ id: 0, name: "Dd", position: "D" }, { id: 1, name: "Bb", position: "BB" }],
    cardCount: 2,
    holeCards: { 0: ["Ax", "Qx"], 1: ["Kx", "Jx"] },
    board: [null, null, null, null, null],
    streets: {
      PREFLOP: [
        { seatId: 0, playerName: "Dd", position: "D", action: "open", amountText: null },
        { seatId: 1, playerName: "Bb", position: "BB", action: "raise", amountText: null },
        { seatId: 0, playerName: "Dd", position: "D", action: "call", amountText: null },
      ],
      FLOP: [], TURN: [], RIVER: [],
    },
    winnerName: "Dd",
  };
  const txt = I.handToText(hand);
  if (!/AQ CALL/.test(txt)) throw new Error("프리플랍 후속이 카드 우선 아님:\n" + txt);
  if (/Dd CALL/.test(txt)) throw new Error("프리플랍 후속이 이름 우선으로 나옴:\n" + txt);
});

check("되돌리기: 빈 플랍에서 누르면 프리플랍으로 복귀 (스트리트 되돌리기)", () => {
  const seats = Array.from({ length: 9 }, (_, i) => ({
    id: i, name: i < 2 ? `P${i}` : "", position: "", active: i < 2, out: false, outCount: 0,
  }));
  installGlobals({ pt_gametype: JSON.stringify("holdem"), pt_seats: JSON.stringify(seats), pt_button: JSON.stringify(0) });
  const Comp = loadComponent(src);
  let r;
  act(() => { r = TestRenderer.create(React.createElement(Comp)); });
  const root = r.root;
  clickByText(root, "NEW HAND");
  advanceStreetHU(root, true, 2); // 프리플랍 완료 → 플랍
  const streetNow = () => {
    const l = root.findAll((n) => n.props && n.props.style && n.props.style.color === "#f59e0b"
      && n.props.style.fontSize === 14 && n.props.style.fontWeight === 900, { deep: true });
    return l.length ? nodeText(l[0]) : "(없음)";
  };
  if (streetNow() !== "FLOP") throw new Error("플랍 진입 실패: " + streetNow());
  const undo = root.findAll((n) => n.props && typeof n.props.onClick === "function" && nodeText(n).trim() === "↶", { deep: true });
  if (!undo.length) throw new Error("되돌리기 버튼(↶) 없음");
  act(() => { undo[0].props.onClick({ stopPropagation() {} }); });
  if (streetNow() !== "PREFLOP") throw new Error("스트리트 되돌리기 실패(프리플랍 복귀 안 됨): " + streetNow());
  // 프리플랍 액션은 남아있어야 (OPEN 배지)
  if (!/OPEN/.test(nodeText(root))) throw new Error("프리플랍 액션이 사라짐");
  r.unmount();
});

check("JSX 누수 가드: 활성 핸드 화면에 코드 텍스트(})()/);})가 안 보임", () => {
  const seats = Array.from({ length: 9 }, (_, i) => ({
    id: i, name: i < 2 ? `P${i}` : "", position: "", active: i < 2, out: false, outCount: 0,
  }));
  installGlobals({ pt_gametype: JSON.stringify("holdem"), pt_seats: JSON.stringify(seats), pt_button: JSON.stringify(0) });
  const Comp = loadComponent(src);
  let r;
  act(() => { r = TestRenderer.create(React.createElement(Comp)); });
  const root = r.root;
  clickByText(root, "NEW HAND");
  const txt = nodeText(root);
  if (/\}\)\(\)/.test(txt) || /\);\s*\}\)/.test(txt)) throw new Error("렌더에 JSX 닫기 코드가 텍스트로 새어나옴: " + txt.slice(0, 80));
  r.unmount();
});

check("N-BET: 올인을 레이즈로 카운트 (OPEN→ALL-IN→RAISE = 4-BET) + ALL-IN CALL 라벨", () => {
  installGlobals({});
  const I = loadInternals(src);
  const hand = {
    gameType: "holdem", streetList: ["PREFLOP", "FLOP", "TURN", "RIVER"],
    seats: [{ id: 0, name: "김", position: "CO" }, { id: 1, name: "이", position: "BTN" }, { id: 2, name: "박", position: "SB" }],
    cardCount: 2, holeCards: { 0: ["Ax", "Kx"], 1: ["Qx", "Qx"], 2: ["Jx", "Jx"] },
    board: [null, null, null, null, null],
    streets: {
      PREFLOP: [
        { seatId: 0, playerName: "김", position: "CO", action: "open" },
        { seatId: 1, playerName: "이", position: "BTN", action: "allin" },
        { seatId: 2, playerName: "박", position: "SB", action: "raise" },
        { seatId: 0, playerName: "김", position: "CO", action: "allincall", amountText: "120K" },
      ], FLOP: [], TURN: [], RIVER: [],
    },
    winnerName: "이", winnerSeatId: 1,
  };
  const txt = I.handToText(hand);
  if (!/4-BET/.test(txt)) throw new Error("올인 후 레이즈가 4-BET이 아님:\n" + txt);
  if (!/ALL-IN CALL 120K/.test(txt)) throw new Error("ALL-IN CALL 금액 표시 누락:\n" + txt);
});

check("ALL-IN CALL: 액션불가에서 제외(생존은 유지)", () => {
  installGlobals({});
  const I = loadInternals(src);
  const hand = {
    gameType: "holdem", streetList: ["PREFLOP", "FLOP", "TURN", "RIVER"],
    seats: [{ id: 0, name: "A", position: "BB" }, { id: 1, name: "B", position: "BTN" }, { id: 2, name: "C", position: "SB" }],
    cardCount: 2, holeCards: { 0: ["Ax", "Kx"], 1: ["Qx", "Jx"], 2: ["Tx", "9x"] },
    board: ["2x", "7x", "Tx", null, null],
    streets: {
      PREFLOP: [], 
      FLOP: [
        { seatId: 1, playerName: "B", position: "BTN", action: "bet" },
        { seatId: 0, playerName: "A", position: "BB", action: "allincall" },
      ], TURN: [], RIVER: [],
    },
  };
  const act = I.computeSortedActionable(hand, 1).map(s => s.id);
  if (act.includes(0)) throw new Error("ALL-IN CALL한 seat0이 아직 액션가능으로 잡힘: " + act);
  if (!act.includes(1)) throw new Error("베팅한 seat1은 액션가능이어야: " + act);
});

check("도움말: ? 버튼 → 사용 설명서 모달 표시", () => {
  installGlobals({});
  const Comp = loadComponent(src);
  let r;
  act(() => { r = TestRenderer.create(React.createElement(Comp)); });
  const root = r.root;
  if (nodeText(root).includes("사용 설명서")) throw new Error("열기 전부터 설명서가 보임");
  clickByText(root, "?");
  if (!nodeText(root).includes("사용 설명서")) throw new Error("? 클릭 후 설명서 안 뜸");
  if (!nodeText(root).includes("한 핸드 기록")) throw new Error("설명서 본문 누락");
  clickByText(root, "닫기 ✕");
  if (nodeText(root).includes("사용 설명서")) throw new Error("닫기 후에도 설명서가 남음");
  r.unmount();
});

check("카드창: Enter로 확정/닫힘 (딜 입력 경로)", () => {
  const seats = Array.from({ length: 9 }, (_, i) => ({
    id: i, name: i < 2 ? `P${i}` : "", position: "", active: i < 2, out: false, outCount: 0,
  }));
  installGlobals({ pt_gametype: JSON.stringify("holdem"), pt_seats: JSON.stringify(seats), pt_button: JSON.stringify(0) });
  const Comp = loadComponent(src);
  let r;
  act(() => { r = TestRenderer.create(React.createElement(Comp)); });
  const root = r.root;
  clickByText(root, "NEW HAND");
  const deal = root.findAll(n => n.props && n.props.title === "딜 카드 입력/수정" && typeof n.props.onClick === "function", { deep: true });
  if (!deal.length) throw new Error("딜 카드 입력 버튼 없음");
  act(() => { deal[0].props.onClick({ stopPropagation() {} }); });
  if (!nodeText(root).includes("카드 선택")) throw new Error("피커가 안 열림");
  act(() => { window._dispatch("keydown", { key: "Enter", target: { tagName: "DIV" }, preventDefault() {}, stopPropagation() {} }); });
  if (nodeText(root).includes("카드 선택")) throw new Error("Enter 눌러도 피커가 안 닫힘(엔터 무효)");
  r.unmount();
});

check("참가자 목록: 버튼 → 앉은 사람 이름 표시", () => {
  const seats = Array.from({ length: 9 }, (_, i) => ({
    id: i, name: i < 3 ? ["앨리스", "밥", "찰리"][i] : "", position: "", active: i < 3, out: false, outCount: 0,
  }));
  installGlobals({ pt_gametype: JSON.stringify("holdem"), pt_seats: JSON.stringify(seats), pt_button: JSON.stringify(0) });
  const Comp = loadComponent(src);
  let r;
  act(() => { r = TestRenderer.create(React.createElement(Comp)); });
  const root = r.root;
  clickByText(root, "👥 참가자 3");
  const t = nodeText(root);
  if (!t.includes("앨리스") || !t.includes("밥") || !t.includes("찰리")) throw new Error("참가자 이름 누락: " + t.slice(0, 120));
  clickByText(root, "닫기 ✕");
  r.unmount();
});

check("handToText: 7-Stud 업카드 누적 + BRING-IN + Winner 7장 (studCards)", () => {
  installGlobals({});
  const I = loadInternals(src);
  const hand = {
    gameType: "stud7",
    streetList: ["3RD","4TH","5TH","6TH","7TH"],
    seats: [{ id: 0, name: "김", position: "#1" }, { id: 1, name: "이", position: "#2" }],
    cardCount: 2,
    // studCards: 0,1=3rd다운 2=3rd업 3=4th업 4=5th업 5=6th업 6=7th다운
    studCards: {
      0: ["Ax","Kx","Ks","2d",null,null,"7c"],
      1: ["Qx","Jx","Ah","Qs",null,null,null],
    },
    board: [null,null,null,null,null],
    roundHole: {},
    streets: {
      "3RD": [
        { seatId: 1, playerName: "이", position: "#2", action: "bringin", amountText: "5K" },
        { seatId: 0, playerName: "김", position: "#1", action: "complete", amountText: "15K" },
        { seatId: 1, playerName: "이", position: "#2", action: "call" },
      ],
      "4TH": [
        { seatId: 1, playerName: "이", position: "#2", action: "check" },
        { seatId: 0, playerName: "김", position: "#1", action: "bet", amountText: "15K" },
        { seatId: 1, playerName: "이", position: "#2", action: "call" },
      ],
      "5TH":[], "6TH":[], "7TH":[],
    },
    winnerName: "김", winnerSeatId: 0,
  };
  const txt = I.handToText(hand);
  if (!/BRING-IN/.test(txt)) throw new Error("BRING-IN 라벨 누락:\n" + txt);
  if (!/COMPLETE/.test(txt)) throw new Error("COMPLETE 라벨 누락:\n" + txt);
  if (!/\[Ah\]/.test(txt)) throw new Error("3rd 업카드 누락:\n" + txt);
  if (!/\[Ah Qs\]/.test(txt)) throw new Error("4th 누적 업카드 누락:\n" + txt);
  if (/^Board:/.test(txt)) throw new Error("스터드에 Board 줄이 생김:\n" + txt);
  // Winner 줄에 7th 다운(7c=7)까지 포함된 다운+업 표기 (A K K 2 7)
  const wl = txt.split("\n").find(l => l.startsWith("Winner:"));
  if (!/Winner: 김 .*7/.test(wl)) throw new Error("Winner 7장 표기에 7th 다운 누락:\n" + wl);
});

check("스터드: bring-in 가운데 좌석 → 다음 액션자는 bring-in 다음 좌석 (순서 버그)", () => {
  installGlobals({});
  const I = loadInternals(src);
  if (!I.computeNextToAct) return;
  const mk = (bi) => ({
    gameType: "stud7", streetList: ["3RD","4TH","5TH","6TH","7TH"],
    seats: [{ id:0,name:"A",position:"#1" },{ id:1,name:"B",position:"#2" },{ id:2,name:"C",position:"#3" }],
    cardCount: 2, studCards: {}, board:[null,null,null,null,null], roundHole:{},
    streets: { "3RD":[{ seatId:bi, playerName:"x", position:"#"+(bi+1), action:"bringin" }], "4TH":[],"5TH":[],"6TH":[],"7TH":[] },
  });
  // bring-in 다음 좌석부터 (순환)
  if (I.computeNextToAct(mk(0),0)?.id !== 1) throw new Error("#1 bringin → #2 기대");
  if (I.computeNextToAct(mk(1),0)?.id !== 2) throw new Error("#2 bringin → #3 기대 (가운데 좌석 버그)");
  if (I.computeNextToAct(mk(2),0)?.id !== 0) throw new Error("#3 bringin → #1 기대 (순환)");
});

check("스터드: 4TH 첫 액션자 = 운영자 수동 지정(studFirstSeat)", () => {
  installGlobals({});
  const I = loadInternals(src);
  if (!I.computeNextToAct) return;
  const hand = {
    gameType: "stud7", streetList: ["3RD","4TH","5TH","6TH","7TH"],
    seats: [{ id:0,name:"A",position:"#1" },{ id:1,name:"B",position:"#2" },{ id:2,name:"C",position:"#3" }],
    cardCount: 2, studCards: {}, board:[null,null,null,null,null], roundHole:{},
    studFirstSeat: { "4TH": 2 }, // #3를 4th 첫 액션자로 지정
    streets: { "3RD":[
      { seatId:2, playerName:"C", position:"#3", action:"bringin" },
      { seatId:0, playerName:"A", position:"#1", action:"call" },
      { seatId:1, playerName:"B", position:"#2", action:"call" },
    ], "4TH":[], "5TH":[],"6TH":[],"7TH":[] },
  };
  const next = I.computeNextToAct(hand, 1); // 4TH 시작
  if (next?.id !== 2) throw new Error("4TH 첫 액션자는 지정한 #3 기대, got id=" + (next&&next.id));
});

check("스터드: 첫 액션자 미지정이면 좌석순 첫 (폴백)", () => {
  installGlobals({});
  const I = loadInternals(src);
  if (!I.computeNextToAct) return;
  const hand = {
    gameType: "stud7", streetList: ["3RD","4TH","5TH","6TH","7TH"],
    seats: [{ id:0,name:"A",position:"#1" },{ id:1,name:"B",position:"#2" },{ id:2,name:"C",position:"#3" }],
    cardCount: 2, studCards: {}, board:[null,null,null,null,null], roundHole:{},
    studFirstSeat: {}, // 미지정
    streets: { "3RD":[], "4TH":[], "5TH":[],"6TH":[],"7TH":[] },
  };
  const next = I.computeNextToAct(hand, 0); // 3RD 시작, 미지정 → 좌석순 첫(#1)
  if (next?.id !== 0) throw new Error("미지정 폴백은 좌석순 첫 #1 기대, got id=" + (next&&next.id));
});

check("스터드: bring-in 지정(studFirstSeat) → 그 사람부터 시작", () => {
  installGlobals({});
  const I = loadInternals(src);
  if (!I.computeNextToAct) return;
  const hand = {
    gameType: "stud7", streetList: ["3RD","4TH","5TH","6TH","7TH"],
    seats: [{ id:0,name:"A",position:"#1" },{ id:1,name:"B",position:"#2" },{ id:2,name:"C",position:"#3" }],
    cardCount: 2, studCards: {}, board:[null,null,null,null,null], roundHole:{},
    studFirstSeat: { "3RD": 1 }, // #2를 bring-in으로 지정
    streets: { "3RD":[], "4TH":[], "5TH":[],"6TH":[],"7TH":[] },
  };
  const next = I.computeNextToAct(hand, 0);
  if (next?.id !== 1) throw new Error("지정한 bring-in #2부터 시작 기대, got id=" + (next&&next.id));
});

check("스터드 N-BET: bring-in → complete → raise = 3-BET", () => {
  installGlobals({});
  const I = loadInternals(src);
  if (!I.getActionLabel) return;
  const entries = [
    { seatId:2, action:"bringin" },
    { seatId:0, action:"complete" },
    { seatId:1, action:"raise" },
    { seatId:0, action:"raise" },
  ];
  if (I.getActionLabel(entries, 2) !== "3-BET") throw new Error("complete 후 raise=3-BET 기대, got " + I.getActionLabel(entries,2));
  if (I.getActionLabel(entries, 3) !== "4-BET") throw new Error("다음 raise=4-BET 기대, got " + I.getActionLabel(entries,3));
});

check("스터드: complete 후 라운드 흐름 + bring-in 재액션 (3RD)", () => {
  installGlobals({});
  const I = loadInternals(src);
  if (!I.computeNextToAct) return;
  // bringin(#2) → #3 call → #1 complete → 다음은 #2(bring-in 친 사람)가 complete에 응답해야
  const hand = {
    gameType: "stud7", streetList: ["3RD","4TH","5TH","6TH","7TH"],
    seats: [{ id:0,name:"A",position:"#1" },{ id:1,name:"B",position:"#2" },{ id:2,name:"C",position:"#3" }],
    cardCount: 2, studCards: {}, board:[null,null,null,null,null], roundHole:{},
    streets: { "3RD":[
      { seatId:1, playerName:"B", position:"#2", action:"bringin" },
      { seatId:2, playerName:"C", position:"#3", action:"call" },
      { seatId:0, playerName:"A", position:"#1", action:"complete" },
    ], "4TH":[], "5TH":[],"6TH":[],"7TH":[] },
  };
  const next = I.computeNextToAct(hand, 0);
  // complete(#1=id0) 어그레서, 다음 좌석부터 → #2(id1) (bring-in 친 사람, 아직 complete 미응답)
  if (next?.id !== 1) throw new Error("complete 후 다음은 #2(id1) 기대, got id=" + (next&&next.id));
});

check("스터드: 레이즈 후 라운드 미완료 (다음 액션자 존재, complete 모델)", () => {
  installGlobals({});
  const I = loadInternals(src);
  const hand = {
    gameType: "stud7",
    streetList: ["3RD","4TH","5TH","6TH","7TH"],
    seats: [{ id: 0, name: "A", position: "#1" }, { id: 1, name: "B", position: "#2" }, { id: 2, name: "C", position: "#3" }],
    cardCount: 2,
    studCards: {},
    board: [null,null,null,null,null], roundHole: {},
    streets: {
      "3RD": [
        { seatId: 2, playerName: "C", position: "#3", action: "bringin" },
        { seatId: 0, playerName: "A", position: "#1", action: "complete" },
        { seatId: 1, playerName: "B", position: "#2", action: "raise" },
      ],
      "4TH":[], "5TH":[], "6TH":[], "7TH":[],
    },
  };
  const next = I.computeNextToAct ? I.computeNextToAct(hand, 0) : null;
  if (I.computeNextToAct) {
    if (!next) throw new Error("레이즈 후 라운드가 조기 완료됨(다음 액션자 null)");
    if (![0, 2].includes(next.id)) throw new Error("다음 액션자가 잘못됨: id=" + next.id);
  }
});

// ── 9) 키보드 액션 단축키 (betAmount 미정의 회귀 방지) ───────────
check("키보드 액션: 금액 입력 후 O=OPEN → 단위(k) 적용 기록 + throw 없음", () => {
  const seats = Array.from({ length: 9 }, (_, i) => ({
    id: i, name: i < 2 ? `P${i}` : "", position: "", active: i < 2, out: false, outCount: 0,
  }));
  installGlobals({ pt_gametype: JSON.stringify("holdem"), pt_seats: JSON.stringify(seats), pt_button: JSON.stringify(0) });
  const Comp = loadComponent(src);
  let r;
  act(() => { r = TestRenderer.create(React.createElement(Comp)); });
  const root = r.root;
  clickByText(root, "NEW HAND");
  _dealCurrent(root, 2, ["A", "K"]); // 현재 액터 카드 (OPEN 가능)
  // 금액칸에 23 주입 (단위 기본 k) → OPEN 키
  const amtInput = root.findAll(
    (n) => n.props && n.props.className === "bet-amount-input" && typeof n.props.onChange === "function",
    { deep: true }
  );
  if (!amtInput.length) throw new Error("금액 입력칸(bet-amount-input) 못 찾음");
  act(() => { amtInput[0].props.onChange({ target: { value: "23" } }); });
  _kbd(root, "o"); // betAmount 미정의였다면 ReferenceError로 throw → check FAIL
  // "23k"는 액션 배지(AmountChip)에만 등장(버튼 라벨엔 없음) → 기록·단위 적용 동시 검증
  if (!/23k/i.test(nodeText(root))) {
    throw new Error("키보드 O 금액 단위(23k) 미반영:\n" + nodeText(root).slice(0, 160));
  }
  r.unmount();
});

check("키보드 액션: O·C·F·Z 연쇄가 throw 없이 흐름 (holdem 3인)", () => {
  const seats = Array.from({ length: 9 }, (_, i) => ({
    id: i, name: i < 3 ? `P${i}` : "", position: "", active: i < 3, out: false, outCount: 0,
  }));
  installGlobals({ pt_gametype: JSON.stringify("holdem"), pt_seats: JSON.stringify(seats), pt_button: JSON.stringify(0) });
  const Comp = loadComponent(src);
  let r;
  act(() => { r = TestRenderer.create(React.createElement(Comp)); });
  const root = r.root;
  clickByText(root, "NEW HAND");
  // 각 액터 카드 딜 후 키보드 액션 (어느 키에서든 throw 나면 check FAIL)
  _dealCurrent(root, 2, ["A", "K"]); _kbd(root, "o"); // OPEN
  _dealCurrent(root, 2, ["Q", "J"]); _kbd(root, "c"); // CALL
  _dealCurrent(root, 2, ["T", "9"]); _kbd(root, "f"); // FOLD
  _kbd(root, "z"); // undo
  if (!r.toJSON()) throw new Error("렌더 깨짐");
  r.unmount();
});

check("스터드 통합: stud7 마운트 + NEW HAND + BRING-IN 버튼 노출 + 렌더 정상", () => {
  const seats = Array.from({ length: 9 }, (_, i) => ({
    id: i, name: i < 3 ? `P${i}` : "", position: "", active: i < 3, out: false, outCount: 0,
  }));
  installGlobals({ pt_gametype: JSON.stringify("stud7"), pt_seats: JSON.stringify(seats), pt_button: JSON.stringify(0) });
  const Comp = loadComponent(src);
  let r;
  act(() => { r = TestRenderer.create(React.createElement(Comp)); });
  const root = r.root;
  clickByText(root, "NEW HAND");
  const txt = nodeText(root);
  // 3RD 스트리트 시작 → BRING-IN 버튼이 보여야 (OPEN은 스터드에서 숨김)
  if (!/BRING-IN/.test(txt)) throw new Error("스터드 3RD에 BRING-IN 버튼 없음");
  if (!r.toJSON()) throw new Error("스터드 렌더 깨짐");
  r.unmount();
});

check("카드 피커: 7장 + slotMeta(업/다운) + 시작슬롯 마운트 (스터드 핸드 편집)", () => {
  installGlobals({});
  const I = loadInternals(src);
  if (!I.CardPickerModal) return;
  let r;
  const meta = Array.from({ length: 7 }, (_, i) => ({ label: "3rd", face: (i < 2 || i === 6) ? "down" : "up" }));
  act(() => {
    r = TestRenderer.create(React.createElement(I.CardPickerModal, {
      open: true, onClose() {}, onSelectBoth() {},
      initialCards: ["As", null, null, null, null, null, null],
      cardCount: 7, initialActiveSlot: 6, slotMeta: meta,
    }));
  });
  const txt = nodeText(r.root);
  if (!/7장/.test(txt)) throw new Error("7장 표기 없음");
  if (!/←→/.test(txt)) throw new Error("←→ 안내 없음");
  if (!r.toJSON()) throw new Error("피커 렌더 깨짐");
  r.unmount();
});

check("홀덤/PLO: BRING-IN·COMPLETE 버튼 숨김 + 프리플랍 림프(콜) 허용", () => {
  for (const [gt, ranks] of [["holdem", ["A", "K"]], ["plo4", ["A", "K", "Q", "J"]]]) {
    const seats = Array.from({ length: 9 }, (_, i) => ({ id: i, name: i < 3 ? `P${i}` : "", position: "", active: i < 3, out: false, outCount: 0 }));
    installGlobals({ pt_gametype: JSON.stringify(gt), pt_seats: JSON.stringify(seats), pt_button: JSON.stringify(0) });
    const Comp = loadComponent(src);
    let r; act(() => { r = TestRenderer.create(React.createElement(Comp)); });
    const root = r.root;
    clickByText(root, "NEW HAND");
    if (/BRING-IN|COMPLETE/.test(nodeText(root))) throw new Error(gt + ": 스터드 전용 버튼이 노출됨");
    _dealCurrent(root, ranks.length, ranks);
    const btns = root.findAll(n => n.props && typeof n.props.onClick === "function" && n.props.disabled !== undefined, { deep: true });
    let callOn = false;
    for (const b of btns) { const t = nodeText(b); if (t.includes("CALL") && !t.includes("ALL-IN") && !b.props.disabled) callOn = true; }
    if (!callOn) throw new Error(gt + ": 프리플랍 림프(콜)가 비활성");
    r.unmount();
  }
});

function btnStates(root) {
  const btns = root.findAll(n => n.props && typeof n.props.onClick === "function" && n.props.disabled !== undefined, { deep: true });
  const order = ["ALL-INCALL", "BRING-IN", "COMPLETE", "ALL-IN", "OPEN", "BET", "RAISE", "CHECK", "FOLD", "CALL"];
  const st = {};
  for (const b of btns) {
    const t = nodeText(b).replace(/\s+/g, "");
    for (const lab of order) { if (t.includes(lab)) { if (st[lab] === undefined) st[lab] = b.props.disabled ? "·" : "O"; break; } }
  }
  const show = ["OPEN", "BET", "RAISE", "CALL", "CHECK", "FOLD", "ALL-IN", "ALL-INCALL", "BRING-IN", "COMPLETE"];
  return show.filter(k => st[k] !== undefined).map(k => `${k}:${st[k]}`).join("  ") || "(버튼없음)";
}
function mountGame(gt, nSeats) {
  const seats = Array.from({ length: 9 }, (_, i) => ({ id: i, name: i < nSeats ? `P${i}` : "", position: "", active: i < nSeats, out: false, outCount: 0 }));
  installGlobals({ pt_gametype: JSON.stringify(gt), pt_seats: JSON.stringify(seats), pt_button: JSON.stringify(0) });
  const Comp = loadComponent(src);
  let r; act(() => { r = TestRenderer.create(React.createElement(Comp)); });
  clickByText(r.root, "NEW HAND");
  return r;
}

check("액션맵: 홀덤 PF 첫=OPEN/RAISE/CALL/FOLD, 플랍 무벳=BET/CHECK", () => {
  const r = mountGame("holdem", 3); const root = r.root;
  _dealCurrent(root, 2, ["A", "K"]);
  let s = btnStates(root);
  if (!/OPEN:O/.test(s) || !/CALL:O/.test(s) || !/RAISE:O/.test(s) || !/CHECK:·/.test(s) || !/ALL-INCALL:·/.test(s))
    throw new Error("PF 첫액터 가용성 이상: " + s);
  clickByText(root, "OPEN"); _dealCurrent(root, 2, ["Q", "J"]); clickByText(root, "CALL");
  _dealCurrent(root, 2, ["T", "9"]); clickByText(root, "CALL");
  clickByText(root, "로 이동");
  s = btnStates(root);
  if (!/BET:O/.test(s) || !/CHECK:O/.test(s) || !/CALL:·/.test(s) || !/RAISE:·/.test(s))
    throw new Error("플랍 무벳 가용성 이상: " + s);
  r.unmount();
});

check("액션맵: 스터드 3RD 첫=BRING-IN만, bring후 COMPLETE/CALL", () => {
  const r = mountGame("stud7", 3); const root = r.root;
  let s = btnStates(root);
  if (!/BRING-IN:O/.test(s) || /FOLD:O/.test(s) || /ALL-IN:O/.test(s))
    throw new Error("3RD 첫은 BRING-IN만이어야: " + s);
  clickByText(root, "BRING-IN");
  s = btnStates(root);
  if (!/COMPLETE:O/.test(s) || !/CALL:O/.test(s)) throw new Error("bring후 COMPLETE/CALL 가용 이상: " + s);
  r.unmount();
});

check("이벤트명: handToText 최상단에 게임 풀네임", () => {
  installGlobals({});
  const I = loadInternals(src);
  const mk = (gt) => ({
    gameType: gt, streetList: I.GAME_TYPES[gt].streets,
    seats: [{ id: 0, name: "A", position: "#1" }], cardCount: 2,
    holeCards: {}, studCards: {}, board: [null, null, null, null, null], roundHole: {},
    streets: Object.fromEntries(I.GAME_TYPES[gt].streets.map(s => [s, []])),
  });
  const cases = [["lhe", "Limit Hold'em"], ["plo8", "Omaha Hi-Lo"], ["stud8", "Seven Card Stud Hi-Lo"], ["holdem", "No-Limit Hold'em"], ["plo4", "Pot-Limit Omaha"], ["sd27", "2-7 No-Limit Single Draw"]];
  for (const [gt, nm] of cases) {
    if (!I.handToText(mk(gt)).includes(nm)) throw new Error(gt + " 이벤트명 누락: " + nm);
  }
});

check("게임 버튼: 9개 노출 + plo5/plo6/badugi 미노출", () => {
  const r = mountGame("lhe", 3); const root = r.root;
  const txt = nodeText(root);
  for (const lab of ["LHE", "PLO8", "Razz", "STUD", "STUD 8", "NLH", "PLO", "2-7 SD", "2-7 TD"]) {
    if (!txt.includes(lab)) throw new Error(lab + " 버튼이 없음");
  }
  if (txt.includes("PLO5") || txt.includes("PLO6") || txt.includes("Badugi") || txt.includes("A-5 TD"))
    throw new Error("제거 대상 게임 버튼이 노출됨");
  r.unmount();
});

check("회귀: 9개 게임 마운트 + 스터드만 BRING-IN", () => {
  for (const gt of ["holdem", "lhe", "razz", "stud7", "stud8", "plo8", "plo4", "sd27", "td27"]) {
    const r = mountGame(gt, 4);
    const txt = nodeText(r.root);
    const stud = ["razz", "stud7", "stud8"].includes(gt);
    if (stud && !/BRING-IN/.test(txt)) throw new Error(gt + ": 스터드인데 BRING-IN 없음");
    if (!stud && /BRING-IN/.test(txt)) throw new Error(gt + ": 비스터드인데 BRING-IN 노출");
    if (!r.toJSON()) throw new Error(gt + ": 렌더 null");
    r.unmount();
  }
});

check("회귀: 스터드 3RD→4TH 흐름 (bring→complete→전원응답→이동)", () => {
  const r = mountGame("stud7", 4); const root = r.root;
  clickByText(root, "BRING-IN");
  clickByText(root, "COMPLETE");
  clickByText(root, "CALL"); clickByText(root, "CALL"); clickByText(root, "CALL");
  if (!clickByText(root, "로 이동")) throw new Error("3RD 완료 후 4TH 이동 버튼 없음");
  if (!/BET:O/.test(btnStates(root)) || !/CHECK:O/.test(btnStates(root))) throw new Error("4TH 첫 액션 BET/CHECK 이상");
  r.unmount();
});

check("회귀: 드로우(2-7TD) 프리=OPEN, DRAW1=BET/CHECK", () => {
  const r = mountGame("td27", 3); const root = r.root;
  _dealCurrent(root, 5, ["A", "K", "Q", "J", "9"]);
  if (!/OPEN:O/.test(btnStates(root))) throw new Error("TD 프리 OPEN 비활성");
  clickByText(root, "OPEN");
  _dealCurrent(root, 5, ["2", "3", "4", "5", "7"]); clickByText(root, "CALL");
  _dealCurrent(root, 5, ["T", "8", "6", "4", "2"]); clickByText(root, "CALL");
  if (!clickByText(root, "로 이동")) throw new Error("DRAW1 이동 버튼 없음");
  if (!/BET:O/.test(btnStates(root)) || !/CHECK:O/.test(btnStates(root))) throw new Error("DRAW1 BET/CHECK 이상");
  r.unmount();
});

check("Hi-Lo: 로그 Winner 줄 High/Low·Scoop 표기", () => {
  installGlobals({});
  const I = loadInternals(src);
  const base = {
    gameType: "plo8", streetList: I.GAME_TYPES.plo8.streets,
    seats: [{ id: 0, name: "김", position: "BTN" }, { id: 1, name: "이", position: "BB" }],
    cardCount: 4, holeCards: { 0: ["Ah", "Kd", "2c", "3s"], 1: ["Qh", "Qs", "7d", "8c"] },
    board: ["Tc", "9d", "2h", "Ks", "4c"], roundHole: {},
    streets: Object.fromEntries(I.GAME_TYPES.plo8.streets.map(s => [s, []])),
  };
  const split = { ...base, winnerName: "High: 김 / Low: 이", isSplit: true, isHilo: true, hiWinners: [0], loWinners: [1] };
  if (!I.handToText(split).includes("Winner: High: 김 / Low: 이")) throw new Error("Hi-Lo Winner 표기 누락");
  const scoop = { ...base, winnerName: "SCOOP: 김", isSplit: true, isHilo: true, hiWinners: [0], loWinners: [0] };
  if (!I.handToText(scoop).includes("Winner: SCOOP: 김")) throw new Error("Scoop 표기 누락");
  // 이벤트명도 함께
  if (!I.handToText(split).includes("Omaha Hi-Lo")) throw new Error("이벤트명 누락");
});

check("스터드 H 단축키: 7칸 핸드 피커 (2장 아님)", () => {
  const r = mountGame("stud7", 3); const root = r.root;
  _kbd(root, "h");
  const txt = nodeText(root);
  if (!/7장/.test(txt)) throw new Error("스터드 H가 7장 피커를 안 엶");
  if (/· 2장/.test(txt)) throw new Error("스터드 H가 2장 피커를 엶(버그)");
  r.unmount();
});

check("이벤트명 토글: handToText 2번째 인자 false면 이벤트명 줄 생략", () => {
  installGlobals({});
  const I = loadInternals(src);
  const hand = {
    gameType: "holdem", streetList: I.GAME_TYPES.holdem.streets,
    seats: [{ id: 0, name: "A", position: "#1" }], cardCount: 2,
    holeCards: {}, studCards: {}, board: [null, null, null, null, null], roundHole: {},
    streets: Object.fromEntries(I.GAME_TYPES.holdem.streets.map(s => [s, []])),
  };
  const withName = I.handToText(hand);           // 기본값 = 표시
  const withNameExplicit = I.handToText(hand, true);
  const without = I.handToText(hand, false);     // 토글 OFF
  if (!withName.includes("[ No-Limit Hold'em ]")) throw new Error("기본값에서 이벤트명 누락");
  if (withNameExplicit !== withName) throw new Error("true 명시와 기본값이 다름");
  if (without.includes("[ No-Limit Hold'em ]")) throw new Error("false인데 이벤트명이 남음");
  if (without.includes("No-Limit Hold'em")) throw new Error("false인데 게임명이 어딘가 남음");
  // 이벤트명만 빠지고 나머지 줄(Winner 등)은 유지되어야
  if (!without.includes("Winner:")) throw new Error("이벤트명 제거가 다른 줄까지 지움");
  if (without.split("\n").length !== withName.split("\n").length - 1)
    throw new Error("정확히 한 줄(이벤트명)만 제거되어야 함");
});

check("이벤트명 토글: LOG 버튼 ON↔OFF 클릭으로 라벨 전환", () => {
  const r = mountGame("holdem", 3); const root = r.root;
  clickByText(root, "LOG");
  if (!/이벤트명 ON/.test(nodeText(root))) throw new Error("초기 상태가 ON이 아님");
  clickByText(root, "이벤트명 ON");
  if (!/이벤트명 OFF/.test(nodeText(root))) throw new Error("클릭 후 OFF로 안 바뀜");
  clickByText(root, "이벤트명 OFF");
  if (!/이벤트명 ON/.test(nodeText(root))) throw new Error("재클릭 후 ON 복귀 안 됨");
  r.unmount();
});

check("이벤트명 토글: 저장값(pt_showevent=false)이면 마운트 시 OFF", () => {
  installGlobals({ pt_showevent: JSON.stringify(false) });
  const Comp = loadComponent(src);
  let r; act(() => { r = TestRenderer.create(React.createElement(Comp)); });
  clickByText(r.root, "LOG");
  if (!/이벤트명 OFF/.test(nodeText(r.root))) throw new Error("저장된 false가 OFF로 반영 안 됨");
  r.unmount();
});

// ── 결과 출력 ────────────────────────────────────────────────────
check("스터드 로그: 3RD 다운카드 2장 + 7TH 다운카드 표시", () => {
  installGlobals({});
  const I = loadInternals(src);
  const h = {
    gameType: "stud7", streetList: ["3RD","4TH","5TH","6TH","7TH"],
    seats: [{ id: 0, name: "김", position: "#1" }, { id: 1, name: "이", position: "#2" }],
    cardCount: 2,
    // slot 0,1=3rd다운  2=3rd업  3=4th업  6=7th다운
    studCards: {
      0: ["Ah", "Kd", "Ks", "2d", null, null, "7c"],
      1: ["Qh", "Jd", "As", "Qs", null, null, "9h"],
    },
    board: [null,null,null,null,null], roundHole: {},
    streets: {
      "3RD": [
        { seatId: 1, playerName: "이", position: "#2", action: "bringin", amountText: "5K" },
        { seatId: 0, playerName: "김", position: "#1", action: "complete", amountText: "15K" },
        { seatId: 1, playerName: "이", position: "#2", action: "call" },
      ],
      "4TH": [
        { seatId: 0, playerName: "김", position: "#1", action: "check" },
        { seatId: 1, playerName: "이", position: "#2", action: "bet", amountText: "15K" },
      ],
      "7TH": [
        { seatId: 0, playerName: "김", position: "#1", action: "check" },
        { seatId: 1, playerName: "이", position: "#2", action: "bet", amountText: "30K" },
      ],
      "5TH": [], "6TH": [],
    },
    winnerName: "김", winnerSeatId: 0,
  };
  const txt = I.handToText(h, true);
  const lines = txt.split("\n");
  const line3rd = lines.find(l => l.startsWith("3rd:"));
  const line7th = lines.find(l => l.startsWith("7th:"));
  if (!line3rd) throw new Error("3RD 라인 없음:\n" + txt);
  if (!line7th) throw new Error("7TH 라인 없음:\n" + txt);
  // 3RD: 이의 다운카드(Qh, Jd) + 업카드 [As] 포함
  if (!line3rd.includes("Q") || !line3rd.includes("J")) throw new Error("3RD 이 다운카드 누락:\n" + line3rd);
  // 3RD: 김의 다운카드(Ah, Kd) + 업카드 [Ks] 포함
  if (!line3rd.includes("A") || !line3rd.includes("K")) throw new Error("3RD 김 다운카드 누락:\n" + line3rd);
  // 7TH: 각 플레이어 7th 다운카드(7c, 9h) 포함
  if (!line7th.includes("7")) throw new Error("7TH 김 다운카드(7c) 누락:\n" + line7th);
  if (!line7th.includes("9")) throw new Error("7TH 이 다운카드(9h) 누락:\n" + line7th);
  // 4TH 라인: 다운카드 없고 누적 업카드만 (기존 동작 보존)
  const line4th = lines.find(l => l.startsWith("4th:"));
  if (!line4th) throw new Error("4TH 라인 없음");
  if (!/\[Ks 2d\]/.test(line4th)) throw new Error("4TH 김 누적업카드 이상:\n" + line4th);
});

let fail = 0;
for (const [s, n, m] of results) {
  if (s === "FAIL") fail++;
  console.log(`${s === "PASS" ? "✓" : "✗"} ${n}${m ? "  → " + m : ""}`);
}
console.log(`\n${results.length - fail}/${results.length} passed`);
process.exit(fail ? 1 : 0);

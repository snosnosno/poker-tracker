import React, { useState, useEffect, useCallback } from "react";

// ══════════════════════════════════════════════════════════════════════════════
// 상수
// ══════════════════════════════════════════════════════════════════════════════
const STREETS = ["PREFLOP", "FLOP", "TURN", "RIVER"]; // 홀덤/오마하 기본 (하위호환 기본값)
const STREET_SHORT = {
  PREFLOP: "Pre", FLOP: "Flop", TURN: "Turn", RIVER: "River",
  DRAW1: "Draw 1", DRAW2: "Draw 2", DRAW3: "Draw 3",
  "3RD": "3rd", "4TH": "4th", "5TH": "5th", "6TH": "6th", "7TH": "7th",
};

// 게임 타입 정의: 카드 장수 + 스트리트 구성 + 드로우 여부
const GAME_TYPES = {
  holdem: { label: "NLH",     name: "No-Limit Hold'em",                  cards: 2, streets: ["PREFLOP", "FLOP", "TURN", "RIVER"], draw: false },
  lhe:    { label: "LHE",     name: "Limit Hold'em",                     cards: 2, streets: ["PREFLOP", "FLOP", "TURN", "RIVER"], draw: false },
  plo4:   { label: "PLO",     name: "Pot-Limit Omaha",                   cards: 4, streets: ["PREFLOP", "FLOP", "TURN", "RIVER"], draw: false },
  plo8:   { label: "PLO8",    name: "Omaha Hi-Lo 8 or Better",           cards: 4, streets: ["PREFLOP", "FLOP", "TURN", "RIVER"], draw: false, hilo: true },
  plo5:   { label: "PLO5",    name: "5-Card Pot-Limit Omaha",            cards: 5, streets: ["PREFLOP", "FLOP", "TURN", "RIVER"], draw: false },
  plo6:   { label: "PLO6",    name: "6-Card Pot-Limit Omaha",            cards: 6, streets: ["PREFLOP", "FLOP", "TURN", "RIVER"], draw: false },
  td27:   { label: "2-7 TD",  name: "2-7 Limit Triple Draw",             cards: 5, streets: ["PREFLOP", "DRAW1", "DRAW2", "DRAW3"], draw: true },
  tdA5:   { label: "A-5 TD",  name: "A-5 Triple Draw",                   cards: 5, streets: ["PREFLOP", "DRAW1", "DRAW2", "DRAW3"], draw: true },
  badugi: { label: "Badugi",  name: "Badugi",                            cards: 4, streets: ["PREFLOP", "DRAW1", "DRAW2", "DRAW3"], draw: true },
  sd27:   { label: "2-7 SD",  name: "2-7 No-Limit Single Draw",          cards: 5, streets: ["PREFLOP", "DRAW1"], draw: true },
  stud7:  { label: "STUD",    name: "Seven Card Stud",                   cards: 2, streets: ["3RD","4TH","5TH","6TH","7TH"], draw: false, stud: true },
  stud8:  { label: "STUD 8",  name: "Seven Card Stud Hi-Lo 8 or Better", cards: 2, streets: ["3RD","4TH","5TH","6TH","7TH"], draw: false, stud: true, hilo: true },
  razz:   { label: "Razz",    name: "Razz",                              cards: 2, streets: ["3RD","4TH","5TH","6TH","7TH"], draw: false, stud: true },
};
// UI에 노출할 게임 버튼 (사용자 지정 순서). plo5/plo6/tdA5/badugi는 데이터 호환용으로만 남기고 버튼에선 제외.
const GAME_ORDER = ["holdem", "lhe", "razz", "stud7", "stud8", "plo8", "plo4", "sd27", "td27"];
// 스터드 업카드가 있는 스트리트 (7TH는 다운카드)
const STUD_UP_STREETS = new Set(["3RD","4TH","5TH","6TH"]);
// 스터드 카드 7칸 모델: studCards[seatId] = [c0..c6]
//  0,1 = 3rd 다운 / 2 = 3rd 업 / 3 = 4th 업 / 4 = 5th 업 / 5 = 6th 업 / 6 = 7th 다운
const STUD_SLOTS = [
  { street: "3RD", face: "down" }, // 0
  { street: "3RD", face: "down" }, // 1
  { street: "3RD", face: "up"   }, // 2
  { street: "4TH", face: "up"   }, // 3
  { street: "5TH", face: "up"   }, // 4
  { street: "6TH", face: "up"   }, // 5
  { street: "7TH", face: "down" }, // 6
];
// 스트리트 → 그 스트리트에서 새로 받는 슬롯 인덱스(들)
const STUD_SLOTS_BY_STREET = { "3RD": [0, 1, 2], "4TH": [3], "5TH": [4], "6TH": [5], "7TH": [6] };
// 스트리트 → 업카드 슬롯 인덱스 (7TH는 다운이라 없음)
const STUD_UP_SLOT = { "3RD": 2, "4TH": 3, "5TH": 4, "6TH": 5 };
const DEFAULT_GAME = "holdem";
// 핸드(또는 게임타입)에 맞는 스트리트 배열. 구버전 핸드(streetList 없음)는 홀덤 기본.
function streetsOf(handOrType) {
  if (!handOrType) return STREETS;
  if (Array.isArray(handOrType.streetList)) return handOrType.streetList;
  if (typeof handOrType === "string") return GAME_TYPES[handOrType]?.streets || STREETS;
  return GAME_TYPES[handOrType.gameType]?.streets || STREETS;
}

// 각 스트리트에서 보여줄 누적 보드 장수 (플랍3·턴4·리버5)
const BOARD_COUNT_BY_STREET = { FLOP: 3, TURN: 4, RIVER: 5 };
// 보드 카드를 "Q J 3" 처럼 (랭크만, 미입력/미지정은 ?) 표기. count = 노출 장수.
// 보드를 한 줄로: "K♦ Q♥ 7♥ | 2♠ | 9♣" (플랍 | 턴 | 리버). 입력된 카드만, 없으면 "".
function boardSegmentText(board) {
  if (!board) return "";
  const segs = [[0, 3], [3, 4], [4, 5]];
  const out = [];
  for (const [a, b] of segs) {
    const cards = [];
    for (let i = a; i < b; i++) {
      if (board[i] && board[i] !== CARD_UNKNOWN) cards.push(cardLabelL(board[i]));
    }
    if (cards.length) out.push(cards.join(" "));
  }
  return out.join(" | ");
}

const ACTIONS = [
  { id: "open",   label: "OPEN",   color: "#f59e0b" },
  { id: "bet",    label: "BET",    color: "#22c55e" },
  { id: "raise",  label: "RAISE",  color: "#ef4444" },
  { id: "call",   label: "CALL",   color: "#3b82f6" },
  { id: "allincall", label: "ALL-IN CALL", lines: ["ALL-IN", "CALL"], color: "#818cf8" },
  { id: "check",  label: "CHECK",  color: "#94a3b8" },
  { id: "fold",   label: "FOLD",   color: "#7e8ca0" },
  { id: "allin",    label: "ALL-IN",   color: "#8b5cf6" },
  { id: "bringin",  label: "BRING-IN", color: "#f97316" },
  { id: "complete", label: "COMPLETE", color: "#14b8a6" },
];

// 9-max 포지션 순서 (액션 순서: UTG부터 시계방향)
// PREFLOP: UTG → UTG+1 → MP → MP+1 → HJ → CO → D → SB → BB
// POSTFLOP: SB → BB → UTG → ... → D (SB부터 시작)
const POSITION_ORDER = ["UTG", "UTG+1", "MP", "MP+1", "HJ", "CO", "D", "SB", "BB"];

// 포스트플랍 액션 순서 = SB → BB → UTG → ... → D
const POSTFLOP_ORDER = ["SB", "BB", "UTG", "UTG+1", "MP", "MP+1", "HJ", "CO", "D"];

// RFID 화면 표기 매핑 (내부 코드 → RFID 화면에 보이는 라벨)
// 내부 로직(정렬/N-BET)은 POSITION_ORDER 코드를 그대로 쓰고, 표시할 때만 변환
const POSITION_LABEL = {
  "UTG": "UTG",
  "UTG+1": "+1",
  "MP": "+2",
  "MP+1": "+3",
  "HJ": "HJ",
  "CO": "CO",
  "D": "D",
  "SB": "SB",
  "BB": "BB",
};
function posLabel(pos) {
  return POSITION_LABEL[pos] || pos || "";
}

// 카드
const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];

// 카드 선택 그리드 표시 순서 (2줄: A234567 / 89TJQK)
const RANK_GRID = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K"];
// 각 그리드 위치의 단축키 (A=a, 2~9=숫자, T/J/Q/K=알파벳)
const RANK_KEYS = ["a", "2", "3", "4", "5", "6", "7", "8", "9", "t", "j", "q", "k"];

// 미입력 슬롯 placeholder (확정 시 빈칸을 이걸로 채움). 'Ax'(랭크O 슈트X)와 구분되는 단일 문자.
const CARD_UNKNOWN = "?";

// 홀카드 장수: gameType에서 파생(GAME_TYPES[].cards). 아래 상수는 구버전
// pt_cardcount 마이그레이션(clampCardCount)에만 사용. 7은 내부 허용(스터드 대비).
const DEFAULT_CARD_COUNT = 2;
const MIN_CARD_COUNT = 2;
const MAX_CARD_COUNT = 7;
const clampCardCount = (n) => {
  const v = Math.round(Number(n) || DEFAULT_CARD_COUNT);
  return Math.min(MAX_CARD_COUNT, Math.max(MIN_CARD_COUNT, v));
};

// 베팅 금액 입력 대상 액션 (사이징). ALL-IN CALL도 올인 금액 기록 허용.
const AMOUNT_ACTIONS = new Set(["open", "bet", "raise", "allin", "allincall", "bringin", "complete"]);
// 액션 버튼 단축키 힌트 (표시 + 실제 키 바인딩)
const ACTION_KEY = { open: "O", bet: "B", raise: "R", call: "C", fold: "F", check: "SPC", allin: "A" };

// 스터드 카드 1장 조회. 신규 studCards[seatId][slot] 우선, 구버전(studUp/holeCards) 폴백.
function studCardAt(hand, seatId, slot) {
  const sc = hand?.studCards?.[seatId];
  if (sc && sc[slot] != null) return sc[slot];
  const meta = STUD_SLOTS[slot];
  if (!meta) return null;
  // 폴백: 업슬롯 → 구버전 studUp[street], 다운슬롯 0/1 → 구버전 holeCards
  if (meta.face === "up") return hand?.studUp?.[seatId]?.[meta.street] ?? null;
  if (slot < 2) return hand?.holeCards?.[seatId]?.[slot] ?? null;
  return null; // 7th 다운(slot 6)은 구버전 데이터에 없음
}

// 스터드: 해당 시트의 누적 업카드 (3RD~upToStreetIdx까지 입력된 것만)
function studUpCards(hand, seatId, upToStreetIdx) {
  const SL = streetsOf(hand);
  const out = [];
  for (const [st, slot] of Object.entries(STUD_UP_SLOT)) {
    const sIdx = SL.indexOf(st);
    if (sIdx >= 0 && sIdx <= upToStreetIdx) {
      const c = studCardAt(hand, seatId, slot);
      if (c && c !== CARD_UNKNOWN) out.push([sIdx, c]);
    }
  }
  return out.sort((a, b) => a[0] - b[0]).map(x => x[1]);
}

// 스터드: 다운카드 (slot 0·1 = 3rd, slot 6 = 7th) 중 입력된 것
function studDownCards(hand, seatId) {
  return [0, 1, 6].map(s => studCardAt(hand, seatId, s)).filter(Boolean);
}

// 스터드: 입력된 7장 전체 (평가/Winner 표기용, 슬롯 순서대로)
function studAllCards(hand, seatId) {
  const out = [];
  for (let s = 0; s < STUD_SLOTS.length; s++) {
    const c = studCardAt(hand, seatId, s);
    if (c) out.push(c);
  }
  return out;
}

// 숫자 입력 + 단위(없음/k/m)로 표시 문자열 생성. 무효/빈값이면 null.
// 예) ("23.5","k")→"23.5k", ("23500","")→"23500", ("1","m")→"1m", ("100","")→"100"
function makeAmountText(numStr, unit) {
  if (numStr == null) return null;
  const s = String(numStr).trim();
  if (!s || !/^\d+(\.\d+)?$/.test(s)) return null;
  if (!(parseFloat(s) > 0)) return null;
  const suffix = unit === "k" ? "k" : unit === "m" ? "m" : "";
  return s + suffix;
}

// 표시 문자열 → 숫자값 (향후 팟 계산용). 무효면 null.
function parseAmountText(text) {
  if (!text) return null;
  const m = String(text).trim().toLowerCase().match(/^(\d+(?:\.\d+)?)([km]?)$/);
  if (!m) return null;
  const mult = m[2] === "k" ? 1e3 : m[2] === "m" ? 1e6 : 1;
  return parseFloat(m[1]) * mult;
}

// 공통 모노스페이스 폰트 스택 (카드/포지션/금액 등 고정폭 표기)
const MONO = "'Courier New', 'Apple SD Gothic Neo', 'Malgun Gothic', monospace";

const SUITS = [
  { id: "s", label: "♠", color: "#e2e8f0" },
  { id: "h", label: "♥", color: "#f87171" },
  { id: "d", label: "♦", color: "#fbbf24" },
  { id: "c", label: "♣", color: "#86efac" },
];

// 카드 랭크 강도 (높을수록 강함)
const RANK_VALUE = { A: 14, K: 13, Q: 12, J: 11, T: 10, "9":9, "8":8, "7":7, "6":6, "5":5, "4":4, "3":3, "2":2 };

const SUIT_SYMBOL = { s: "♠", h: "♥", d: "♦", c: "♣" };
const SUIT_COLOR = { s: "#0f172a", h: "#dc2626", d: "#2563eb", c: "#16a34a" }; // 4색 구분(스페이드 검정·하트 빨강·다이아 파랑·클럽 초록)
// 카드 1장 표기: 슈트가 실제로 정해졌으면 기호 붙임(Q♥), 아니면(placeholder 'x') 랭크만(Q). 미지정은 ?
function cardLabel(c) {
  if (!c || c === CARD_UNKNOWN) return "?";
  const sym = SUIT_SYMBOL[c[1]];
  return sym ? c[0] + sym : c[0];
}

// 홀카드를 "KQ" "JT" 같은 표기로 변환 (높은 랭크 먼저). 슈트 입력됐으면 기호 표시(K♥Q♠)
function cardsToText(cards) {
  if (!cards) return "";
  const valid = cards.filter(Boolean);
  if (valid.length === 0) return "";
  // 랭크 강도로 정렬 (높은 것 먼저)
  const sorted = [...valid].sort((a, b) => (RANK_VALUE[b[0]] || 0) - (RANK_VALUE[a[0]] || 0));
  return sorted.map(cardLabel).join("");
}

// 로그 전용 표기: 문양을 기호(♥) 대신 글자(h)로. 예) "Kh Qs", 슈트 미정이면 랭크만.
function cardLabelL(c) {
  if (!c || c === CARD_UNKNOWN) return "?";
  return SUIT_SYMBOL[c[1]] ? c[0] + c[1] : c[0];
}
function cardsToTextL(cards) {
  if (!cards) return "";
  const valid = cards.filter(Boolean);
  if (valid.length === 0) return "";
  const sorted = [...valid].sort((a, b) => (RANK_VALUE[b[0]] || 0) - (RANK_VALUE[a[0]] || 0));
  return sorted.map(cardLabelL).join("");
}

// 같은 카드 표기(cardsToText)를 2명 이상이 가진 seat들의 Set (로그에서 이름 병기 구분용)
function computeDupCardSeats(hand) {
  const holeCards = hand?.holeCards || {};
  const count = {};
  Object.keys(holeCards).forEach(id => {
    const ct = cardsToText(holeCards[id]);
    if (ct) count[ct] = (count[ct] || 0) + 1;
  });
  const dup = new Set();
  Object.keys(holeCards).forEach(id => {
    const ct = cardsToText(holeCards[id]);
    if (ct && count[ct] >= 2) dup.add(Number(id));
  });
  return dup;
}

// raise 액션을 RAISE/3-BET/4-BET... 로 변환
// 프리플랍 OPEN = 1단계 RAISE와 동급, 그 다음 RAISE = 3-BET
// 포스트플랍은 BET = 1단계와 동급
function getActionLabel(entries, index) {
  const e = entries[index];
  if (e.action !== "raise") return ACTIONS.find(a => a.id === e.action)?.label;

  // 이전까지의 raise + open + complete + all-in 횟수 합산 (모두 1단계 ↑, 올인=레이즈 취급)
  // 스터드: bring-in(강제) 제외, complete(=풀 오픈)부터 카운트 → bring-in·complete·raise = 3-BET
  let aggCount = 0;
  for (let i = 0; i < index; i++) {
    const ai = entries[i].action;
    if (ai === "raise" || ai === "open" || ai === "allin" || ai === "complete") aggCount++;
    // bringin은 강제 베팅이라 N-BET 카운트에서 제외
  }
  // 0개 이전 = 첫 raise (포스트플랍) → RAISE
  // 1개 이전 (open 1개 또는 raise 1개) → 3-BET
  // 2개 이전 → 4-BET ...
  if (aggCount === 0) return "RAISE";
  return `${aggCount + 2}-BET`;
}

// 핸드를 텍스트로 직렬화 (복사용) - 핸드 넘버는 포함 안 함
// 프리플랍 엔트리에서 첫 액션 폴드 숨김 처리 (헤즈업은 숨기지 않음)
// 반환: { entries, showAllFold }
function processPreflopEntries(rawEntries, isHeadsUp) {
  if (isHeadsUp) {
    // 헤즈업: 폴드도 다 표시
    return { entries: rawEntries, showAllFold: false };
  }
  const actedSeats = new Set();
  const entries = [];
  let hiddenFirstFolds = 0;
  rawEntries.forEach(e => {
    if (e.action === "fold" && !actedSeats.has(e.seatId)) {
      hiddenFirstFolds++;
    } else {
      actedSeats.add(e.seatId);
      entries.push(e);
    }
  });
  const showAllFold = entries.length === 0 && hiddenFirstFolds > 0;
  return { entries, showAllFold };
}

// 어느 스트리트든 "첫 액션이 폴드"인 항목을 제거. 이미 다른 액션을 한 사람이 나중에 폴드하는 건 유지.
// 헤즈업은 프리플랍과 마찬가지로 폴드도 전부 표시.
// prevActedSeats: 이전 스트릿들에서 이미 액션한 좌석 집합(스터드 핸드 전체 추적용)
function filterFirstFolds(rawEntries, isHeadsUp = false, prevActedSeats = null) {
  if (isHeadsUp) return rawEntries;
  const actedSeats = prevActedSeats ? new Set(prevActedSeats) : new Set();
  const out = [];
  for (const e of rawEntries) {
    if (e.action === "fold" && !actedSeats.has(e.seatId)) {
      // 핸드(또는 이 스트릿)에서 첫 액션이 폴드 → 숨김
    } else {
      actedSeats.add(e.seatId);
      out.push(e);
    }
  }
  return out;
}

// 프리플랍에서 (오픈폴드만으로) 전원 폴드되어 끝났는지.
// 조건: 확정 + 플랍 이상 없음 + 폴드 존재 + 생존자 정확히 1명
//       + 모든 폴드가 "첫 액션 폴드"(=숨겨지는 오픈폴드)일 것.
// 이미 액션한 사람이 폴드한 경우(콜/오픈 후 폴드 = 로그에 보임)는 ALL-FOLD 생략.
// 올인-콜 쇼다운(생존 2명+)·헤즈업도 제외.
// 스터드: 브링인 후 전원 폴드(오픈폴드만)로 끝났는지.
// 조건: 확정 + 4TH 이상 액션 없음 + 3RD에 폴드 존재 + 생존자 1명
//       + 보이는 폴드 없음(이미 액션한 사람의 폴드 → ALL-FOLD 생략). 헤즈업 제외.
function studThirdEndedByFold(hand) {
  if (!hand) return false;
  if (!GAME_TYPES[hand.gameType]?.stud) return false;
  const isHeadsUp = (hand.seats?.length || 0) === 2;
  if (isHeadsUp) return false;
  const finalized = !!(hand.winnerSeatId || hand.winnerName || hand.winner);
  if (!finalized) return false;
  const s = hand.streets || {};
  const SL = streetsOf(hand);
  for (let i = 1; i < SL.length; i++) {
    if ((s[SL[i]] || []).length > 0) return false;
  }
  const third = s["3RD"] || [];
  const foldedIds = new Set(third.filter(e => e.action === "fold").map(e => e.seatId));
  if (foldedIds.size === 0) return false;
  const acted = new Set();
  let hasVisibleFold = false;
  for (const e of third) {
    if (e.action === "fold") {
      if (acted.has(e.seatId)) hasVisibleFold = true;
    } else {
      acted.add(e.seatId);
    }
  }
  if (hasVisibleFold) return false;
  const alive = (hand.seats || []).filter(sx => !foldedIds.has(sx.id));
  return alive.length === 1;
}

function preflopEndedByFold(hand) {
  if (!hand) return false;
  const isHeadsUp = (hand.seats?.length || 0) === 2;
  if (isHeadsUp) return false;
  const finalized = !!(hand.winnerSeatId || hand.winnerName || hand.winner);
  if (!finalized) return false;
  const s = hand.streets || {};
  if ((s.FLOP?.length || s.TURN?.length || s.RIVER?.length)) return false;
  const pre = s.PREFLOP || [];
  const foldedIds = new Set(pre.filter(e => e.action === "fold").map(e => e.seatId));
  if (foldedIds.size === 0) return false;
  // 이미 액션한(=폴드 아닌 행동을 한) 사람이 나중에 폴드 → 보이는 폴드 → ALL-FOLD 생략
  const acted = new Set();
  let hasVisibleFold = false;
  for (const e of pre) {
    if (e.action === "fold") {
      if (acted.has(e.seatId)) hasVisibleFold = true;
    } else {
      acted.add(e.seatId);
    }
  }
  if (hasVisibleFold) return false;
  const alive = (hand.seats || []).filter(sx => !foldedIds.has(sx.id));
  return alive.length === 1;
}


// 내부 " 는 "" 로 이스케이프
function toSheetCell(text) {
  return '"' + String(text).replace(/"/g, '""') + '"';
}

function handToText(hand, showEventName = true) {
  const lines = [];
  const isHeadsUp = (hand.seats?.length || 0) === 2;

  // 같은 카드 표기를 2명 이상이 가지면, 그 seat들은 이름도 함께 표시(구분용)
  const dupCardSeats = computeDupCardSeats(hand);
  const SL = streetsOf(hand);
  const isDrawGame = !!GAME_TYPES[hand.gameType]?.draw;
  const isStudGame = !!GAME_TYPES[hand.gameType]?.stud;
  // 스터드: 핸드 전체에서 처음 등장 1회만 이름 표시 (스트릿 넘어도 유지)
  const studHandSeenSeats = new Set();
  // 스터드: 핸드 전체에서 비폴드 액션을 한 좌석 추적 (이전 스트릿에서 액션한 사람 폴드 → 표시)
  const studHandActedSeats = isStudGame ? new Set() : null;

  SL.forEach((street, sIdx) => {
    const rawEntries = hand.streets[street] || [];
    const isPreflop = street === "PREFLOP";

    let entries, showAllFold = false;
    if (isPreflop) {
      const r = processPreflopEntries(rawEntries, isHeadsUp);
      entries = r.entries;
      showAllFold = preflopEndedByFold(hand);
    } else {
      entries = filterFirstFolds(rawEntries, isHeadsUp, studHandActedSeats);
    }

    // 스터드: 이 스트릿의 비폴드 액션을 핸드 집합에 추가 (다음 스트릿 폴드 판단에 사용)
    if (studHandActedSeats) {
      rawEntries.forEach(e => { if (e.action !== "fold") studHandActedSeats.add(e.seatId); });
    }

    const isDrawStreet = isDrawGame && sIdx >= 1;
    const parts = [];
    const seenSeats = new Set();
    entries.forEach((e, i) => {
      const handText = isStudGame ? null : cardsToTextL(handAtStreet(hand, e.seatId, sIdx));
      // 스터드: 누적 업카드 [Kh 2d]
      const upCards = isStudGame ? studUpCards(hand, e.seatId, sIdx) : [];
      const upStr = upCards.length ? `[${upCards.map(cardLabelL).join(" ")}] ` : "";
      const label = getActionLabel(entries, i);
      const isFirstForPlayer = isStudGame ? !studHandSeenSeats.has(e.seatId) : !seenSeats.has(e.seatId);
      seenSeats.add(e.seatId);
      if (isStudGame) studHandSeenSeats.add(e.seatId);

      let prefix = "";
      if (isStudGame) {
        // 스터드: 모든 스트릿에서 3rd 다운카드 항상 표시, 이름은 첫 등장만
        // 7TH에서는 추가로 7th 다운카드(slot 6)를 뒤에 표시
        const sd0 = studCardAt(hand, e.seatId, 0);
        const sd1 = studCardAt(hand, e.seatId, 1);
        const downStr = [sd0, sd1].filter(c => c && c !== CARD_UNKNOWN).map(cardLabelL).join(" ");
        const studDownPrefix = downStr ? downStr + " " : "";
        let studDownSuffix = "";
        if (street === "7TH") {
          const d6 = studCardAt(hand, e.seatId, 6);
          if (d6 && d6 !== CARD_UNKNOWN) studDownSuffix = " " + cardLabelL(d6);
        }
        if (isFirstForPlayer) {
          prefix = `${e.playerName} ${studDownPrefix}${upStr.trimEnd()}${studDownSuffix} `.replace(/  +/g, " ");
        } else {
          // 같은 스트리트 두 번째+ 액션: 이름 없이, 다운카드+업카드 표시
          const combined = `${studDownPrefix}${upStr.trimEnd()}${studDownSuffix}`.trim();
          prefix = combined ? `${combined} ` : "";
        }
      } else if (isPreflop && isFirstForPlayer) {
        prefix = `${posLabel(e.position)} ${e.playerName} `;
        prefix += handText ? `${handText} ` : "(?) ";
      } else if (isDrawStreet && isFirstForPlayer) {
        const di = drawInfoText(hand, e.seatId, sIdx);
        prefix = `${e.playerName} ${di}${handText ? " " + handText : ""} `;
      } else if (isDrawStreet) {
        prefix = `${e.playerName} `;
      } else if (handText) {
        prefix = dupCardSeats.has(e.seatId) ? `${e.playerName} ${handText} ` : `${handText} `;
      } else {
        prefix = `${e.playerName} `;
      }
      parts.push(`${prefix}${label}${e.amountText ? " " + e.amountText : ""}`);
    });
    if (showAllFold) parts.push("ALL-FOLD");

    if (isPreflop) {
      lines.push(`${STREET_SHORT[street]}: ${parts.join(" / ")}`);
    } else {
      lines.push(`${STREET_SHORT[street]}: ${parts.join(" / ")}`.trimEnd());
    }
  });

  // 보드 한 줄을 맨 위에 (홀덤/PLO만)
  if (!isDrawGame && !isStudGame) {
    const boardStr = boardSegmentText(hand.board);
    if (boardStr) lines.unshift(`Board: ${boardStr}`);
  }

  // 이벤트명(게임 풀네임)을 로그 제일 위에 (운영자 토글로 끌 수 있음)
  const gameName = GAME_TYPES[hand.gameType]?.name;
  if (showEventName && gameName) lines.unshift(`[ ${gameName} ]`);

  lines.push("=".repeat(13));
  // Winner: 이름 + 최종 핸드 (드로우=마지막 스냅샷, 비드로우=딜/홀카드). 스플릿은 이름만.
  let winnerLine = `Winner: ${hand.winnerName || "—"}`;
  if (hand.winnerSeatId != null && !hand.isSplit) {
    let wh;
    if (isStudGame) {
      // 실제 액션이 있었던 마지막 스트리트까지 딜된 카드만 포함 (미진행 스트리트 카드 제외)
      const lastActiveIdx = SL.reduce((max, st, i) =>
        (hand.streets[st] || []).length > 0 ? i : max, -1);
      const dealtSlots = new Set();
      for (let i = 0; i <= lastActiveIdx; i++) {
        (STUD_SLOTS_BY_STREET[SL[i]] || []).forEach(s => dealtSlots.add(s));
      }
      const dealtCards = [];
      for (let s = 0; s < STUD_SLOTS.length; s++) {
        if (!dealtSlots.has(s)) continue;
        const c = studCardAt(hand, hand.winnerSeatId, s);
        if (c && c !== CARD_UNKNOWN) dealtCards.push(c);
      }
      wh = cardsToTextL(dealtCards);
    } else {
      wh = cardsToTextL(handAtStreet(hand, hand.winnerSeatId, SL.length - 1));
    }
    if (wh) winnerLine += ` ${wh}`;
  }
  lines.push(winnerLine);

  return lines.join("\n");
}

// 9시트 원형 배치
function getSeatPos(index, total = 9, rx = 39, ry = 31) {
  const angle = ((-90 + (index * 360) / total) * Math.PI) / 180;
  return { x: 50 + rx * Math.cos(angle), y: 50 + ry * Math.sin(angle) };
}

// ── C: 버튼 자리 기반 포지션 계산 (데드 스몰/데드 버튼 자동) ─────────────────
// 인원수별 포지션 풀 (BB~UTG). 데드가 없을 때의 정상 집합.
// early 자리는 앞=UTG, 뒤=CO 로 양끝 고정 (4명+ 에서는 항상 UTG가 첫 액션 자리).
const FULL_BY_COUNT = {
  3: ["D", "SB", "BB"],
  4: ["UTG", "D", "SB", "BB"],
  5: ["UTG", "CO", "D", "SB", "BB"],
  6: ["UTG", "HJ", "CO", "D", "SB", "BB"],
  7: ["UTG", "UTG+1", "HJ", "CO", "D", "SB", "BB"],
  8: ["UTG", "UTG+1", "MP", "HJ", "CO", "D", "SB", "BB"],
  9: ["UTG", "UTG+1", "MP", "MP+1", "HJ", "CO", "D", "SB", "BB"],
};

// 버튼 자리 기준으로 각 참여 시트의 포지션 계산.
// 반환: { positions: { [seatId]: "D"|"SB"|... }, dead: { button, small } }
// 핵심: 빈 시트(미점유)는 자리 계산에서 완전히 무시. 아웃(점유했다 나감)만 데드 발생.
function computePositions(seatsInOrder, buttonSeatId) {
  const result = { positions: {}, dead: { button: false, small: false } };

  // 점유 자리(사람이 앉음, 아웃 포함)만 물리 순서대로 추림
  const occ = seatsInOrder.filter(isOccupied);
  const playing = occ.filter(s => !s.out);
  if (playing.length < 2) return result;

  // 버튼이 점유 자리 배열에서 어디인지
  let btnPos = occ.findIndex(s => s.id === buttonSeatId);
  if (btnPos === -1) return result;
  const m = occ.length;

  // 점유 배열 기준 다음 인덱스
  const nextIdx = (i) => (i + 1) % m;

  // 헤즈업: playing 2명. 버튼이 아웃이면 비표준이지만 다음 playing을 D로.
  if (playing.length === 2) {
    // 버튼 자리부터 첫 playing = D, 그 다음 playing = BB
    let i = btnPos;
    while (occ[i].out) i = nextIdx(i);
    const dSeat = occ[i];
    let j = nextIdx(i);
    while (occ[j].out || occ[j].id === dSeat.id) j = nextIdx(j);
    result.positions[dSeat.id] = "D";
    result.positions[occ[j].id] = "BB";
    return result;
  }

  // 3명 이상
  // 버튼 자리가 아웃이면 데드버튼
  if (occ[btnPos].out) result.dead.button = true;

  // SB = 버튼 다음 점유 자리. 그 자리가 아웃이면 데드스몰.
  const sbPos = nextIdx(btnPos);
  let bbPos;
  if (!occ[sbPos].out) {
    result.positions[occ[sbPos].id] = "SB";
    // BB = SB 다음 playing
    let k = nextIdx(sbPos);
    while (occ[k].out) k = nextIdx(k);
    bbPos = k;
  } else {
    result.dead.small = true;
    // BB = SB자리(아웃) 다음 playing
    let k = nextIdx(sbPos);
    while (occ[k].out) k = nextIdx(k);
    bbPos = k;
  }
  result.positions[occ[bbPos].id] = "BB";

  // 버튼 자리에 사람 있으면(아웃 아님) D
  if (!occ[btnPos].out) result.positions[occ[btnPos].id] = "D";

  // BB 다음 playing부터 UTG, UTG+1, ... CO 순 배정.
  const assignedCount = Object.keys(result.positions).length;
  const remaining = playing.length - assignedCount;
  if (remaining > 0) {
    const refCount = Math.min(remaining + 3, 9);
    const refFull = FULL_BY_COUNT[refCount] || FULL_BY_COUNT[9];
    const earlyAll = refFull.filter(p => p !== "D" && p !== "SB" && p !== "BB");
    const earlyPositions = earlyAll.slice(0, remaining);
    let cur = bbPos;
    for (let i = 0; i < earlyPositions.length; i++) {
      cur = nextIdx(cur);
      while (occ[cur].out || result.positions[occ[cur].id]) cur = nextIdx(cur);
      result.positions[occ[cur].id] = earlyPositions[i];
    }
  }

  return result;
}

// 자리에 사람이 앉아있는지 (아웃이어도 점유 상태로 봄 = 데드버튼/데드스몰 표현)
function isOccupied(s) {
  return !!(s && s.active && s.name);
}

// OUT 자리는 N핸드 지나면 자동으로 비움(점유 해제) → 링에서 빠져 데드버튼/스몰 반복 방지
const OUT_VACATE_AFTER = 2;
// 새 핸드 시작 시 호출: OUT 자리 카운트++, 한계 초과 시 자리 비우기.
function applyOutAging(seats) {
  return seats.map(s => {
    if (!s.out) return s;
    const c = (s.outCount || 0) + 1;
    if (c > OUT_VACATE_AFTER) {
      // 자리 비우기 (빈 의자로)
      return { ...s, name: "", active: false, out: false, outCount: 0, position: undefined };
    }
    return { ...s, outCount: c };
  });
}

// 버튼을 다음 "사람 앉은" 자리로 전진.
// 빈 시트(active=false 또는 이름없음)는 건너뜀.
// 아웃 자리는 점유 상태라 버튼이 거기 멈춤 → 데드버튼/데드스몰 발생.
function advanceButton(seatsInOrder, buttonSeatId) {
  const n = seatsInOrder.length;
  const btnIdx = seatsInOrder.findIndex(s => s.id === buttonSeatId);
  if (btnIdx === -1) return buttonSeatId;
  for (let k = 1; k <= n; k++) {
    const idx = (btnIdx + k) % n;
    if (isOccupied(seatsInOrder[idx])) return seatsInOrder[idx].id;
  }
  return buttonSeatId;
}

// ── 액션 계산 순수 헬퍼 (hand 객체 + 스트리트 인덱스 기반) ──────────────────
// 컴포넌트 메서드와 logAction 내부 자동판정에서 공용으로 사용.
// 현재 스트리트에서 폴드/올인하지 않은(=액션 가능한) 플레이어
function computeActionablePlayers(hand, streetIdx) {
  if (!hand) return [];
  const SL = streetsOf(hand);
  const foldedIds = new Set();
  const allInIds = new Set();
  for (let i = 0; i < streetIdx; i++) {
    (hand.streets[SL[i]] || []).forEach(a => {
      if (a.action === "fold") foldedIds.add(a.seatId);
      if (a.action === "allin" || a.action === "allincall") allInIds.add(a.seatId);
    });
  }
  (hand.streets[SL[streetIdx]] || []).forEach(a => {
    if (a.action === "fold") foldedIds.add(a.seatId);
    if (a.action === "allin" || a.action === "allincall") allInIds.add(a.seatId);
  });
  return hand.seats.filter(s => !foldedIds.has(s.id) && !allInIds.has(s.id));
}

// 액션 순서로 정렬된 actionable
function computeSortedActionable(hand, streetIdx) {
  const players = computeActionablePlayers(hand, streetIdx);
  if (!hand) return players;
  const isHeadsUp = hand.seats.length === 2;
  if (isHeadsUp) {
    const d = players.find(p => p.position === "D");
    const bb = players.find(p => p.position === "BB");
    if (!d || !bb) return players;
    return streetIdx === 0 ? [d, bb] : [bb, d];
  }
  // 스터드: 포지션이 #N이라 좌석 id 순서로 정렬 (액션 순서 = 좌석 순서)
  if (GAME_TYPES[hand.gameType]?.stud) {
    return [...players].sort((a, b) => a.id - b.id);
  }
  const order = streetIdx === 0 ? POSITION_ORDER : POSTFLOP_ORDER;
  return [...players].sort((a, b) => {
    const ai = order.indexOf(a.position);
    const bi = order.indexOf(b.position);
    const aIdx = ai === -1 ? order.indexOf("D") : ai;
    const bIdx = bi === -1 ? order.indexOf("D") : bi;
    return aIdx - bIdx;
  });
}

// 다음 액션할 플레이어 (없으면 null = 라운드 완료)
function computeNextToAct(hand, streetIdx) {
  if (!hand) return null;
  const streetActions = hand.streets[streetsOf(hand)[streetIdx]];
  const actionable = computeSortedActionable(hand, streetIdx);

  let lastAggressorIdx = -1;
  let lastAggressorSeatId = null;
  for (let i = streetActions.length - 1; i >= 0; i--) {
    const a = streetActions[i];
    if (a.action === "open" || a.action === "bet" || a.action === "raise" || a.action === "allin") {
      lastAggressorIdx = i;
      lastAggressorSeatId = a.seatId;
      break;
    }
  }

  const respondedSeatIds = new Set();
  if (lastAggressorIdx >= 0) {
    respondedSeatIds.add(lastAggressorSeatId);
    for (let i = lastAggressorIdx + 1; i < streetActions.length; i++) {
      respondedSeatIds.add(streetActions[i].seatId);
    }
  } else {
    streetActions.forEach(a => respondedSeatIds.add(a.seatId));
  }

  const isHeadsUp = hand.seats.length === 2;
  const isStud = !!GAME_TYPES[hand.gameType]?.stud;

  if (isHeadsUp) {
    for (const p of actionable) {
      if (!respondedSeatIds.has(p.id)) return p;
    }
    return null;
  }

  // 스터드: bring-in/complete 흐름 + 보드 기준 첫 액션자. actionable(좌석순)에서 기준점 다음부터 순환.
  if (isStud) {
    // 어그레서: complete/bet/raise/allin (bring-in은 강제라 별도 기준점)
    let aggrIdx = -1, aggrId = null;
    for (let i = streetActions.length - 1; i >= 0; i--) {
      const a = streetActions[i].action;
      if (a === "complete" || a === "bet" || a === "raise" || a === "allin") { aggrIdx = i; aggrId = streetActions[i].seatId; break; }
    }
    const responded = new Set();
    let pivotId = null;
    if (aggrIdx >= 0) {
      pivotId = aggrId;
      responded.add(aggrId);
      for (let i = aggrIdx + 1; i < streetActions.length; i++) responded.add(streetActions[i].seatId);
    } else {
      // 정식 베팅 전: bring-in이 기준점(있으면). 그 외엔 아직 시작 전.
      const bi = streetActions.find(a => a.action === "bringin");
      streetActions.forEach(a => responded.add(a.seatId));
      pivotId = bi ? bi.seatId : null;
    }
    if (pivotId == null) {
      // 스트리트 시작 — 운영자가 지정한 첫 액션자(studFirstSeat[street]) 우선, 없으면 좌석순 첫
      const streetName = streetsOf(hand)[streetIdx];
      const manualId = hand.studFirstSeat?.[streetName];
      let startPos = 0;
      if (manualId != null) {
        const idx = actionable.findIndex(p => p.id === manualId);
        if (idx >= 0) startPos = idx;
      }
      for (let off = 0; off < actionable.length; off++) {
        const p = actionable[(startPos + off) % actionable.length];
        if (p && !responded.has(p.id)) return p;
      }
      return null;
    }
    const pivotPos = actionable.findIndex(p => p.id === pivotId);
    const base = pivotPos < 0 ? 0 : pivotPos;
    for (let off = 1; off <= actionable.length; off++) {
      const p = actionable[(base + off) % actionable.length];
      if (p && !responded.has(p.id)) return p;
    }
    return null;
  }

  if (lastAggressorIdx >= 0) {
    const aggressorPos = streetActions[lastAggressorIdx].position;
    const order = streetIdx === 0 ? POSITION_ORDER : POSTFLOP_ORDER;
    const aggrOrderIdx = order.indexOf(aggressorPos);
    for (let offset = 1; offset <= order.length; offset++) {
      const targetPos = order[(aggrOrderIdx + offset) % order.length];
      const player = actionable.find(p => p.position === targetPos);
      if (player && !respondedSeatIds.has(player.id)) return player;
    }
  } else {
    for (const p of actionable) {
      if (!respondedSeatIds.has(p.id)) return p;
    }
  }
  return null;
}

// ── 드로우 게임 헬퍼 ───────────────────────────────────────────────────────
// 해당 스트리트가 드로우(교환) 스트리트인가 (PREFLOP=프리드로우 베팅이라 제외)
function streetIsDraw(hand, streetIdx) {
  if (!hand || !GAME_TYPES[hand.gameType]?.draw) return false;
  return streetIdx >= 1;
}
// seatId의 streetIdx 시점 핸드: 가장 최근 드로우 스냅샷, 없으면 딜 핸드
function handAtStreet(hand, seatId, streetIdx) {
  if (!hand) return null;
  const SL = streetsOf(hand);
  for (let k = streetIdx; k >= 1; k--) {
    const snap = hand.roundHole?.[SL[k]]?.[seatId];
    if (snap && snap.length) return snap;
  }
  return hand.holeCards?.[seatId] || null;
}
// 바뀐 카드 수 = newHand 중 prevHand에 없는 카드(멀티셋 차). prev 없으면 채워진 장수.
function drawCount(prevHand, newHand) {
  if (!newHand) return 0;
  const filled = newHand.filter(c => c && c !== CARD_UNKNOWN);
  if (!prevHand) return filled.length;
  const pool = prevHand.filter(Boolean).map(c => c);
  let changed = 0;
  for (const c of newHand) {
    if (!c || c === CARD_UNKNOWN) continue;
    const idx = pool.indexOf(c);
    if (idx >= 0) pool.splice(idx, 1);
    else changed++;
  }
  return changed;
}
// 드로우 스트리트 교환 라벨: "PAT" | "3D". (이전 라운드 핸드 대비)
function drawInfoText(hand, seatId, streetIdx) {
  if (!streetIsDraw(hand, streetIdx)) return "";
  const prev = handAtStreet(hand, seatId, streetIdx - 1);
  // 이전 라운드 핸드가 미상(딜 미입력 등)이면 교환수를 알 수 없음 → PAT 취급
  const prevReal = (prev || []).filter(c => c && c !== CARD_UNKNOWN).length;
  if (prevReal === 0) return "PAT";
  const now = handAtStreet(hand, seatId, streetIdx);
  const n = drawCount(prev, now);
  return n === 0 ? "PAT" : `D${n}`;
}

// ══════════════════════════════════════════════════════════════════════════════
// 홀덤 핸드 평가 (승률 계산용 순수 로직)
// 카드 문자열 "Kh" → {r:13, s:1}. 문양 미정('x')·'?'·null 은 파싱 불가(null).
// ══════════════════════════════════════════════════════════════════════════════
const SUIT_IDX = { s: 0, h: 1, d: 2, c: 3 };
function cardIsSuited(c) { return !!c && c.length === 2 && SUIT_IDX[c[1]] !== undefined && !!RANK_VALUE[c[0]]; }
function parseCard(c) {
  if (!cardIsSuited(c)) return null;
  return { r: RANK_VALUE[c[0]], s: SUIT_IDX[c[1]] };
}

// 5장 점수: 높을수록 강함. 정렬/객체 없이 재사용 버퍼로 계산(승률 루프 핫패스).
const _rc = new Int32Array(15);
const _tb = new Int32Array(5);
const _h5 = new Array(5);
function score5(cs) {
  for (let r = 2; r <= 14; r++) _rc[r] = 0;
  const s0 = cs[0].s; let flush = true;
  for (let i = 0; i < 5; i++) { _rc[cs[i].r]++; if (cs[i].s !== s0) flush = false; }

  let straightHigh = 0;
  for (let hi = 14; hi >= 6; hi--) {
    if (_rc[hi] && _rc[hi - 1] && _rc[hi - 2] && _rc[hi - 3] && _rc[hi - 4]) { straightHigh = hi; break; }
  }
  if (!straightHigh && _rc[14] && _rc[5] && _rc[4] && _rc[3] && _rc[2]) straightHigh = 5; // 휠

  let c4 = 0, c3 = 0, c2 = 0;
  for (let r = 2; r <= 14; r++) { const c = _rc[r]; if (c === 4) c4++; else if (c === 3) c3++; else if (c === 2) c2++; }

  let cat;
  if (flush && straightHigh) cat = 8;
  else if (c4) cat = 7;
  else if (c3 && c2) cat = 6;
  else if (flush) cat = 5;
  else if (straightHigh) cat = 4;
  else if (c3) cat = 3;
  else if (c2 >= 2) cat = 2;
  else if (c2 === 1) cat = 1;
  else cat = 0;

  let n = 0;
  if (cat === 8 || cat === 4) { _tb[0] = straightHigh; n = 1; }
  else { for (let c = 4; c >= 1; c--) for (let r = 14; r >= 2; r--) if (_rc[r] === c) _tb[n++] = r; }

  let score = cat;
  for (let i = 0; i < 5; i++) score = score * 15 + (i < n ? _tb[i] : 0);
  return score;
}

// 5~7장 중 best 5장 점수 (모든 C(n,5) 조합). 5장 버퍼 재사용.
function scoreBest(cs) {
  const n = cs.length;
  if (n < 5) return 0;
  if (n === 5) return score5(cs);
  let best = 0;
  for (let a = 0; a < n - 4; a++)
    for (let b = a + 1; b < n - 3; b++)
      for (let c = b + 1; c < n - 2; c++)
        for (let d = c + 1; d < n - 1; d++)
          for (let e = d + 1; e < n; e++) {
            _h5[0] = cs[a]; _h5[1] = cs[b]; _h5[2] = cs[c]; _h5[3] = cs[d]; _h5[4] = cs[e];
            const s = score5(_h5);
            if (s > best) best = s;
          }
  return best;
}

function cardKey(rs) { return rs.r * 4 + rs.s; }
function buildDeck(usedSet) {
  const deck = [];
  for (let r = 2; r <= 14; r++) for (let s = 0; s < 4; s++) {
    const k = r * 4 + s;
    if (!usedSet.has(k)) deck.push({ r, s });
  }
  return deck;
}

// 홀덤 승률(equity) 계산. 모든 스트리트 자동 분기(완전열거/몬테카를로).
// hands: [{seatId, cards:[c1,c2]}] (살아있는 플레이어, 문양까지 확정), board: [c..] (0~5, 일부 미입력 가능)
// 반환: { ok, reason?, players:[{seatId, win, tie, equity}], iterations, exact }
function computeEquity(hands, board, opts = {}) {
  const used = new Set();
  const parsed = [];
  for (const h of (hands || [])) {
    const pc = (h.cards || []).filter(cardIsSuited).map(parseCard);
    if (pc.length !== 2) return { ok: false, reason: "hole" };
    for (const c of pc) { const k = cardKey(c); if (used.has(k)) return { ok: false, reason: "dup" }; used.add(k); }
    parsed.push({ seatId: h.seatId, cards: pc });
  }
  if (parsed.length < 2) return { ok: false, reason: "players" };
  const boardKnown = (board || []).filter(cardIsSuited).map(parseCard);
  for (const c of boardKnown) { const k = cardKey(c); if (used.has(k)) return { ok: false, reason: "dup" }; used.add(k); }
  if (boardKnown.length > 5) return { ok: false, reason: "board" };

  const need = 5 - boardKnown.length;
  const deck = buildDeck(used);
  const wins = new Array(parsed.length).fill(0);     // 단독 승 횟수
  const tieHits = new Array(parsed.length).fill(0);  // 스플릿에 낀 횟수(빈도)
  const tieShare = new Array(parsed.length).fill(0); // 스플릿 지분 합(1/n)
  let iterations = 0;

  const np = parsed.length;
  const _isBest = new Int8Array(np);
  const buf7 = new Array(7); // 재사용 버퍼 (홀2 + 보드)
  const settle = (full) => {
    let best = -1, bestN = 0, bestFirst = -1;
    const flen = full.length;
    buf7.length = 2 + flen;
    for (let i = 0; i < np; i++) {
      const hc = parsed[i].cards;
      buf7[0] = hc[0]; buf7[1] = hc[1];
      for (let j = 0; j < flen; j++) buf7[2 + j] = full[j];
      const s = scoreBest(buf7);
      if (s > best) { best = s; bestN = 1; bestFirst = i; }
      else if (s === best) bestN++;
      _isBest[i] = 0; _score[i] = s;
    }
    if (bestN === 1) wins[bestFirst]++;
    else { const sh = 1 / bestN; for (let i = 0; i < np; i++) if (_score[i] === best) { tieHits[i]++; tieShare[i] += sh; } }
    iterations++;
  };
  const _score = new Float64Array(np);

  const comb = (n, k) => { let r = 1; for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1); return Math.round(r); };
  const total = need === 0 ? 1 : comb(deck.length, need);
  const exact = total <= (opts.exactMax || 200000);

  if (need === 0) {
    settle(boardKnown);
  } else if (exact) {
    const full = boardKnown.slice(); const base = boardKnown.length; const pickIdx = [];
    const rec = (start, depth) => {
      if (depth === need) { for (let i = 0; i < need; i++) full[base + i] = deck[pickIdx[i]]; settle(full); return; }
      for (let i = start; i <= deck.length - (need - depth); i++) { pickIdx.push(i); rec(i + 1, depth + 1); pickIdx.pop(); }
    };
    rec(0, 0);
  } else {
    const N = opts.samples || 50000;
    const dl = deck.length;
    const full = boardKnown.slice(); const base = boardKnown.length;
    for (let t = 0; t < N; t++) {
      for (let k = 0; k < need; k++) { // 러닝 부분 셔플 → Set 없이 중복없는 샘플
        const j = k + ((Math.random() * (dl - k)) | 0);
        const tmp = deck[k]; deck[k] = deck[j]; deck[j] = tmp;
        full[base + k] = deck[k];
      }
      settle(full);
    }
  }

  return {
    ok: true, iterations, exact,
    players: parsed.map((h, i) => ({
      seatId: h.seatId,
      win: wins[i] / iterations,                          // 단독 승 빈도
      tie: tieHits[i] / iterations,                       // 스플릿 빈도
      equity: (wins[i] + tieShare[i]) / iterations,       // 지분(1/n 반영)
    })),
  };
}

// 두 자리의 내용(name/active/out)만 교체. id/position은 의자에 남음(포지션은 자리 기준 자동계산).
function swapSeatContents(seats, idA, idB) {
  const a = seats.find(x => x.id === idA);
  const b = seats.find(x => x.id === idB);
  if (!a || !b || idA === idB) return seats;
  return seats.map(s => {
    if (s.id === idA) return { ...s, name: b.name, active: b.active, out: !!b.out };
    if (s.id === idB) return { ...s, name: a.name, active: a.active, out: !!a.out };
    return s;
  });
}

// 시트 초기화 (기본 포지션 미리 할당)
const initSeats = () =>
  Array.from({ length: 9 }, (_, i) => ({
    id: i,
    name: "",
    position: POSITION_ORDER[i],
    active: false,
  }));

// ══════════════════════════════════════════════════════════════════════════════
// 액션 배지
// ══════════════════════════════════════════════════════════════════════════════
function ActionBadge({ actionId, size = "sm" }) {
  const a = ACTIONS.find(x => x.id === actionId);
  if (!a) return null;
  return (
    <span style={{
      background: a.color + "22",
      color: a.color,
      border: `1px solid ${a.color}55`,
      fontSize: size === "sm" ? 9 : 11,
      fontWeight: 900,
      padding: size === "sm" ? "1px 6px" : "3px 9px",
      borderRadius: 4,
      letterSpacing: 1,
      fontFamily: MONO,
    }}>{a.label}</span>
  );
}

// 베팅 금액 칩 (액션 뱃지 뒤에 붙음)
function AmountChip({ text, size = "sm" }) {
  if (!text) return null;
  return (
    <span style={{
      marginLeft: 4,
      color: "#cbd5e1",
      fontSize: size === "sm" ? 10 : 12,
      fontWeight: 900,
      fontFamily: MONO,
    }}>{text}</span>
  );
}

// 액션 로그 한 항목 (포지션/이름/카드 + 라벨/N-BET + 금액 + 구분자). 3곳 공용.
// size: "sm"(라이브 로그) | "md"(히스토리/리캡)
function ActionEntry({ hand, entries, i, isPreflop, isFirstForPlayer, dupCardSeats, size = "sm", streetIdx = 0 }) {
  const e = entries[i];
  const isStudGame = !!GAME_TYPES[hand.gameType]?.stud;
  const cardsText = isStudGame ? null : cardsToTextL(handAtStreet(hand, e.seatId, streetIdx));
  // 스터드: 누적 업카드 표기 [Kh 2d]
  const upCards = isStudGame ? studUpCards(hand, e.seatId, streetIdx) : [];
  const upText = upCards.map(cardLabelL).join(" ");
  const label = getActionLabel(entries, i);
  const isNBet = label && label.endsWith("-BET");
  const isDrawStreet = streetIsDraw(hand, streetIdx);
  const showName = dupCardSeats?.has(e.seatId) && !(isPreflop && isFirstForPlayer);
  const nameSize = size === "md" ? 12 : 11;
  const cardsSize = size === "md" ? 12 : 11;
  const wrapStyle = size === "md"
    ? { marginRight: 6, whiteSpace: "nowrap" }
    : { whiteSpace: "nowrap" };
  const nameEl = (muted) => (
    <span style={{ color: muted ? "#94a3b8" : "#e2e8f0", fontSize: nameSize, fontWeight: 700 }}>{e.playerName}</span>
  );
  const cardsEl = cardsText && (
    <span style={{ color: "#fbbf24", fontSize: cardsSize, fontWeight: 900, fontFamily: MONO }}>{cardsText}</span>
  );
  // 스터드 업카드 칩 [Kh 2d]
  const upEl = upText ? (
    <span style={{ color: "#fbbf24", fontSize: cardsSize, fontWeight: 900, fontFamily: MONO }}>[{upText}]</span>
  ) : null;

  let lead;
  if (isStudGame) {
    // 스터드: 첫 등장만 이름 표시, 이후 스트릿에선 생략
    lead = (<>
      {isFirstForPlayer && <>{nameEl(false)}{" "}</>}{upEl}{upText && " "}
    </>);
  } else if (isPreflop && isFirstForPlayer) {
    lead = (<>
      <span style={{ color: "#10b981", fontSize: 11, fontWeight: 700 }}>{posLabel(e.position)}</span>{" "}
      {nameEl(false)}{" "}{cardsEl}{cardsText && " "}
    </>);
  } else if (isDrawStreet && isFirstForPlayer) {
    lead = (<>
      {nameEl(false)}{" "}
      <span style={{ color: "#38bdf8", fontSize: cardsSize, fontWeight: 900, fontFamily: MONO }}>
        {drawInfoText(hand, e.seatId, streetIdx)}
      </span>{" "}{cardsEl}{cardsText && " "}
    </>);
  } else if (isDrawStreet) {
    lead = <>{nameEl(true)}{" "}</>;
  } else if (cardsText) {
    lead = (<>{showName && <>{nameEl(true)}{" "}</>}{cardsEl}{" "}</>);
  } else {
    lead = <>{nameEl(true)}{" "}</>;
  }

  return (
    <span style={wrapStyle}>
      {lead}
      {isNBet ? (
        <span style={{
          background: "#ef4444" + "22", color: "#ef4444",
          border: "1px solid #ef444455", fontSize: 9, fontWeight: 900,
          padding: "1px 6px", borderRadius: 4, letterSpacing: 1, fontFamily: MONO,
        }}>{label}</span>
      ) : (
        <ActionBadge actionId={e.action} size="sm" />
      )}
      {e.amountText && <AmountChip text={e.amountText} size="sm" />}
      {i < entries.length - 1 && (
        <span style={{ color: "#536583", margin: "0 4px" }}>/</span>
      )}
    </span>
  );
}

// 한 스트리트 한 줄 렌더 (3곳 공용: 라이브 로그 sm / 히스토리·리캡 md).
// 라벨 + (비드로우 보드) + ActionEntry들. 도달 안 한 스트리트는 null.
function StreetLine({ hand, streetIdx, dupCardSeats, size = "sm", showEmpty = false }) {
  const SL = streetsOf(hand);
  const street = SL[streetIdx];
  const rawEntries = hand.streets?.[street] || [];
  const isPreflop = streetIdx === 0;
  const isDrawStreet = streetIsDraw(hand, streetIdx);
  const isHeadsUp = (hand.seats?.length || 0) === 2;
  const isStudGame = !!GAME_TYPES[hand.gameType]?.stud;

  // Bug 1 fix: 스터드는 이전 스트릿에서 비폴드 액션한 좌석을 추적해 filterFirstFolds에 전달
  const studPrevActedSeats = isStudGame ? (() => {
    const s = new Set();
    for (let i = 0; i < streetIdx; i++) {
      (hand.streets?.[SL[i]] || []).forEach(e => { if (e.action !== "fold") s.add(e.seatId); });
    }
    return s;
  })() : null;

  let entries, showAllFold = false;
  if (isPreflop) {
    const r = processPreflopEntries(rawEntries, isHeadsUp);
    entries = r.entries;
    showAllFold = isStudGame ? studThirdEndedByFold(hand) : preflopEndedByFold(hand);
  } else {
    entries = filterFirstFolds(rawEntries, isHeadsUp, studPrevActedSeats);
    if (isStudGame && streetIdx === 0) showAllFold = studThirdEndedByFold(hand);
  }

  // 스킵: showEmpty면 빈 스트리트도 라벨만. 아니면 액션 없는 스트리트 생략. (보드는 상단 BoardLine에서)
  if (!showEmpty && entries.length === 0 && !showAllFold) return null;

  const dup = dupCardSeats || computeDupCardSeats(hand);

  // Bug 2 fix: 스터드는 핸드 전체에서 이미 나온 좌석을 seen에 선 반영
  const seen = (() => {
    const s = new Set();
    if (isStudGame) {
      for (let i = 0; i < streetIdx; i++) {
        (hand.streets?.[SL[i]] || []).forEach(e => s.add(e.seatId));
      }
    }
    return s;
  })();

  const items = entries.map((e, i) => {
    const first = !seen.has(e.seatId);
    seen.add(e.seatId);
    return (
      <ActionEntry key={i} hand={hand} entries={entries} i={i}
        isPreflop={isPreflop} isFirstForPlayer={first}
        dupCardSeats={dup} size={size} streetIdx={streetIdx} />
    );
  });
  if (showAllFold) {
    items.push(
      <span key="all-fold" style={{
        background: "#7e8ca0" + "22", color: "#94a3b8",
        border: "1px solid #7e8ca055", fontSize: 9, fontWeight: 900,
        padding: "1px 6px", borderRadius: 4, letterSpacing: 1, fontFamily: MONO,
      }}>ALL-FOLD</span>
    );
  }

  if (size === "md") {
    return (
      <div style={{ marginBottom: 8, lineHeight: 1.8 }}>
        <span style={{ color: "#7e8ca0", fontSize: 11, fontWeight: 700, letterSpacing: 2 }}>{STREET_SHORT[street]}:{" "}</span>
        {items}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center", fontSize: 11, marginBottom: 4 }}>
      <span style={{ color: "#64748b", fontWeight: 700, fontSize: 9, minWidth: 34, letterSpacing: 1 }}>{STREET_SHORT[street]}</span>
      {items}
    </div>
  );
}

// 보드 한 줄: "Board  K♦ Q♥ 7♥ | 2♠ | 9♣" (플랍 | 턴 | 리버). 비드로우·보드 있을 때만.
function BoardLine({ hand, size = "md" }) {
  if (GAME_TYPES[hand.gameType]?.draw || GAME_TYPES[hand.gameType]?.stud) return null;
  const board = hand.board || [];
  const segs = [[0, 3], [3, 4], [4, 5]];
  const segCards = [];
  for (const [a, b] of segs) {
    const cards = [];
    for (let i = a; i < b; i++) if (board[i] && board[i] !== CARD_UNKNOWN) cards.push(board[i]);
    if (cards.length) segCards.push(cards);
  }
  if (!segCards.length) return null;
  return (
    <div style={{ marginBottom: size === "md" ? 10 : 6, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 4 }}>
      <span style={{ color: "#7e8ca0", fontSize: size === "md" ? 11 : 9, fontWeight: 700, letterSpacing: 2, marginRight: 4 }}>Board</span>
      {segCards.map((cards, si) => (
        <React.Fragment key={si}>
          {si > 0 && <span style={{ color: "#475569", fontSize: size === "md" ? 16 : 13, margin: "0 3px" }}>|</span>}
          {cards.map((c, ci) => <CardChip key={ci} card={c} size={size === "md" ? "md" : "sm"} letters />)}
        </React.Fragment>
      ))}
    </div>
  );
}

// Winner 줄 (=====) + 이름 + 최종핸드. 히스토리/리캡 공용.
function WinnerLine({ hand, size = "md" }) {
  const SL = streetsOf(hand);
  const wh = (hand.winnerSeatId != null && !hand.isSplit)
    ? cardsToTextL(handAtStreet(hand, hand.winnerSeatId, SL.length - 1)) : "";
  return (
    <>
      <div style={{ borderTop: "1px dashed #536583", marginTop: size === "md" ? 10 : 8, paddingTop: 8, color: "#7e8ca0", fontSize: 10, letterSpacing: 2 }}>
        {"=".repeat(13)}
      </div>
      <div style={{ marginTop: 6 }}>
        <span style={{ color: "#7e8ca0", fontSize: 11, letterSpacing: 2 }}>Winner: </span>
        <span style={{ color: "#f59e0b", fontSize: size === "md" ? 14 : 13, fontWeight: 900 }}>{hand.winnerName || "—"}</span>
        {wh && <span style={{ color: "#fbbf24", fontSize: size === "md" ? 14 : 13, fontWeight: 900, fontFamily: MONO, marginLeft: 6 }}>{wh}</span>}
      </div>
    </>
  );
}

// 핸드 전체 로그 (히스토리/리캡 공용): 비드로우 Cards 요약 + 스트리트들 + Winner.
function HandLog({ hand, size = "md" }) {
  const isDraw = !!GAME_TYPES[hand.gameType]?.draw;
  const isStudHand = !!GAME_TYPES[hand.gameType]?.stud;
  const dup = computeDupCardSeats(hand);
  const showCards = !isDraw && !isStudHand && Object.entries(hand.holeCards || {}).filter(([_, c]) => (c || []).some(Boolean)).length > 0;
  return (
    <>
      <BoardLine hand={hand} size={size} />
      {showCards && (
        <div style={{ marginBottom: 10 }}>
          <span style={{ color: "#7e8ca0", fontSize: 10, letterSpacing: 2 }}>Cards: </span>
          {hand.seats.filter(s => hand.holeCards?.[s.id]?.some(Boolean)).map(s => (
            <span key={s.id} style={{ marginRight: 10, display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span style={{ color: "#94a3b8", fontSize: 11 }}>{s.name}</span>
              {hand.holeCards[s.id].map((c, ci) => <CardChip key={ci} card={c} size="sm" letters />)}
            </span>
          ))}
        </div>
      )}
      {streetsOf(hand).map((s, i) => (
        <StreetLine key={s} hand={hand} streetIdx={i} dupCardSeats={dup} size={size} showEmpty />
      ))}
      <WinnerLine hand={hand} size={size} />
    </>
  );
}



// ══════════════════════════════════════════════════════════════════════════════
// 카드 시각화
// ══════════════════════════════════════════════════════════════════════════════
function CardChip({ card, size = "sm", letters = false }) {
  if (!card) return null;
  const suit = SUITS.find(s => s.id === card[1]);
  const isNoSuit = !suit; // 'x' 같은 placeholder
  const w = size === "sm" ? 22 : 32;
  const h = size === "sm" ? 30 : 44;

  // 슈트 없을 때: 랭크만 가운데에 크게
  if (isNoSuit) {
    return (
      <div style={{
        width: w, height: h,
        background: "#fafafa",
        border: "1px solid #94a3b8",
        borderRadius: size === "sm" ? 3 : 5,
        display: "inline-flex",
        alignItems: "center", justifyContent: "center",
        color: "#0f172a",
        fontFamily: MONO,
        fontWeight: 900,
        fontSize: size === "sm" ? 15 : 22,
        lineHeight: 1,
      }}>{card[0]}</div>
    );
  }

  return (
    <div style={{
      width: w, height: h,
      background: "#fafafa",
      border: "1px solid #94a3b8",
      borderRadius: size === "sm" ? 3 : 5,
      display: "inline-flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      color: suit.color === "#f87171" ? "#dc2626"
           : suit.color === "#fbbf24" ? "#2563eb"
           : suit.color === "#86efac" ? "#16a34a" : "#0f172a",
      fontFamily: MONO,
      fontWeight: 900,
      lineHeight: 1,
      gap: 1,
    }}>
      <span style={{ fontSize: size === "sm" ? 10 : 14 }}>{card[0]}</span>
      <span style={{ fontSize: size === "sm" ? 9 : 13 }}>{letters ? card[1] : suit.label}</span>
    </div>
  );
}

// 스터드 카드 7칸 그리드 (다운3 + 업4). 각 칸 탭 → onPick(slot). 어느 칸이든 언제든 수정.
function StudCardGrid({ hand, seatId, currentStreetIdx, onPick, size = "md" }) {
  const SL = streetsOf(hand);
  const sw = size === "sm" ? 22 : 26;
  const sh = Math.round(sw * 40 / 30);
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "flex-end" }}>
      {STUD_SLOTS.map((meta, slot) => {
        const card = studCardAt(hand, seatId, slot);
        const sIdx = SL.indexOf(meta.street);
        const isFuture = sIdx > currentStreetIdx;
        const isCurrent = sIdx === currentStreetIdx;
        const isUp = meta.face === "up";
        return (
          <button key={slot}
            onClick={() => onPick(slot)}
            title={`${STREET_SHORT[meta.street]} ${isUp ? "업" : "다운"}카드 입력/수정`}
            style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
              background: "transparent", border: "none", padding: 0,
              cursor: "pointer", opacity: isFuture ? 0.42 : 1,
            }}>
            <span style={{ fontSize: 7, fontWeight: 800, letterSpacing: 0.3,
              color: isCurrent ? "#fbbf24" : isUp ? "#38bdf8" : "#64748b" }}>
              {STREET_SHORT[meta.street]}{isUp ? "▲" : "▽"}
            </span>
            <div style={{
              width: sw, height: sh, borderRadius: 4,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: card ? (isUp ? "#fafafa" : "#0a1c2c") : "#020a14",
              border: isCurrent
                ? `2px solid #fbbf24`
                : card
                  ? (isUp ? "1px solid #2a4a6e" : "1px solid #1e3a52")
                  : `1.5px dashed ${isUp ? "#38bdf8" : "#475569"}`,
              boxShadow: isCurrent ? "0 0 8px rgba(251,191,36,.5)" : (!card && !isFuture && isUp ? "0 0 6px rgba(56,189,248,.25)" : "none"),
            }}>
              {card
                ? <CardChip card={card} size="sm" />
                : <span style={{ color: isUp ? "#38bdf8" : "#475569", fontSize: 11 }}>?</span>}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 카드 선택 모달 (랭크만, 슈트 무시)
// ══════════════════════════════════════════════════════════════════════════════
function CardPickerModal({ open, onClose, onSelectBoth, initialCards = [null, null], cardCount = 2, initialActiveSlot = null, slotMeta = null }) {
  const makeEmpty = () => Array(cardCount).fill(null);
  const [picks, setPicks] = useState(makeEmpty);
  const [activeSlot, setActiveSlot] = useState(0);

  // 최신 값을 키보드 입력에서 stale 없이 읽기 위한 ref (부수효과를 setState 업데이터 밖으로)
  const activeSlotRef = React.useRef(0);
  const picksRef = React.useRef([]);
  const pendingSuitSlotRef = React.useRef(null); // 직전에 랭크 넣은 슬롯 (슈트키 대상)
  activeSlotRef.current = activeSlot;
  picksRef.current = picks;

  useEffect(() => {
    if (open) {
      // 기존 카드(길이 다를 수 있음)를 cardCount 길이에 맞춰 로드
      const loaded = makeEmpty().map((_, i) => initialCards[i] || null);
      setPicks(loaded);
      picksRef.current = loaded;
      const firstEmpty = loaded.findIndex(c => !c);
      const init = (initialActiveSlot != null)
        ? Math.max(0, Math.min(cardCount - 1, initialActiveSlot))
        : (firstEmpty === -1 ? 0 : firstEmpty);
      setActiveSlot(init);
      activeSlotRef.current = init;
      pendingSuitSlotRef.current = (loaded[init] && loaded[init] !== CARD_UNKNOWN) ? init : null;
    }
  }, [open]);

  // 편집 슬롯을 좌우로 이동 (←→). 이동한 슬롯에 카드가 있으면 슈트키 대상도 그 슬롯으로.
  const moveSlot = (dir) => {
    const n = cardCount;
    let s = (activeSlotRef.current ?? 0) + dir;
    s = Math.max(0, Math.min(n - 1, s));
    activeSlotRef.current = s;
    setActiveSlot(s);
    pendingSuitSlotRef.current = (picksRef.current[s] && picksRef.current[s] !== CARD_UNKNOWN) ? s : null;
  };

  // 확정: 빈 슬롯은 ? 로 채워 저장 (부분입력 허용)
  const commit = (arr) => {
    onSelectBoth(arr.map(c => c || CARD_UNKNOWN));
    setPicks(makeEmpty());
    setActiveSlot(0);
  };

  // 한 슬롯 채우고 다음 빈 슬롯으로 이동 (없으면 그대로). ref 기준이라 rapid 입력 안전.
  // card = 완성된 카드 문자열 ('Ax' 등) 또는 CARD_UNKNOWN('?')
  const fillSlot = (slotArg, card) => {
    const slot = slotArg != null ? slotArg : activeSlotRef.current;
    const next = picksRef.current.map((c, i) => (i === slot ? card : c));
    picksRef.current = next;
    setPicks(next);
    const na = next.findIndex(c => !c);
    setActiveSlot(na === -1 ? slot : na);
  };

  // 랭크 넣고 그 슬롯을 "슈트 대기"로 기억 (직후 슈트키/버튼이 이 슬롯에 적용)
  const placeRank = (slotArg, rank) => {
    const slot = slotArg != null ? slotArg : activeSlotRef.current;
    fillSlot(slot, rank + "x");
    pendingSuitSlotRef.current = slot;
  };

  // 슈트 지정: 직전 랭크 슬롯의 슈트를 교체 (랭크 있어야 적용). pending 유지 → 다른 슈트로 정정 가능
  const setSuit = (suitId) => {
    const slot = pendingSuitSlotRef.current;
    if (slot == null) return;
    const cur = picksRef.current[slot];
    if (!cur || cur === CARD_UNKNOWN) return;
    const next = picksRef.current.map((c, i) => (i === slot ? cur[0] + suitId : c));
    picksRef.current = next;
    setPicks(next);
  };

  // 카드 모달 키보드 입력
  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => {
      const k = e.key.toLowerCase();
      if (k === "enter" || k === " ") { e.preventDefault(); commit(picksRef.current); return; }
      if (k === "escape") { e.preventDefault(); onClose(); return; }
      if (k === "arrowleft")  { e.preventDefault(); moveSlot(-1); return; }
      if (k === "arrowright") { e.preventDefault(); moveSlot(1); return; }
      // ? 입력: '0' / '/' / '?'
      if (k === "0" || k === "/" || k === "?") { e.preventDefault(); fillSlot(null, CARD_UNKNOWN); pendingSuitSlotRef.current = null; return; }
      // 슈트키: 직전 랭크 카드에 문양 지정 (랭크키와 안 겹침)
      if (k === "h" || k === "d" || k === "c" || k === "s") { e.preventDefault(); setSuit(k); return; }
      const lookupKey = k === "1" ? "a" : k; // '1' 도 A
      const gi = RANK_KEYS.indexOf(lookupKey);
      if (gi >= 0) { e.preventDefault(); placeRank(null, RANK_GRID[gi]); } // 슈트 미지정(placeholder 'x')
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onSelectBoth, onClose, cardCount]);

  if (!open) return null;

  const pickRank = (rank) => placeRank(activeSlot, rank);
  const pickUnknown = () => { fillSlot(activeSlot, CARD_UNKNOWN); pendingSuitSlotRef.current = null; };

  const confirm = () => commit(picks);

  const clearAll = () => {
    const empty = makeEmpty();
    picksRef.current = empty;
    setPicks(empty);
    setActiveSlot(0);
  };

  const clearSlot = (slot) => {
    const next = picksRef.current.map((c, i) => (i === slot ? null : c));
    picksRef.current = next;
    setPicks(next);
    setActiveSlot(slot);
  };

  // 부분입력 허용 → 1장 이상이면 확정 가능 (A규칙: ?만 채워 액션도 허용되지만, 빈 확정 오조작 방지)
  const canConfirm = picks.some(Boolean);
  // 미리보기 카드 크기를 장수에 맞춰 축소
  const pvW = cardCount <= 2 ? 70 : cardCount <= 4 ? 56 : cardCount <= 5 ? 46 : 38;
  const pvH = Math.round(pvW * 96 / 70);
  const pvFont = cardCount <= 2 ? 42 : cardCount <= 4 ? 32 : 26;

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "rgba(0,0,0,.85)",
      zIndex: 100,
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 16,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#050d1a",
        border: "1px solid #0f1f35",
        borderRadius: 14, padding: 18,
        maxWidth: 420, width: "100%",
      }}>
        <div style={{
          color: "#10b981", fontSize: 11, letterSpacing: 2, marginBottom: 14,
          textAlign: "center",
        }}>카드 선택 · 랭크+문양 · {cardCount}장{cardCount > 1
          ? <span style={{ color: "#fbbf24" }}>{`  ·  ←→ 이동  ·  ${activeSlot + 1}/${cardCount}`}{slotMeta && slotMeta[activeSlot] ? ` (${slotMeta[activeSlot].label}${slotMeta[activeSlot].face === "up" ? "▲" : "▽"})` : ""}</span>
          : ""}</div>

        {/* 선택된 카드 미리보기 (cardCount장) */}
        <div style={{
          display: "flex", justifyContent: "center", gap: 10,
          marginBottom: 18, flexWrap: "wrap",
        }}>
          {picks.map((p, i) => {
            const isActive = activeSlot === i;
            const meta = slotMeta && slotMeta[i];
            return (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                {meta && (
                  <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: 0.3, color: isActive ? "#fbbf24" : (meta.face === "up" ? "#38bdf8" : "#64748b") }}>
                    {meta.label}{meta.face === "up" ? "▲" : "▽"}
                  </span>
                )}
                <button
                  onClick={() => p ? clearSlot(i) : setActiveSlot(i)}
                  style={{
                    width: pvW, height: pvH,
                    background: p ? "#fafafa" : (isActive ? "#161203" : "transparent"),
                    border: isActive
                      ? "3px solid #fbbf24"
                      : `2.5px ${p ? "solid #2a4a6e" : "dashed #1a2d45"}`,
                    borderRadius: 8,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "#0f172a",
                    fontFamily: MONO,
                    fontWeight: 900,
                    fontSize: pvFont,
                    cursor: "pointer",
                    boxShadow: isActive ? "0 0 14px rgba(251,191,36,.55)" : "none",
                    transform: isActive ? "translateY(-2px)" : "none",
                    transition: "transform .08s",
                    animation: isActive && !p ? "cardPulse 1.2s infinite" : "none",
                  }}
                >
                  {p ? (
                    <span style={{ color: SUIT_COLOR[p[1]] || "#0f172a" }}>
                      {p === CARD_UNKNOWN ? "?" : p[0]}
                      {SUIT_SYMBOL[p[1]] ? <span style={{ fontSize: Math.round(pvFont * 0.6) }}>{SUIT_SYMBOL[p[1]]}</span> : null}
                    </span>
                  ) : (
                    <span style={{ color: isActive ? "#fbbf24" : "#1a2d45", fontSize: Math.round(pvFont * 0.66) }}>?</span>
                  )}
                </button>
                {/* 현재 편집 슬롯 인디케이터 */}
                <span style={{ fontSize: 10, lineHeight: "11px", height: 11, color: "#fbbf24", fontWeight: 900 }}>
                  {isActive ? "▲" : ""}
                </span>
              </div>
            );
          })}
        </div>

        {/* 랭크 그리드 - A234567 / 89TJQK 2줄 */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: 6,
          marginBottom: 16,
        }}>
          {RANK_GRID.map((rank, gi) => {
            const isInPicks = picks.some(p => p && p[0] === rank);
            return (
              <button
                key={rank}
                onClick={() => pickRank(rank)}
                style={{
                  aspectRatio: "1 / 1.3",
                  background: isInPicks ? "#10b981" : "#fafafa",
                  border: `2px solid ${isInPicks ? "#fbbf24" : "transparent"}`,
                  borderRadius: 8,
                  color: isInPicks ? "#000" : "#0f172a",
                  fontWeight: 900,
                  fontSize: 24,
                  fontFamily: MONO,
                  cursor: "pointer",
                  transition: "all .1s",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  position: "relative",
                }}
              >
                <span style={{
                  position: "absolute", top: 2, left: 4,
                  fontSize: 9, color: isInPicks ? "#000" : "#94a3b8",
                  opacity: .6, fontWeight: 700, fontFamily: MONO,
                }}>{RANK_KEYS[gi].toUpperCase()}</span>
                {rank}
              </button>
            );
          })}
          {/* ? (모름) — 그리드 14번째 칸. 랭크와 구분되게 회색. */}
          <button
            onClick={pickUnknown}
            style={{
              aspectRatio: "1 / 1.3",
              background: "#1a2d45",
              border: "2px solid transparent",
              borderRadius: 8,
              color: "#cbd5e1",
              fontWeight: 900,
              fontSize: 24,
              fontFamily: MONO,
              cursor: "pointer",
              transition: "all .1s",
              display: "flex", alignItems: "center", justifyContent: "center",
              position: "relative",
            }}
            title="모름 (단축키 0 또는 /)"
          >
            <span style={{
              position: "absolute", top: 2, left: 4,
              fontSize: 9, color: "#7e8ca0",
              opacity: .8, fontWeight: 700, fontFamily: MONO,
            }}>0</span>
            ?
          </button>
        </div>

        {/* 슈트 선택 (선택사항): 랭크 누른 직후 누르면 그 카드에 문양. 안 누르면 랭크만 */}
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {SUITS.map(s => (
            <button key={s.id}
              onClick={() => setSuit(s.id)}
              title={`${s.label} (단축키 ${s.id.toUpperCase()})`}
              style={{
                flex: 1, padding: "8px 0",
                background: "#fafafa", border: "2px solid transparent",
                borderRadius: 8, cursor: "pointer",
                color: SUIT_COLOR[s.id], fontSize: 20, fontWeight: 900,
                fontFamily: MONO, position: "relative",
              }}>
              <span style={{
                position: "absolute", top: 2, left: 5,
                fontSize: 9, color: "#94a3b8", opacity: .7, fontWeight: 700,
              }}>{s.id.toUpperCase()}</span>
              {s.label}
            </button>
          ))}
        </div>

        {/* 하단 버튼 */}
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={confirm} disabled={!canConfirm} style={{
            flex: 1, padding: "12px",
            background: canConfirm ? "#10b981" : "#0a1628",
            border: "none", borderRadius: 8,
            color: canConfirm ? "#000" : "#1a2d45",
            fontSize: 13, fontWeight: 900,
            cursor: canConfirm ? "pointer" : "not-allowed",
            letterSpacing: 1.5,
          }}>✓ 확인</button>
          <button onClick={clearAll} style={{
            padding: "12px 16px",
            background: "#0a1628", border: "1px solid #1a2d45",
            borderRadius: 8, color: "#7e8ca0",
            fontSize: 11, cursor: "pointer",
          }}>비우기</button>
          <button onClick={onClose} style={{
            padding: "12px 16px",
            background: "transparent", border: "1px solid #1a2d45",
            borderRadius: 8, color: "#7e8ca0",
            fontSize: 11, cursor: "pointer",
          }}>취소</button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 히스토리 카드
// ══════════════════════════════════════════════════════════════════════════════
function HandHistoryCard({ hand, showEventName = true }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = (e) => {
    e.stopPropagation();
    const text = toSheetCell(handToText(hand, showEventName));
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
    } else {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
      document.body.removeChild(ta);
    }
  };

  return (
    <div style={{
      background: "#050d1a",
      border: "1px solid #0f1f35",
      borderRadius: 12, overflow: "hidden",
    }}>
      <div style={{
        width: "100%",
        padding: "12px 14px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        borderBottom: open ? "1px solid #0f1f35" : "none",
      }}>
        <button
          onClick={() => setOpen(v => !v)}
          style={{
            flex: 1, background: "none", border: "none",
            padding: 0, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 10,
            textAlign: "left",
          }}
        >
          <span style={{ color: "#10b981", fontSize: 13, fontWeight: 900, fontFamily: MONO }}>
            HAND #{hand.number}
          </span>
          {GAME_TYPES[hand.gameType] && (
            <span style={{ color: "#64748b", fontSize: 10, fontWeight: 700, fontFamily: MONO }}>
              {GAME_TYPES[hand.gameType].label}
            </span>
          )}
          {hand.winnerName && (
            <span style={{
              background: "#f59e0b22", color: "#f59e0b",
              border: "1px solid #f59e0b55",
              fontSize: 10, fontWeight: 700, padding: "1px 8px",
              borderRadius: 4, letterSpacing: 1,
            }}>🏆 {hand.winnerName}</span>
          )}
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button onClick={handleCopy} style={{
            background: copied ? "#10b981" : "#0a1628",
            border: `1px solid ${copied ? "#10b981" : "#1a2d45"}`,
            borderRadius: 6,
            padding: "4px 10px",
            color: copied ? "#000" : "#94a3b8",
            fontSize: 10, fontWeight: 700,
            letterSpacing: 1, cursor: "pointer",
            fontFamily: MONO,
          }}>{copied ? "✓ 복사됨" : "📋 복사"}</button>
          <span style={{ color: "#374151", fontSize: 10 }}>{hand.startedAt}</span>
          <button onClick={() => setOpen(v => !v)} style={{
            background: "none", border: "none", padding: 0,
            color: "#374151", fontSize: 12, cursor: "pointer",
          }}>{open ? "▲" : "▼"}</button>
        </div>
      </div>

      {open && (
        <div style={{
          padding: "12px 14px 14px",
          fontFamily: MONO,
        }}>
          <HandLog hand={hand} size="md" />
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 핸드 종료 리캡 모달
// ══════════════════════════════════════════════════════════════════════════════
function RecapModal({ hand, onClose, onReopen, showEventName = true }) {
  const [copied, setCopied] = useState(false);

  // 모달 닫을 때 copied 상태 리셋
  useEffect(() => {
    if (!hand) setCopied(false);
  }, [hand]);

  if (!hand) return null;

  const handleCopy = () => {
    const text = toSheetCell(handToText(hand, showEventName));
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
    } else {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
      document.body.removeChild(ta);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,.85)",
        zIndex: 200,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
        animation: "recapFadeIn .2s ease-out",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "#050d1a",
          border: "1px solid #f59e0b55",
          borderRadius: 16, padding: 18,
          maxWidth: 440, width: "100%",
          maxHeight: "85vh", overflow: "auto",
          boxShadow: "0 0 40px rgba(245,158,11,.2)",
          fontFamily: MONO,
          color: "#e2e8f0",
        }}
      >
        {/* 헤더 */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginBottom: 14,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{
              color: "#10b981", fontSize: 14, fontWeight: 900,
              letterSpacing: 2,
            }}>HAND #{hand.number}</span>
            <span style={{
              background: "#f59e0b22", color: "#f59e0b",
              border: "1px solid #f59e0b55",
              fontSize: 11, fontWeight: 700,
              padding: "2px 10px", borderRadius: 4, letterSpacing: 1,
            }}>🏆 {hand.winnerName}</span>
          </div>
          <button onClick={onClose} style={{
            background: "transparent", border: "none",
            color: "#7e8ca0", fontSize: 18, cursor: "pointer", padding: 0,
            width: 28, height: 28,
          }}>✕</button>
        </div>

        {/* 히스토리 */}
        <div style={{
          background: "#020912",
          border: "1px solid #0f1f35",
          borderRadius: 10, padding: 14,
          marginBottom: 12,
        }}>
          <HandLog hand={hand} size="md" />
        </div>

        {/* 하단 버튼 */}
        {onReopen && (() => {
          const SL = streetsOf(hand);
          let lastActed = 0;
          for (let i = 0; i < SL.length; i++) {
            if ((hand.streets[SL[i]] || []).length > 0) lastActed = i;
          }
          return (
            <button onClick={onReopen} style={{
              width: "100%", marginBottom: 8, padding: "10px",
              background: "transparent", border: "1px solid #10b981",
              borderRadius: 10, color: "#10b981",
              fontSize: 11, fontWeight: 700, letterSpacing: 1, cursor: "pointer",
              fontFamily: MONO,
            }}>↶ {STREET_SHORT[SL[lastActed]]} 로 되돌리기</button>
          );
        })()}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={handleCopy} style={{
            flex: 1, padding: "12px",
            background: copied ? "#10b981" : "#0a1628",
            border: `1.5px solid ${copied ? "#10b981" : "#1a2d45"}`,
            borderRadius: 10,
            color: copied ? "#000" : "#94a3b8",
            fontSize: 12, fontWeight: 900,
            letterSpacing: 1.5, cursor: "pointer",
            fontFamily: MONO,
            transition: "all .15s",
          }}>{copied ? "✓ 복사됨!" : "📋 복사"}</button>
          <button onClick={onClose} style={{
            flex: 1, padding: "12px",
            background: "linear-gradient(135deg, #10b981, #059669)",
            border: "none", borderRadius: 10,
            color: "#000", fontSize: 12, fontWeight: 900,
            letterSpacing: 1.5, cursor: "pointer",
          }}>NEXT HAND →</button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 참가자 목록 모달
// ══════════════════════════════════════════════════════════════════════════════
function PlayersModal({ seats, buttonSeatId, onClose }) {
  const occ = seats.filter(isOccupied); // 앉은 사람(아웃 포함), 물리 순서
  const pos = computePositions(seats, buttonSeatId).positions;
  const playing = occ.filter(s => !s.out);
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "rgba(0,0,0,.75)", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "flex-start", padding: "40px 12px", overflowY: "auto",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "100%", maxWidth: 440, background: "#071425",
        border: "1px solid #15324f", borderRadius: 14, padding: "18px",
      }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
          <span style={{ color: "#10b981", fontSize: 15, fontWeight: 900, letterSpacing: 1 }}>
            👥 참가자 {playing.length}명{occ.length > playing.length ? ` (+OUT ${occ.length - playing.length})` : ""}
          </span>
          <button onClick={onClose} style={{
            marginLeft: "auto", padding: "4px 12px",
            background: "transparent", border: "1px solid #2a3f5c",
            borderRadius: 6, color: "#94a3b8", fontSize: 13, fontWeight: 800, cursor: "pointer",
          }}>닫기 ✕</button>
        </div>

        {occ.length === 0 ? (
          <div style={{ color: "#64748b", fontSize: 13, padding: "16px 4px", textAlign: "center" }}>
            앉은 사람이 없습니다. 테이블의 빈 좌석(+)을 탭해 추가하세요.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {occ.map(s => {
              const p = pos[s.id] || s.position || "";
              const isBtn = s.id === buttonSeatId;
              return (
                <div key={s.id} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "9px 12px", borderRadius: 8,
                  background: s.out ? "#0a0f18" : "#03101f",
                  border: `1px solid ${s.out ? "#1a2436" : "#13314c"}`,
                  opacity: s.out ? 0.55 : 1,
                }}>
                  <span style={{ color: "#475569", fontSize: 11, fontWeight: 700, minWidth: 24, fontFamily: MONO }}>#{s.id + 1}</span>
                  <span style={{
                    minWidth: 38, textAlign: "center", color: "#10b981",
                    fontSize: 11, fontWeight: 800, fontFamily: MONO,
                  }}>{p || "—"}</span>
                  <span style={{ color: "#e2e8f0", fontSize: 14, fontWeight: 800, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                  {isBtn && (
                    <span style={{
                      background: "#fbbf24", color: "#000", fontSize: 10, fontWeight: 900,
                      padding: "1px 7px", borderRadius: 10, fontFamily: MONO,
                    }}>D</span>
                  )}
                  {s.out && (
                    <span style={{
                      color: "#f59e0b", fontSize: 10, fontWeight: 800,
                      border: "1px solid #5b4420", padding: "1px 6px", borderRadius: 4,
                    }}>OUT</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 사용 설명서 모달
// ══════════════════════════════════════════════════════════════════════════════
function HelpModal({ onClose }) {
  const SECTIONS = [
    { t: "화면 구성", lines: [
      "위 — 테이블: 좌석·딜러 버튼·현재 스트리트·액션할 사람",
      "가운데 — 입력 패널: 스트리트 탭·보드·금액·액션 버튼",
      "우측 상단 — TABLE(테이블) / LOG(지난 핸드)",
    ] },
    { t: "처음 세팅 (한 번만)", lines: [
      "게임 선택: 위쪽 칩에서 종류(홀덤·PLO·드로우)",
      "빈 좌석(+) 탭 → 이름·포지션 입력 → Enter",
      "딜러 버튼 위치 지정, 자리 바뀌면 자리교체(⇄)",
      "좌석·게임·버튼은 자동 저장 (다시 켜도 유지)",
    ] },
    { t: "한 핸드 기록 (핵심)", lines: [
      "새 핸드 시작 → PREFLOP",
      "카드 칩(✎) 탭 → 랭크·문양 선택 (문양은 나중에 추가 가능)",
      "다음 액션할 사람 자동 표시 → 금액 입력 후 액션 버튼",
      "OPEN·BET·RAISE·CALL·CHECK·FOLD / ALL-IN · ALL-IN CALL",
      "FLOP/TURN/RIVER에서 점선 슬롯 탭 → 보드 카드 입력",
      "라운드 끝 → '다음 스트리트로', 마지막 → 'WINNER 선택'",
      "승자 선택(분할 가능). 전원 폴드면 자동 종료",
    ] },
    { t: "되돌리기 ↶", lines: [
      "액션을 하나씩 취소",
      "스트리트가 비면 한 번 더 눌러 직전 스트리트로",
      "핸드 통째로 버리기: ✕",
    ] },
    { t: "드로우 게임 (2-7TD·Badugi 등)", lines: [
      "보드 없음, DRAW 1·2·3 단계로 진행",
      "핸드 칩 탭 → 카드 교환 입력",
      "교환 장수(D2)·PAT(안 바꿈) 자동 표기",
    ] },
    { t: "승률 (홀덤 전용)", lines: [
      "홀카드 입력되면 승률 패널 표시",
      "Pre/Flop/Turn/River 탭 = 시점별 승률",
      "보드는 문양까지 입력돼야 계산",
    ] },
    { t: "로그 / 복사", lines: [
      "보드 = 맨 위 한 줄(플랍 | 턴 | 리버), 문양은 글자(s/h/d/c)",
      "복사 버튼으로 전체 로그를 텍스트로 복사",
      "지난 핸드 = 상단 LOG 화면에서 다시 보기",
    ] },
    { t: "단축키 (외장 키보드)", lines: [
      "H = 카드 피커 열기 / Z = 되돌리기 / Enter = 다음 스트리트 / N = 새 핸드",
      "O = OPEN / B = BET / R = RAISE / L = CALL / F = FOLD / C = CHECK / A = ALL-IN",
      "금액 입력 후 O·B·R·A 누르면 그 금액으로 바로 기록",
      "카드창: Enter 확정·Esc 닫기, 랭크 a~k·숫자, 문양 h/d/c/s",
      "위너: 숫자 토글·Enter 확정·Esc 취소",
    ] },
    { t: "팁 & 주의", lines: [
      "문양 입력 권장 — 승률·로그 정확도 ↑",
      "금액은 선택 — 안 넣어도 액션 기록됨",
      "OPEN 뒤 레이즈 = 3-BET·4-BET… (올인도 레이즈로 카운트)",
      "진행 중 핸드는 미저장 — 승자 선택 전 종료 시 소실 가능",
    ] },
  ];
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "rgba(0,0,0,.75)", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "flex-start", padding: "40px 12px",
      overflowY: "auto",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "100%", maxWidth: 480, background: "#071425",
        border: "1px solid #15324f", borderRadius: 14, padding: "18px 18px 22px",
      }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
          <span style={{ color: "#10b981", fontSize: 16, fontWeight: 900, letterSpacing: 2 }}>♠ 사용 설명서</span>
          <button onClick={onClose} style={{
            marginLeft: "auto", padding: "4px 12px",
            background: "transparent", border: "1px solid #2a3f5c",
            borderRadius: 6, color: "#94a3b8", fontSize: 13, fontWeight: 800, cursor: "pointer",
          }}>닫기 ✕</button>
        </div>

        <div style={{ color: "#7e8ca0", fontSize: 12, lineHeight: 1.5, marginBottom: 14 }}>
          라이브 테이블 옆에서 핸드를 기록하고, 홀덤이면 승률을 바로 보는 도구입니다.
        </div>

        {SECTIONS.map((s, i) => (
          <div key={i} style={{ marginBottom: 14 }}>
            <div style={{
              color: "#0ea5e9", fontSize: 12, fontWeight: 900, letterSpacing: 1,
              marginBottom: 6, paddingBottom: 4, borderBottom: "1px solid #122c45",
            }}>{i + 1}. {s.t}</div>
            {s.lines.map((ln, k) => (
              <div key={k} style={{ display: "flex", gap: 7, marginBottom: 4 }}>
                <span style={{ color: "#10b981", fontSize: 12, lineHeight: 1.5 }}>•</span>
                <span style={{ color: "#cbd5e1", fontSize: 12.5, lineHeight: 1.5 }}>{ln}</span>
              </div>
            ))}
          </div>
        ))}

        <div style={{
          marginTop: 6, padding: "10px 12px", background: "#06243a",
          border: "1px solid #15324f", borderRadius: 8,
          color: "#7dd3fc", fontSize: 11.5, lineHeight: 1.6,
        }}>
          <b>흐름 요약</b><br />
          게임 선택 → 좌석·버튼 세팅 → 새 핸드 → 카드·액션 → 다음 스트리트 → 보드 → 승자 → 복사.
          막히면 되돌리기(↶)로 한 단계씩.
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 메인 앱
// ══════════════════════════════════════════════════════════════════════════════
export default function PokerTracker() {
  // localStorage에서 초기값 불러오기
  const loadFromStorage = (key, fallback) => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  };

  const [seats, setSeats] = useState(() => loadFromStorage("pt_seats", initSeats()));
  const [hands, setHands] = useState(() => loadFromStorage("pt_hands", []));
  const [buttonSeatId, setButtonSeatId] = useState(() => loadFromStorage("pt_button", null));
  const [currentHand, setCurrentHand] = useState(null);
  const [currentStreet, setCurrentStreet] = useState(0);
  const [editingSeat, setEditingSeat] = useState(null);
  const [swapMode, setSwapMode] = useState(false); // 자리 교체 모드
  const [swapFirst, setSwapFirst] = useState(null); // 첫 선택 좌석 id
  const [editName, setEditName] = useState("");
  const [editPosition, setEditPosition] = useState("");
  const [editOut, setEditOut] = useState(false);
  const [posEditOpen, setPosEditOpen] = useState(false);
  const [activeView, setActiveView] = useState("table");
  const [showHelp, setShowHelp] = useState(false);
  const [showPlayers, setShowPlayers] = useState(false);
  const [showWinnerPicker, setShowWinnerPicker] = useState(false);
  const [selectedWinners, setSelectedWinners] = useState([]); // 다중 위너 선택용 seatId 배열
  const [selectedHi, setSelectedHi] = useState([]); // Hi-Lo: High 팟 승자
  const [selectedLo, setSelectedLo] = useState([]); // Hi-Lo: Low 팟 승자
  const [cardPickerFor, setCardPickerFor] = useState(null); // { seatId } | { board } | { showdown } | { edit }
  const [equityResult, setEquityResult] = useState(null); // { players,exact,iterations,street } | { error,street }
  const [equityStreet, setEquityStreet] = useState(null);  // 계산 대상 스트리트 키
  const [equityBusy, setEquityBusy] = useState(false);
  const [recapHand, setRecapHand] = useState(null); // 방금 끝난 핸드를 모달로 보여줌
  const [logCopied, setLogCopied] = useState(false); // Ctrl+C 로그 복사 피드백
  const [showEventName, setShowEventName] = useState(() => loadFromStorage("pt_showevent", true)); // 복사 로그 최상단 이벤트명 표시 여부
  const [gameType, setGameType] = useState(() => {
    const g = loadFromStorage("pt_gametype", null);
    if (g && GAME_TYPES[g]) return g;
    // 구버전: 저장된 카드 장수로 홀덤/PLO 추론
    const cc = clampCardCount(loadFromStorage("pt_cardcount", DEFAULT_CARD_COUNT));
    return { 2: "holdem", 4: "plo4", 5: "plo5", 6: "plo6" }[cc] || "holdem";
  });
  const holeCardCount = GAME_TYPES[gameType]?.cards || DEFAULT_CARD_COUNT;
  const [betAmountInput, setBetAmountInput] = useState(""); // 베팅 금액 숫자부분
  const [betUnit, setBetUnit] = useState("k"); // "" | "k" | "m", 핸드마다 k로 리셋
  // 키보드 핸들러(effect 클로저)에서 stale 없이 현재 금액을 읽기 위한 ref
  const betAmountInputRef = React.useRef("");
  const betUnitRef = React.useRef("");
  betAmountInputRef.current = betAmountInput;
  betUnitRef.current = betUnit;

  // hands 변경되면 localStorage에 자동 저장
  useEffect(() => {
    try { window.localStorage.setItem("pt_hands", JSON.stringify(hands)); } catch {}
  }, [hands]);

  // seats 변경되면 localStorage에 자동 저장
  useEffect(() => {
    try { window.localStorage.setItem("pt_seats", JSON.stringify(seats)); } catch {}
  }, [seats]);

  // 버튼 위치 저장
  useEffect(() => {
    try { window.localStorage.setItem("pt_button", JSON.stringify(buttonSeatId)); } catch {}
  }, [buttonSeatId]);

  // 게임 타입 저장
  useEffect(() => {
    try { window.localStorage.setItem("pt_gametype", JSON.stringify(gameType)); } catch {}
  }, [gameType]);

  // 이벤트명 표시 토글 저장
  useEffect(() => {
    try { window.localStorage.setItem("pt_showevent", JSON.stringify(showEventName)); } catch {}
  }, [showEventName]);

  // 진행 중 핸드(또는 리캡 떠 있을 때)는 게임 변경 잠금 → 편집 가능한 핸드와 항상 일치 보장
  const cardCountLocked = !!currentHand || !!recapHand;
  const changeGameType = (id) => {
    if (cardCountLocked) return;
    if (GAME_TYPES[id]) setGameType(id);
  };

  // 좌석 탭: 일반=편집모달, 스왑모드=두 자리의 내용(name/active/out) 교체
  // position/id/버튼은 의자에 남고, 포지션은 다음 핸드에서 자리 기준 자동계산됨
  const handleSeatTap = (seat) => {
    if (isHandActive) return;
    if (!swapMode) {
      setEditingSeat(seat.id);
      setEditName(seat.name);
      setEditPosition(seat.position || POSITION_ORDER[seat.id] || "");
      setEditOut(!!seat.out);
      return;
    }
    if (swapFirst === null) { setSwapFirst(seat.id); return; }
    if (swapFirst === seat.id) { setSwapFirst(null); return; } // 같은 자리 = 해제
    setSeats(prev => swapSeatContents(prev, swapFirst, seat.id));
    setSwapFirst(null);
  };

  const activeSeats = seats.filter(s => s.active && s.name);
  // 실제 핸드에 참여하는 시트 (아웃된 시트 제외 = 데드버튼/데드블라인드 표현)
  const playingSeats = activeSeats.filter(s => !s.out);

  // ── 핸드 시작 ─────────────────────────────────────────────────────────────
  const startHand = () => {
    if (playingSeats.length < 2) return;

    // OUT 자리 경과 처리 (2핸드 지나면 자리 비움). 이번 핸드 링/포지션에 즉시 반영.
    const aged = applyOutAging(seats);

    // 버튼 위치 결정: 점유된 자리(사람 앉음)를 가리켜야 유효.
    // 비점유(빈 시트)거나 미지정이면 첫 playing 시트로 폴백.
    let btn = buttonSeatId;
    const btnSeat = aged.find(s => s.id === btn);
    const btnValid = btn != null && isOccupied(btnSeat);
    if (!btnValid) {
      btn = playingSeats[0].id;
      setButtonSeatId(btn);
    }

    const isStud = !!GAME_TYPES[gameType]?.stud;
    let handSeats, dead = { button: false, small: false };

    if (isStud) {
      // 스터드: 블라인드/버튼 구조 없음. 물리 좌석 순서대로 #1~#N 번호 부여.
      handSeats = playingSeats.map((s, i) => ({ id: s.id, name: s.name, position: `#${i + 1}` }));
      setSeats(aged.map(s => {
        const idx = playingSeats.findIndex(p => p.id === s.id);
        return idx >= 0 ? { ...s, position: `#${idx + 1}` } : s;
      }));
    } else {
      // 버튼 자리 기준 포지션 계산 (데드 스몰/버튼 자동)
      const pos = computePositions(aged, btn);
      dead = pos.dead;
      handSeats = playingSeats
        .filter(s => pos.positions[s.id])
        .map(s => ({ id: s.id, name: s.name, position: pos.positions[s.id] }));
      setSeats(aged.map(s =>
        pos.positions[s.id] ? { ...s, position: pos.positions[s.id] } : s
      ));
    }

    const sl = GAME_TYPES[gameType]?.streets || STREETS;
    const emptyStreets = {};
    sl.forEach(s => { emptyStreets[s] = []; });

    setCurrentHand({
      id: Date.now(),
      number: hands.length + 1,
      seats: handSeats,
      buttonSeatId: btn,
      dead,
      gameType,
      streetList: sl,
      streets: emptyStreets,
      holeCards: {},
      roundHole: {},
      studUp: {},   // (구버전 호환) 스터드 업카드
      studCards: {}, // 스터드 카드 7칸: { seatId: [c0..c6] }  0,1=3rd다운 2=3rd업 3=4th업 4=5th업 5=6th업 6=7th다운
      studFirstSeat: {}, // 스터드 각 스트리트 첫 액션자(운영자 지정): { "3RD": seatId, "4TH": seatId, ... }
      board: [null, null, null, null, null], // 홀덤류: 플랍0~2, 턴3, 리버4 (드로우는 미사용)
      cardCount: holeCardCount,
      winner: null,
      startedAt: new Date().toLocaleTimeString("ko-KR"),
    });
    setCurrentStreet(0);
    setShowWinnerPicker(false);
    // 새 핸드: 금액 입력 초기화 (단위는 k 기본, 직전 핸드의 m/없음 잔존 방지)
    setBetAmountInput("");
    setBetUnit("k");
    setSwapMode(false);
    setSwapFirst(null);
  };

  // ── 액션 기록 ────────────────────────────────────────────────────────────
  const logAction = (seatId, actionId, amountText = null) => {
    if (!currentHand) return;
    const SL = streetsOf(currentHand);
    const street = SL[currentStreet];
    const seat = currentHand.seats.find(s => s.id === seatId);
    // 사이징 액션이고 금액이 있으면 기록
    const amt = (AMOUNT_ACTIONS.has(actionId) && amountText) ? amountText : undefined;

    setCurrentHand(prev => {
      const updated = {
        ...prev,
        streets: {
          ...prev.streets,
          [street]: [
            ...(prev.streets[street] || []),
            { seatId, playerName: seat.name, position: seat.position, action: actionId, amountText: amt },
          ],
        },
      };

      // 자동 위너 판정: 폴드 액션 후 한 명만 남으면 즉시 종료
      let autoEnded = false;
      if (actionId === "fold") {
        const foldedIds = new Set();
        for (let i = 0; i <= currentStreet; i++) {
          (updated.streets[SL[i]] || []).forEach(a => {
            if (a.action === "fold") foldedIds.add(a.seatId);
          });
        }
        const alive = updated.seats.filter(s => !foldedIds.has(s.id));
        if (alive.length === 1) {
          autoEnded = true;
          const winner = alive[0];
          const winnerCards = cardsToText(updated.holeCards[winner.id]);
          const finalHand = {
            ...updated,
            winnerName: winner.name,
            winnerCards,
            winnerSeatId: winner.id,
            autoWin: true,
          };
          setTimeout(() => {
            setHands(h => [finalHand, ...h]);
            setButtonSeatId(b => advanceButton(seats, b));
            setCurrentHand(null);
            setCurrentStreet(0);
            setShowWinnerPicker(false);
            setRecapHand(finalHand);
          }, 400);
        }
      }

      // 올인/콜로 더 이상 액션할 사람이 없으면(라운드 완료 + 액션가능자 ≤1)
      // 남은 스트리트를 건너뛰고 즉시 winner picker로 점프
      if (!autoEnded) {
        const roundDone = computeNextToAct(updated, currentStreet) === null;
        const actionableLeft = computeActionablePlayers(updated, currentStreet).length;
        if (roundDone && actionableLeft <= 1) {
          setTimeout(() => {
            setCurrentStreet(3);
            setShowWinnerPicker(true);
          }, 300);
        }
      }

      return updated;
    });
  };

  // UI/단축키 공용: 사이징 액션이면 현재 금액 입력을 붙이고, 기록 후 숫자부분만 비움(단위 sticky)
  const doAction = (seatId, actionId) => {
    const amountText = AMOUNT_ACTIONS.has(actionId)
      ? makeAmountText(betAmountInputRef.current, betUnitRef.current) : null;
    logAction(seatId, actionId, amountText);
    if (betAmountInputRef.current) setBetAmountInput("");
  };

  // ── 핸드 진행 중 포지션 수정 (RFID 화면과 어긋날 때 즉석 정정) ──────────────
  // D로 지정 → 버튼을 그 자리로 옮기고 핸드 전체 포지션 재계산 (다음 핸드까지 반영).
  // 그 외 포지션 → 현재 핸드에서만 swap (버튼 무관).
  const changeSeatPosition = (seatId, newPos) => {
    if (newPos === "D") {
      // 버튼 이동 → 전체 재계산
      setButtonSeatId(seatId);
      const { positions } = computePositions(seats, seatId);
      setCurrentHand(prev => {
        if (!prev) return prev;
        const newSeats = prev.seats.map(s =>
          positions[s.id] ? { ...s, position: positions[s.id] } : s
        );
        const posOf = id => positions[id];
        const newStreets = {};
        for (const st of streetsOf(prev)) {
          newStreets[st] = (prev.streets[st] || []).map(a =>
            posOf(a.seatId) ? { ...a, position: posOf(a.seatId) } : a
          );
        }
        return { ...prev, seats: newSeats, streets: newStreets };
      });
      // 원본 seats에도 반영
      setSeats(prev => prev.map(s =>
        positions[s.id] ? { ...s, position: positions[s.id] } : s
      ));
      return;
    }

    // 그 외: 현재 핸드에서만 swap
    setCurrentHand(prev => {
      if (!prev) return prev;
      const target = prev.seats.find(s => s.id === seatId);
      if (!target || target.position === newPos) return prev;
      const oldPos = target.position;
      const conflict = prev.seats.find(s => s.id !== seatId && s.position === newPos);
      const remap = (pos) => {
        if (pos === newPos && conflict) return oldPos;
        if (pos === oldPos) return newPos;
        return pos;
      };
      const newSeats = prev.seats.map(s =>
        s.id === seatId ? { ...s, position: newPos }
          : (conflict && s.id === conflict.id) ? { ...s, position: oldPos }
          : s
      );
      const newStreets = {};
      for (const st of streetsOf(prev)) {
        newStreets[st] = (prev.streets[st] || []).map(a => ({ ...a, position: remap(a.position) }));
      }
      return { ...prev, seats: newSeats, streets: newStreets };
    });
  };

  // ── 마지막 액션 되돌리기 (실수 정정용) ──────────────────────────────────
  const undoLastAction = () => {
    if (!currentHand) return;
    const SL = streetsOf(currentHand);
    const cur = SL[currentStreet];
    const curActions = currentHand.streets[cur] || [];
    if (curActions.length > 0) {
      // 현재 스트리트 마지막 액션 1개 제거
      setCurrentHand(prev => ({
        ...prev,
        streets: { ...prev.streets, [cur]: (prev.streets[cur] || []).slice(0, -1) },
      }));
      return;
    }
    // 현재 스트리트가 비었으면 → 직전 스트리트로 되돌림 (스트리트 진행 취소)
    if (currentStreet > 0) {
      const target = currentStreet - 1;
      setCurrentHand(prev => {
        if (!prev) return prev;
        const newStreets = { ...prev.streets };
        const newRoundHole = { ...(prev.roundHole || {}) };
        for (let i = currentStreet; i < SL.length; i++) {
          newStreets[SL[i]] = [];
          delete newRoundHole[SL[i]]; // 떠나는 스트리트의 드로우 스냅샷 제거
        }
        // 보드도 target 스트리트까지만 유지 (이후 카드 제거)
        const keepBoard = target === 0 ? 0 : (BOARD_COUNT_BY_STREET[SL[target]] || 0);
        const newBoard = (prev.board || [null, null, null, null, null]).map((c, i) => (i < keepBoard ? c : null));
        return { ...prev, streets: newStreets, board: newBoard, roundHole: newRoundHole };
      });
      setCurrentStreet(target);
    }
  };

  // ── 홀카드 설정 (2장 통째로) ────────────────────────────────────────────
  const setHoleCards = useCallback((seatId, cards) => {
    setCurrentHand(prev => ({
      ...prev,
      holeCards: { ...prev.holeCards, [seatId]: cards },
    }));
    setCardPickerFor(null);
  }, []);

  // 카드 모달용 안정화 콜백 (모달 keydown effect 재등록 최소화)
  const closeCardPicker = useCallback(() => setCardPickerFor(null), []);
  const handleCardPick = useCallback((cards) => {
    if (!cardPickerFor) return;
    setEquityResult(null);
    if (cardPickerFor.studHand) {
      // 스터드 카드 7칸 전체 입력/수정 (한 모달, 언제든)
      const { seatId } = cardPickerFor.studHand;
      setCurrentHand(prev => {
        if (!prev) return prev;
        const arr = Array(STUD_SLOTS.length).fill(null).map((_, i) => cards[i] ?? null);
        return { ...prev, studCards: { ...(prev.studCards || {}), [seatId]: arr } };
      });
      setCardPickerFor(null);
    } else if (cardPickerFor.board) {
      const street = cardPickerFor.board;
      const count = BOARD_COUNT_BY_STREET[street]; // 누적: 플랍3·턴4·리버5
      setCurrentHand(prev => {
        if (!prev) return prev;
        const board = [...(prev.board || [null, null, null, null, null])];
        for (let i = 0; i < count; i++) board[i] = cards[i] ?? null;
        return { ...prev, board };
      });
      setCardPickerFor(null);
    } else if (cardPickerFor.showdown) {
      // 쇼다운 최종핸드 확정. 드로우=마지막 스트리트 스냅샷, 비드로우=홀카드.
      const { seatId } = cardPickerFor.showdown;
      setCurrentHand(prev => {
        if (!prev) return prev;
        if (GAME_TYPES[prev.gameType]?.draw) {
          const SL = streetsOf(prev);
          const lastStreet = SL[SL.length - 1];
          return {
            ...prev,
            roundHole: {
              ...prev.roundHole,
              [lastStreet]: { ...(prev.roundHole?.[lastStreet] || {}), [seatId]: cards },
            },
          };
        }
        return { ...prev, holeCards: { ...prev.holeCards, [seatId]: cards } };
      });
      setCardPickerFor(null);
    } else if (cardPickerFor.edit) {
      // 언제든 핸드 수정: street0=딜(holeCards), 드로우 스트리트=그 라운드 스냅샷.
      const { seatId, streetIdx } = cardPickerFor.edit;
      setCurrentHand(prev => {
        if (!prev) return prev;
        if (streetIdx === 0 || !GAME_TYPES[prev.gameType]?.draw) {
          return { ...prev, holeCards: { ...prev.holeCards, [seatId]: cards } };
        }
        const SL = streetsOf(prev);
        const street = SL[streetIdx];
        return {
          ...prev,
          roundHole: {
            ...prev.roundHole,
            [street]: { ...(prev.roundHole?.[street] || {}), [seatId]: cards },
          },
        };
      });
      setCardPickerFor(null);
    } else {
      setHoleCards(cardPickerFor.seatId, cards);
    }
  }, [cardPickerFor, setHoleCards]);

  // ── 살아있는 플레이어 계산 ────────────────────────────────────────────────
  // FOLD하지 않은 플레이어 = 살아있음
  const getAlivePlayers = (atStreetIdx) => {
    if (!currentHand) return [];
    const foldedIds = new Set();
    const SL = streetsOf(currentHand);
    for (let i = 0; i <= atStreetIdx; i++) {
      const street = SL[i];
      (currentHand.streets[street] || []).forEach(a => {
        if (a.action === "fold") foldedIds.add(a.seatId);
      });
    }
    return currentHand.seats.filter(s => !foldedIds.has(s.id));
  };

  // ── 승률(equity) 계산: 홀덤만. 살아있는 플레이어(문양 확정 홀2장) + 입력된 보드. ──
  const equityEligible = () => {
    if (!currentHand || GAME_TYPES[currentHand.gameType]?.cards !== 2) return [];
    return getAlivePlayers(currentStreet)
      .map(s => ({ seatId: s.id, name: s.name, position: s.position, cards: (currentHand.holeCards[s.id] || []).filter(cardIsSuited) }))
      .filter(h => h.cards.length === 2);
  };
  const runEquityFor = (streetName) => {
    setEquityStreet(streetName);
    const hands = equityEligible();
    if (hands.length < 2) { setEquityResult({ error: "문양까지 입력된 핸드가 2명 이상 필요합니다", street: streetName }); return; }
    // 선택 스트리트 보드가 문양까지 다 입력돼야 그 시점 승률 계산
    const needBoard = BOARD_COUNT_BY_STREET[streetName] || 0; // 프리플랍 0
    const board = currentHand.board || [];
    const suitedBoard = board.slice(0, needBoard).filter(cardIsSuited);
    if (needBoard > 0 && suitedBoard.length < needBoard) {
      setEquityResult({ error: `${STREET_SHORT[streetName]} 보드를 문양까지 입력하세요 (현재 ${suitedBoard.length}/${needBoard}장)`, street: streetName });
      return;
    }
    setEquityBusy(true);
    setEquityResult(null);
    setTimeout(() => { // 스피너 먼저 그린 뒤 동기 계산
      const r = computeEquity(hands, suitedBoard, { samples: 50000 });
      if (!r.ok) {
        setEquityResult({ error: r.reason === "dup" ? "중복된 카드가 있습니다" : "계산할 수 없습니다", street: streetName });
      } else {
        const metaById = {}; hands.forEach(h => { metaById[h.seatId] = h; });
        setEquityResult({
          players: r.players.map(p => ({
            ...p,
            name: metaById[p.seatId]?.name || "",
            position: metaById[p.seatId]?.position || "",
            cards: metaById[p.seatId]?.cards || [],
          })).sort((a, b) => b.equity - a.equity),
          exact: r.exact, iterations: r.iterations, street: streetName,
        });
      }
      setEquityBusy(false);
    }, 30);
  };
  // 스트리트/핸드 바뀌면 이전 결과 무효화
  useEffect(() => { setEquityResult(null); setEquityBusy(false); setEquityStreet(null); }, [currentStreet, currentHand?.number]);

  // 현재 스트리트에서 액션 가능한 플레이어
  // PREFLOP: 모든 활성 시트
  // FLOP+: 직전 스트리트까지 FOLD 안 한 사람만
  // 추가로 ALL-IN한 사람은 더 이상 액션 불가
  const getActionablePlayers = () => computeActionablePlayers(currentHand, currentStreet);

  // ── 다음 액션할 플레이어 계산 ─────────────────────────────────────────────
  // 마지막 BET/RAISE/OPEN/ALL-IN 이후 아직 응답 안 한 사람들이 액션해야 함
  const getNextToAct = () => computeNextToAct(currentHand, currentStreet);

  // 라운드 완료 여부 (모두 응답했으면 다음 스트리트로 가도 됨)
  const isRoundComplete = () => {
    return getNextToAct() === null;
  };

  // ── 스트리트 진행 ─────────────────────────────────────────────────────────
  const nextStreet = () => {
    const lastIdx = streetsOf(currentHand).length - 1;
    // 액션 가능한 사람이 1명 이하면 (모두 올인 or 1명만 살아남음)
    // → 남은 스트리트 건너뛰고 위너 선택
    const actionable = getActionablePlayers();
    if (actionable.length <= 1) {
      // 마지막 스트리트까지 모든 빈 스트리트 통과
      setCurrentStreet(lastIdx);
      setShowWinnerPicker(true);
      return;
    }
    if (currentStreet < lastIdx) {
      setCurrentStreet(s => s + 1);
    } else {
      setShowWinnerPicker(true);
    }
  };

  // ── 액션 가용성 체크 (UI 버튼과 단축키 공용) ─────────────────────────────
  const isActionDisabled = (actionId, player) => {
    if (!currentHand || !player) return true;
    const isStud = !!GAME_TYPES[currentHand.gameType]?.stud;
    const streetActions = currentHand.streets[currentStreetName] || [];

    // ── 스터드 전용 (3RD: BRING-IN→COMPLETE, 4TH+: BET 기반) ──
    if (isStud) {
      const is3rd = currentStreetName === "3RD";
      const hasBringin = streetActions.some(a => a.action === "bringin");
      const hasFullBet = streetActions.some(a => ["complete", "bet", "raise", "allin"].includes(a.action));
      const lastAggr = [...streetActions].reverse()
        .find(a => ["bringin", "complete", "bet", "raise", "allin"].includes(a.action));
      switch (actionId) {
        case "bringin":  return !(is3rd && streetActions.length === 0);  // 3RD 첫 액션만
        case "complete": return !(is3rd && hasBringin && !hasFullBet);   // bring-in을 풀로 (1회)
        case "bet":      return !(!is3rd && !hasFullBet);                // 4TH+ 첫 베팅
        case "raise":    return !hasFullBet;                            // 풀 베팅 있어야 레이즈
        case "check":    return (is3rd || hasFullBet);                  // 3RD는 강제, 베팅 있으면 불가
        case "call":
        case "allincall": {
          if (!(hasBringin || hasFullBet)) return true;
          if (lastAggr?.seatId === player.id) return true;             // 자기가 마지막 어그레서면 콜 불가
          return false;
        }
        case "allin": return (is3rd && streetActions.length === 0); // bring-in 전(3RD 첫 액션)엔 올인 불가
        case "fold":  return (is3rd && streetActions.length === 0); // bring-in 강제 → 첫 액션 폴드 불가
        case "open":  return true;  // 스터드는 OPEN 미사용
        default:      return true;
      }
    }

    // ── 비스터드(홀덤/오마하/드로우) ──
    const someoneOpened = streetActions.some(a => ["open", "raise", "allin"].includes(a.action));
    const someoneBet    = streetActions.some(a => ["bet", "raise", "allin"].includes(a.action));
    const lastAggressive = [...streetActions].reverse()
      .find(a => ["open", "bet", "raise", "allin"].includes(a.action));

    const rawHole = currentHand.holeCards[player.id];
    const hasCards = !!rawHole && rawHole.length > 0;
    if (currentStreet === 0 && !hasCards && actionId !== "fold") return true;

    if (actionId === "bringin" || actionId === "complete") return true; // 비스터드 미사용
    if (actionId === "open") {
      if (currentStreet !== 0) return true;
      if (someoneOpened) return true;
    }
    if (actionId === "bet") {
      if (currentStreet === 0) return true;
      if (someoneBet) return true;
    }
    if (actionId === "raise") {
      if (currentStreet > 0 && !someoneBet) return true; // 포스트플랍 무베팅이면 RAISE 불가 (BET 먼저)
    }
    if (actionId === "check") {
      if (someoneOpened || someoneBet) return true;
      if (currentStreet === 0 && player.position !== "BB") return true;
    }
    if (actionId === "call") {
      // 프리플랍은 빅블라인드 대상 콜(림프) 허용 — 오픈/베팅이 없어도 콜 가능
      if (!someoneBet && !someoneOpened && currentStreet !== 0) return true;
      if (lastAggressive?.seatId === player.id) return true;
    }
    if (actionId === "allincall") {
      // 올인 콜은 상대의 베팅/오픈이 있어야 (림프 예외 없음)
      if (!someoneBet && !someoneOpened) return true;
      if (lastAggressive?.seatId === player.id) return true;
    }
    return false;
  };

  // ── 키보드 단축키 ─────────────────────────────────────────────────────────
  // Ctrl+C 로그 복사 피드백 자동 해제
  useEffect(() => {
    if (!logCopied) return;
    const t = setTimeout(() => setLogCopied(false), 1500);
    return () => clearTimeout(t);
  }, [logCopied]);

  useEffect(() => {
    const handleKey = (e) => {
      // 카드 선택 모달이 열려있으면 메인 단축키 무시 (모달이 자체 처리)
      if (cardPickerFor) return;

      const key = e.key.toLowerCase();
      const tag = e.target.tagName;
      const isInput = tag === "INPUT" || tag === "TEXTAREA";

      // Ctrl+C / Cmd+C = 현재(또는 리캡) 핸드 로그 복사.
      // 입력칸 포커스 중이거나 텍스트를 직접 선택한 상태면 브라우저 기본 복사를 유지.
      if ((e.ctrlKey || e.metaKey) && key === "c") {
        if (isInput) return;
        const sel = (typeof window.getSelection === "function" && window.getSelection().toString()) || "";
        if (sel.trim()) return;
        const h = recapHand || currentHand;
        if (h) {
          e.preventDefault();
          const text = toSheetCell(handToText(h, showEventName));
          if (navigator.clipboard) navigator.clipboard.writeText(text);
          setLogCopied(true);
        }
        return;
      }

      // 액션 단축키는 금액 입력칸 포커스 중에도 동작 (금액 입력 후 바로 단축키)
      const ACTION_KEYS = new Set(["o","b","r","f","c","a","h","z"," "]);
      if (isInput && !ACTION_KEYS.has(key)) return;

      // 리캡 모달 열림: C=복사, Enter/N/Space=닫기
      if (recapHand) {
        if (key === "c") {
          const text = toSheetCell(handToText(recapHand, showEventName));
          if (navigator.clipboard) navigator.clipboard.writeText(text);
          setLogCopied(true);
        } else if (key === "enter" || key === "n" || key === " ") {
          e.preventDefault();
          setRecapHand(null);
        }
        return;
      }

      // 위너 선택 화면: 숫자로 토글, Enter로 확정, Esc로 취소
      if (showWinnerPicker && currentHand) {
        const lastIdx = streetsOf(currentHand).length - 1;
        const alive = getAlivePlayers(lastIdx);
        const isHilo = !!GAME_TYPES[currentHand.gameType]?.hilo;
        if (key === "escape") { setShowWinnerPicker(false); setSelectedWinners([]); setSelectedHi([]); setSelectedLo([]); return; }
        if (key === "enter") {
          if (isHilo) {
            const hiSeats = alive.filter(s => selectedHi.includes(s.id));
            const loSeats = alive.filter(s => selectedLo.includes(s.id));
            if (hiSeats.length > 0 || loSeats.length > 0) finalizeWinnersHilo(hiSeats, loSeats);
          } else {
            const winnerSeats = alive.filter(s => selectedWinners.includes(s.id));
            if (winnerSeats.length > 0) {
              finalizeWinners(winnerSeats);
              setSelectedWinners([]);
            }
          }
          return;
        }
        if (isHilo) return; // hilo는 숫자 토글 비활성(HI/LO 버튼으로만)
        const idx = parseInt(e.key, 10) - 1;
        if (!isNaN(idx) && alive[idx]) {
          const sid = alive[idx].id;
          setSelectedWinners(prev =>
            prev.includes(sid) ? prev.filter(x => x !== sid) : [...prev, sid]
          );
        }
        return;
      }

      // 핸드 진행 중
      if (currentHand) {
        // O=OPEN B=BET R=RAISE C=CALL F=FOLD A=ALL-IN Space=CHECK (현재 액터 기준, 비활성이면 무시)
        const actor = getNextToAct();
        if (actor) {
          if (key === "h") {
            e.preventDefault();
            const isStud = !!GAME_TYPES[currentHand.gameType]?.stud;
            if (isStud) {
              const sn = streetsOf(currentHand)[currentStreet];
              const slots = STUD_SLOTS_BY_STREET[sn] || [0];
              setCardPickerFor({ studHand: { seatId: actor.id, slot: slots[0] } });
            } else {
              setCardPickerFor(
                currentStreet === 0
                  ? { seatId: actor.id }
                  : { edit: { seatId: actor.id, streetIdx: currentStreet } }
              );
            }
            return;
          }
          // 액션 단축키 (비활성이면 무시). doAction이 금액 단위(k/m) 적용 + 입력칸 비움까지 UI 버튼과 동일 처리.
          const tryAction = (id) => {
            if (!isActionDisabled(id, actor)) {
              e.preventDefault();
              doAction(actor.id, id);
              return true;
            }
            return false;
          };
          if (key === "o") { tryAction("open");  return; }
          if (key === "b") { tryAction("bet");   return; }
          if (key === "r") { tryAction("raise"); return; }
          if (key === "c") { tryAction("call");  return; }
          if (key === "f") { tryAction("fold");  return; }
          if (key === "a") { tryAction("allin"); return; }
          // Space: CHECK 우선, 불가하면 아래 다음스트리트/새핸드로 진행
          if (key === " " && tryAction("check")) return;
        }
        // Enter/Space = 다음 스트리트 (라운드 완료 시)
        if ((key === "enter" || key === " ") && isRoundComplete()) {
          e.preventDefault();
          nextStreet();
          return;
        }
        // Z = undo
        if (key === "z") {
          undoLastAction();
          return;
        }
      } else {
        // 핸드 없을 때 N / Enter / Space = 새 핸드
        if ((key === "n" || key === "enter" || key === " ") && playingSeats.length >= 2) {
          e.preventDefault();
          startHand();
        }
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [currentHand, currentStreet, cardPickerFor, recapHand, showWinnerPicker, selectedWinners, selectedHi, selectedLo, seats, showEventName]);

  // ── 위너 선택 → 핸드 종료 → 포지션 로테이션 ──────────────────────────────
  // 다중 위너 확정 (1명이면 단독, 2명+면 스플릿/찹)
  const finalizeWinners = (winnerSeats) => {
    if (!winnerSeats || winnerSeats.length === 0) return;
    const names = winnerSeats.map(s => s.name);
    const winnerName = names.length === 1
      ? names[0]
      : `SPLIT: ${names.join(", ")}`;
    const finalHand = {
      ...currentHand,
      winnerName,
      winnerNames: names,
      winnerSeatId: names.length === 1 ? winnerSeats[0].id : null,
      isSplit: names.length > 1,
    };
    setHands(prev => [finalHand, ...prev]);
    setButtonSeatId(b => advanceButton(seats, b));
    setCurrentHand(null);
    setCurrentStreet(0);
    setShowWinnerPicker(false);
    setRecapHand(finalHand);
  };

  // Hi-Lo 확정: High 팟 승자 + Low 팟 승자 (같은 1명이면 Scoop)
  const finalizeWinnersHilo = (hiSeats, loSeats) => {
    if ((!hiSeats || hiSeats.length === 0) && (!loSeats || loSeats.length === 0)) return;
    const hiNames = (hiSeats || []).map(s => s.name);
    const loNames = (loSeats || []).map(s => s.name);
    const isScoop = hiSeats.length === 1 && loSeats.length === 1 && hiSeats[0].id === loSeats[0].id;
    let winnerName;
    if (isScoop) {
      winnerName = `SCOOP: ${hiNames[0]}`;
    } else {
      const hiPart = hiNames.length ? `High: ${hiNames.join(", ")}` : "High: —";
      const loPart = loNames.length ? `Low: ${loNames.join(", ")}` : "Low: —";
      winnerName = `${hiPart} / ${loPart}`;
    }
    const finalHand = {
      ...currentHand,
      winnerName,
      hiWinners: (hiSeats || []).map(s => s.id),
      loWinners: (loSeats || []).map(s => s.id),
      winnerSeatId: null,
      isSplit: true,
      isHilo: true,
    };
    setHands(prev => [finalHand, ...prev]);
    setButtonSeatId(b => advanceButton(seats, b));
    setCurrentHand(null);
    setCurrentStreet(0);
    setShowWinnerPicker(false);
    setSelectedHi([]); setSelectedLo([]);
    setRecapHand(finalHand);
  };

  const discardHand = () => {
    setCurrentHand(null);
    setCurrentStreet(0);
    setShowWinnerPicker(false);
  };

  // ── 방금 종료한 핸드 되돌리기 (RecapModal에서) ─────────────────────────────
  // hands[0]을 currentHand로 복원, 버튼은 그 핸드의 저장값으로 되돌림,
  // 마지막 액션 스트리트의 액션을 비우고 그 스트리트 처음부터 재입력.
  const reopenLastHand = () => {
    if (hands.length === 0) return;
    const last = hands[0];

    // winner 관련 필드 제거하고 복원
    const { winnerName, winnerNames, isSplit, winnerCards, winnerSeatId, autoWin, ...base } = last;

    // 마지막 액션 스트리트 찾기
    const SL = streetsOf(base);
    let lastActed = 0;
    for (let i = 0; i < SL.length; i++) {
      if ((base.streets[SL[i]] || []).length > 0) lastActed = i;
    }
    // 그 스트리트 + 이후 비움. 누락 키는 빈 배열로 정규화(구버전 핸드 호환).
    const newStreets = {};
    SL.forEach((k, i) => { newStreets[k] = (i >= lastActed) ? [] : (base.streets?.[k] || []); });
    // 보드도 lastActed 스트리트까지만 유지
    const keepBoard = lastActed === 0 ? 0 : (BOARD_COUNT_BY_STREET[SL[lastActed]] || 0);
    const newBoard = (base.board || [null, null, null, null, null]).map((c, i) => (i < keepBoard ? c : null));

    if (base.buttonSeatId != null) setButtonSeatId(base.buttonSeatId);
    setHands(prev => prev.slice(1));
    setCurrentHand({ ...base, streets: newStreets, board: newBoard });
    setCurrentStreet(lastActed);
    setShowWinnerPicker(false);
    setSelectedWinners([]);
    setRecapHand(null);
  };

  // ── 스트리트 되돌리기 ─────────────────────────────────────────────────────
  // 지나간 스트리트를 눌러 그 시작 상태로 복귀. 해당 스트리트 + 이후 액션을 모두 비움.
  // fromPicker=true(쇼다운 되돌리기)면 현재 스트리트로의 복귀도 허용.
  const goToStreet = (targetIdx, fromPicker = false) => {
    if (!currentHand) return;
    if (!fromPicker && targetIdx >= currentStreet) return; // 진행 중 탭: 현재/미래 차단
    const SL = streetsOf(currentHand);
    if (targetIdx < 0 || targetIdx >= SL.length) return;
    setCurrentHand(prev => {
      if (!prev) return prev;
      const newStreets = { ...prev.streets };
      const newRoundHole = { ...(prev.roundHole || {}) };
      for (let i = targetIdx; i < SL.length; i++) {
        newStreets[SL[i]] = [];
        delete newRoundHole[SL[i]];  // 되돌린 드로우 스냅샷 제거
      }
      // 보드도 되돌린 스트리트까지만 유지 (이후 깐 카드 제거 → stale 방지)
      const keepBoard = targetIdx === 0 ? 0 : (BOARD_COUNT_BY_STREET[SL[targetIdx]] || 0);
      const newBoard = (prev.board || [null, null, null, null, null]).map((c, i) => (i < keepBoard ? c : null));
      return { ...prev, streets: newStreets, board: newBoard, roundHole: newRoundHole };
    });
    setCurrentStreet(targetIdx);
    setShowWinnerPicker(false);
    setSelectedWinners([]);
  };

  // ── 시트 이름 저장 ───────────────────────────────────────────────────────
  const saveSeatName = () => {
    setSeats(prev => prev.map(s =>
      s.id === editingSeat
        ? {
            ...s,
            name: editName.trim(),
            position: editPosition || s.position,
            active: !!editName.trim(),
            out: editOut,
            // OUT 새로 켜면 카운트 0부터, 끄면 제거 (재진입 시 다시 2핸드 보장)
            outCount: editOut ? (s.out ? (s.outCount || 0) : 0) : 0,
          }
        : s
    ));
    setEditingSeat(null);
    setEditName("");
    setEditPosition("");
    setEditOut(false);
  };

  const streetList = streetsOf(currentHand);
  // currentStreet가 범위를 벗어나면 마지막 스트리트로 클램프(스트리트 키 누락 크래시 방지)
  const safeStreetIdx = Math.min(Math.max(currentStreet, 0), Math.max(0, streetList.length - 1));
  const currentStreetName = streetList[safeStreetIdx];
  const isHandActive = !!currentHand;
  const nextToActId = isHandActive ? (getNextToAct()?.id ?? null) : null;

  // ════════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════════
  return (
    <div style={{
      minHeight: "100vh",
      background: "#020912",
      fontFamily: MONO,
      color: "#e2e8f0",
    }}>

      {/* 탑 바 */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 18px",
        borderBottom: "1px solid #0a1628",
        background: "#030e1e",
        position: "sticky", top: 0, zIndex: 50,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            fontSize: 15, fontWeight: 900, letterSpacing: 3,
            color: "#10b981",
          }}>♠ POKER TRACK</span>
          {isHandActive && (
            <span style={{
              background: "#10b981", color: "#000",
              fontSize: 9, fontWeight: 900, padding: "2px 7px",
              borderRadius: 999, letterSpacing: 1,
            }}>● LIVE</span>
          )}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {["table", "log"].map(v => (
            <button key={v} onClick={() => setActiveView(v)} style={{
              padding: "4px 12px",
              background: activeView === v ? "#10b981" : "transparent",
              border: `1px solid ${activeView === v ? "#10b981" : "#1a2d45"}`,
              borderRadius: 5, color: activeView === v ? "#000" : "#7e8ca0",
              fontSize: 10, fontWeight: 700, cursor: "pointer", letterSpacing: 1,
            }}>{v.toUpperCase()}</button>
          ))}
          <button onClick={() => setShowHelp(true)} title="사용 설명서" style={{
            padding: "4px 11px",
            background: "transparent", border: "1px solid #1a2d45",
            borderRadius: 5, color: "#7dd3fc",
            fontSize: 12, fontWeight: 900, cursor: "pointer",
          }}>?</button>
        </div>
      </div>

      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
      {showPlayers && <PlayersModal seats={seats} buttonSeatId={buttonSeatId} onClose={() => setShowPlayers(false)} />}

      {/* ══════════════════ TABLE VIEW ══════════════════ */}
      {activeView === "table" && (
        <div style={{ padding: "6px 16px 8px" }}>

          {/* 게임(홀카드 장수) 선택 — 핸드 진행 중엔 잠금 */}
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            marginBottom: 8, flexWrap: "wrap",
          }}>
            <span style={{ color: "#7e8ca0", fontSize: 9, letterSpacing: 2, marginRight: 2 }}>GAME</span>
            {GAME_ORDER.map(id => {
              const g = GAME_TYPES[id];
              const isSel = gameType === id;
              return (
                <button
                  key={id}
                  onClick={() => changeGameType(id)}
                  disabled={cardCountLocked}
                  title={cardCountLocked ? "핸드 진행 중엔 변경 불가" : ""}
                  style={{
                    padding: "5px 10px",
                    background: isSel ? "#10b981" : "transparent",
                    border: `1px solid ${isSel ? "#10b981" : "#1a2d45"}`,
                    borderRadius: 5,
                    color: isSel ? "#000" : (cardCountLocked ? "#3a4a5e" : "#7e8ca0"),
                    fontSize: 11, fontWeight: 700,
                    cursor: cardCountLocked ? "not-allowed" : "pointer",
                    fontFamily: MONO,
                    opacity: cardCountLocked && !isSel ? 0.5 : 1,
                  }}
                >{g.label}</button>
              );
            })}
          </div>


          {/* 자리 교체 (스왑) 토글 — 핸드 진행 중엔 비활성 */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <button
              onClick={() => {
                if (isHandActive) return;
                setSwapMode(m => !m);
                setSwapFirst(null);
              }}
              disabled={isHandActive}
              style={{
                padding: "5px 12px",
                background: swapMode ? "#fbbf24" : "transparent",
                border: `1px solid ${swapMode ? "#fbbf24" : "#1a2d45"}`,
                borderRadius: 5,
                color: swapMode ? "#000" : (isHandActive ? "#3a4a5e" : "#7e8ca0"),
                fontSize: 11, fontWeight: 700,
                cursor: isHandActive ? "not-allowed" : "pointer",
                fontFamily: MONO,
              }}
            >⇄ 자리교체{swapMode ? " ON" : ""}</button>
            <button
              onClick={() => setShowPlayers(true)}
              style={{
                padding: "5px 12px",
                background: "transparent", border: "1px solid #1a2d45",
                borderRadius: 5, color: "#7dd3fc",
                fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: MONO,
              }}
            >👥 참가자 {playingSeats.length}</button>
            {swapMode && (
              <span style={{ color: "#fbbf24", fontSize: 10 }}>
                {swapFirst === null ? "옮길 자리를 탭하세요" : "바꿀 자리를 탭하세요 (같은 자리=취소)"}
              </span>
            )}
          </div>

          {/* 원형 테이블 (가로 100% 유지, 높이만 축소) */}
          <div style={{ position: "relative", width: "100%", paddingBottom: "58%", marginBottom: 6 }}>
            <div style={{ position: "absolute", inset: 0 }}>
              <svg viewBox="0 0 100 80" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
                <defs>
                  <radialGradient id="felt" cx="50%" cy="55%">
                    <stop offset="0%" stopColor="#063324" />
                    <stop offset="100%" stopColor="#011a12" />
                  </radialGradient>
                  <radialGradient id="rim" cx="50%" cy="50%">
                    <stop offset="0%" stopColor="#1a0e05" />
                    <stop offset="100%" stopColor="#0a0602" />
                  </radialGradient>
                </defs>
                <ellipse cx="50" cy="40" rx="46" ry="36" fill="url(#rim)" />
                <ellipse cx="50" cy="40" rx="43" ry="33" fill="url(#felt)" stroke="#0d4a31" strokeWidth=".6" />
                <ellipse cx="50" cy="40" rx="39" ry="29.5" fill="none" stroke="#0a3d28" strokeWidth=".3" strokeDasharray=".8 1.2" />
              </svg>

              {/* 중앙 */}
              <div style={{
                position: "absolute", left: "50%", top: "50%",
                transform: "translate(-50%,-50%)",
                textAlign: "center", zIndex: 5, pointerEvents: "none",
              }}>
                {currentHand ? (
                  <>
                    <div style={{ color: "#065f46", fontSize: 9, letterSpacing: 2 }}>HAND #{currentHand.number}</div>
                    <div style={{ color: "#f59e0b", fontSize: 14, fontWeight: 900, letterSpacing: 3, marginTop: 2 }}>
                      {currentStreetName}
                    </div>
                    <div style={{ display: "flex", gap: 3, justifyContent: "center", marginTop: 4 }}>
                      {streetList.map((_, i) => (
                        <div key={i} style={{
                          width: 7, height: 7, borderRadius: "50%",
                          background: i < currentStreet ? "#10b981"
                            : i === currentStreet ? "#f59e0b" : "#0f2a1e",
                          boxShadow: i === currentStreet ? "0 0 6px #f59e0b" : "none",
                        }} />
                      ))}
                    </div>
                  </>
                ) : (
                  <div style={{ color: "#0a2e1e", fontSize: 9, letterSpacing: 1 }}>
                    {playingSeats.length > 0 ? `${playingSeats.length} PLAYERS` : "EMPTY TABLE"}
                  </div>
                )}
              </div>

              {/* 시트들 */}
              {seats.map((seat, i) => {
                const pos = getSeatPos(i);
                const isNextToAct = nextToActId != null && seat.id === nextToActId;
                const lastAction = currentHand
                  ? currentHand.streets[currentStreetName]?.find(a => a.seatId === seat.id)
                  : null;

                // 상태 계산
                let isFolded = false;
                let isAllIn = false;
                if (currentHand) {
                  for (let k = 0; k <= currentStreet; k++) {
                    const street = streetList[k];
                    (currentHand.streets[street] || []).forEach(a => {
                      if (a.seatId === seat.id) {
                        if (a.action === "fold") isFolded = true;
                        if (a.action === "allin" || a.action === "allincall") isAllIn = true;
                      }
                    });
                  }
                }

                const actionColor = lastAction ? ACTIONS.find(a => a.id === lastAction.action)?.color : null;

                return (
                  <div key={seat.id} style={{
                    position: "absolute",
                    left: `${pos.x}%`, top: `${pos.y}%`,
                    transform: "translate(-50%,-50%)",
                    zIndex: 10, textAlign: "center",
                    opacity: isFolded ? .3 : 1,
                    filter: isFolded ? "grayscale(1)" : "none",
                    transition: "all .3s",
                  }}>
                    <button
                      onClick={() => handleSeatTap(seat)}
                      style={{
                        width: 46, height: 46, borderRadius: "50%",
                        background: isNextToAct ? "#0c3a44"
                          : actionColor
                          ? actionColor + "22"
                          : seat.active ? "#0a2e1e" : "#080c14",
                        border: `2px solid ${
                          swapMode && swapFirst === seat.id ? "#fbbf24"
                            : isNextToAct ? "#22d3ee"
                            : seat.out ? "#7f1d2e"
                            : actionColor ? actionColor
                            : seat.active ? "#10b981" : "#1a2d3f"
                        }`,
                        color: seat.active ? "#e2e8f0" : "#536583",
                        cursor: isHandActive ? "default" : "pointer",
                        display: "flex", flexDirection: "column",
                        alignItems: "center", justifyContent: "center",
                        gap: 1,
                        opacity: seat.out ? .4 : 1,
                        boxShadow: swapMode && swapFirst === seat.id ? "0 0 14px rgba(251,191,36,.6)"
                          : isNextToAct ? "0 0 16px rgba(34,211,238,.7)"
                          : actionColor ? `0 0 10px ${actionColor}55`
                          : seat.active && !seat.out ? "0 0 8px rgba(16,185,129,.2)" : "none",
                        animation: isNextToAct ? "nextPulse 1.1s infinite" : "none",
                      }}
                    >
                      <span style={{ fontSize: 8, color: isNextToAct ? "#22d3ee" : seat.out ? "#f87171" : seat.active ? "#10b981" : "#536583", letterSpacing: .5 }}>
                        {seat.out ? `OUT ${Math.max(0, OUT_VACATE_AFTER - (seat.outCount || 0))}` : (seat.name && seat.position) ? posLabel(seat.position) : (i + 1)}
                      </span>
                      <span style={{ fontSize: seat.name ? 9 : 14, fontWeight: seat.name ? 700 : 400 }}>
                        {seat.name ? seat.name.slice(0, 5) : "+"}
                      </span>
                    </button>
                    {buttonSeatId === seat.id && (
                      <div style={{
                        position: "absolute", top: -4, right: -4,
                        width: 18, height: 18, borderRadius: "50%",
                        background: "#eab308", color: "#000",
                        fontSize: 9, fontWeight: 900,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        border: "2px solid #050d1a",
                        zIndex: 12,
                      }}>D</div>
                    )}
                    {lastAction && (
                      <div style={{
                        marginTop: 2,
                        background: actionColor,
                        color: "#000", fontSize: 8, fontWeight: 900,
                        padding: "1px 4px", borderRadius: 3, letterSpacing: .5,
                        display: "inline-block",
                      }}>
                        {ACTIONS.find(a => a.id === lastAction.action)?.label}
                      </div>
                    )}
                    {isAllIn && !lastAction && (
                      <div style={{
                        marginTop: 2,
                        background: "#8b5cf6",
                        color: "#000", fontSize: 8, fontWeight: 900,
                        padding: "1px 4px", borderRadius: 3,
                      }}>ALL-IN</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 시트 이름 편집 */}
          {editingSeat !== null && !isHandActive && (
            <div style={{
              background: "#050d1a", border: "1px solid #0f1f35",
              borderRadius: 12, padding: 14, marginBottom: 12,
            }}>
              <div style={{ color: "#7e8ca0", fontSize: 9, marginBottom: 10, letterSpacing: 2 }}>
                SEAT {editingSeat + 1}
              </div>
              <input
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") { e.preventDefault(); saveSeatName(); }
                  else if (e.key === "Escape") { e.preventDefault(); setEditingSeat(null); }
                }}
                placeholder="이름 직접 입력... (Enter 확인)"
                autoFocus
                style={{
                  width: "100%", background: "#030e1e",
                  border: "1px solid #1a2d45", borderRadius: 8,
                  padding: "8px 12px", color: "#e2e8f0",
                  fontSize: 16, outline: "none", boxSizing: "border-box",
                  fontFamily: MONO,
                }}
              />

              {/* 포지션 선택 */}
              <div style={{
                color: "#7e8ca0", fontSize: 9, marginTop: 12, marginBottom: 6, letterSpacing: 2,
              }}>POSITION</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {POSITION_ORDER.map(p => {
                  // 다른 시트가 이미 쓰고 있는 포지션 비활성화
                  const takenBy = seats.find(s => s.id !== editingSeat && s.active && s.position === p);
                  const isSelected = editPosition === p;
                  return (
                    <button key={p} onClick={() => setEditPosition(p)} disabled={!!takenBy} style={{
                      padding: "5px 10px",
                      background: isSelected ? "#f59e0b"
                        : takenBy ? "#070f1c" : "#0a1628",
                      border: `1px solid ${
                        isSelected ? "#f59e0b"
                          : takenBy ? "#1a2d45" : "#1a2d45"
                      }`,
                      borderRadius: 6,
                      color: isSelected ? "#000"
                        : takenBy ? "#1a2d45" : "#94a3b8",
                      fontSize: 10, fontWeight: 700, cursor: takenBy ? "not-allowed" : "pointer",
                      letterSpacing: 1,
                      opacity: takenBy ? .3 : 1,
                    }}>{p}</button>
                  );
                })}
              </div>

              {/* 딜러 버튼 놓기 */}
              <button
                onClick={() => {
                  setButtonSeatId(editingSeat);
                  setEditingSeat(null);
                  setEditOut(false);
                }}
                style={{
                  width: "100%", marginTop: 12, padding: "9px",
                  background: buttonSeatId === editingSeat ? "#3a2e0a" : "#0a1628",
                  border: `1px solid ${buttonSeatId === editingSeat ? "#eab308" : "#1a2d45"}`,
                  borderRadius: 8,
                  color: buttonSeatId === editingSeat ? "#eab308" : "#64748b",
                  fontSize: 11, fontWeight: 700, cursor: "pointer",
                  letterSpacing: 1,
                }}
              >
                {buttonSeatId === editingSeat ? "🎯 현재 버튼 위치" : "🎯 여기에 버튼(D) 놓기"}
              </button>

              {/* 아웃 토글 (데드버튼: 포지션 마커는 남고 핸드 액션만 건너뜀) */}
              <button
                onClick={() => setEditOut(v => !v)}
                style={{
                  width: "100%", marginTop: 8, padding: "9px",
                  background: editOut ? "#3a1520" : "#0a1628",
                  border: `1px solid ${editOut ? "#7f1d2e" : "#1a2d45"}`,
                  borderRadius: 8,
                  color: editOut ? "#f87171" : "#64748b",
                  fontSize: 11, fontWeight: 700, cursor: "pointer",
                  letterSpacing: 1,
                }}
              >
                {editOut ? "🚫 아웃됨 (이번 핸드 미참여 · 포지션 유지)" : "이 자리 아웃시키기"}
              </button>

              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button onClick={saveSeatName} style={{
                  flex: 1, padding: "9px",
                  background: "#10b981", border: "none",
                  borderRadius: 8, color: "#000",
                  fontSize: 12, fontWeight: 900, cursor: "pointer",
                }}>✓ 확인</button>
                <button onClick={() => {
                  setSeats(prev => prev.map(s =>
                    s.id === editingSeat ? { ...s, name: "", active: false, out: false } : s
                  ));
                  setEditingSeat(null);
                  setEditOut(false);
                }} style={{
                  padding: "9px 14px",
                  background: "#0a1628", border: "1px solid #1a2d45",
                  borderRadius: 8, color: "#7e8ca0",
                  fontSize: 11, cursor: "pointer",
                }}>비우기</button>
                <button onClick={() => setEditingSeat(null)} style={{
                  padding: "9px 14px",
                  background: "transparent", border: "1px solid #1a2d45",
                  borderRadius: 8, color: "#7e8ca0",
                  fontSize: 11, cursor: "pointer",
                }}>취소</button>
              </div>
            </div>
          )}

          {/* 위너 선택 */}
          {showWinnerPicker && currentHand && (() => {
            const isHilo = !!GAME_TYPES[currentHand.gameType]?.hilo;
            return (
            <div style={{
              background: "#050d1a",
              border: "2px solid #f59e0b",
              borderRadius: 14, padding: 16, marginBottom: 12,
              boxShadow: "0 0 30px rgba(245,158,11,.2)",
            }}>
              <div style={{
                color: "#f59e0b", fontSize: 13, fontWeight: 900,
                letterSpacing: 2, marginBottom: 6, textAlign: "center",
              }}>🏆 WINNER 선택{isHilo ? " (Hi-Lo)" : ""}</div>
              <div style={{
                color: "#7e8ca0", fontSize: 10, marginBottom: 12, textAlign: "center",
              }}>{isHilo ? "HIGH / LOW 각각 선택 · 한 명이 둘 다 = SCOOP" : "여러 명 선택 시 SPLIT(찹) 처리"}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {getAlivePlayers(streetList.length - 1).map(seat => {
                  const isSel = selectedWinners.includes(seat.id);
                  const selHi = selectedHi.includes(seat.id);
                  const selLo = selectedLo.includes(seat.id);
                  const rowOn = isHilo ? (selHi || selLo) : isSel;
                  return (
                    <button
                      key={seat.id}
                      onClick={() => { if (isHilo) return; setSelectedWinners(prev =>
                        prev.includes(seat.id)
                          ? prev.filter(id => id !== seat.id)
                          : [...prev, seat.id]
                      ); }}
                      style={{
                        padding: "12px 16px",
                        background: rowOn ? "#1a3d2e" : "#0a1628",
                        border: `2px solid ${rowOn ? "#10b981" : "#1a2d45"}`,
                        borderRadius: 10,
                        color: "#e2e8f0",
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        cursor: isHilo ? "default" : "pointer",
                        transition: "all .15s",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        {!isHilo && (
                          <span style={{
                            width: 20, height: 20, borderRadius: 5,
                            border: `2px solid ${isSel ? "#10b981" : "#7e8ca0"}`,
                            background: isSel ? "#10b981" : "transparent",
                            color: "#000", fontSize: 12, fontWeight: 900,
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}>{isSel ? "✓" : ""}</span>
                        )}
                        <span style={{
                          background: "#0f172a", border: "1px solid #1e293b",
                          fontSize: 10, color: "#10b981", padding: "1px 6px", borderRadius: 4,
                        }}>{posLabel(seat.position)}</span>
                        <span style={{ fontSize: 14, fontWeight: 700 }}>{seat.name}</span>
                        {(() => {
                          const lastIdx = streetList.length - 1;
                          const isStudGame = !!GAME_TYPES[currentHand.gameType]?.stud;
                          const finalText = isStudGame
                            ? cardsToText(studAllCards(currentHand, seat.id))
                            : cardsToText(handAtStreet(currentHand, seat.id, lastIdx));
                          return (
                            <span
                              role="button"
                              onClick={(ev) => {
                                ev.stopPropagation();
                                if (isStudGame) setCardPickerFor({ studHand: { seatId: seat.id, slot: 6 } });
                                else setCardPickerFor({ showdown: { seatId: seat.id } });
                              }}
                              title={isStudGame ? "7th 다운카드 입력 (그 외 카드는 액션 화면에서 수정)" : "쇼다운 핸드 입력/수정"}
                              style={{
                                color: finalText ? "#fbbf24" : "#38bdf8",
                                fontSize: finalText ? 13 : 9, fontWeight: finalText ? 900 : 700,
                                fontFamily: MONO,
                                border: finalText ? "none" : "1px dashed #38bdf8",
                                borderRadius: 4, padding: finalText ? 0 : "1px 5px",
                                cursor: "pointer",
                              }}
                            >{finalText || "+핸드"}</span>
                          );
                        })()}
                      </div>
                      {isHilo ? (
                        <span style={{ display: "flex", gap: 6 }}>
                          <span
                            role="button"
                            onClick={(ev) => { ev.stopPropagation(); setSelectedHi(prev => prev.includes(seat.id) ? prev.filter(id => id !== seat.id) : [...prev, seat.id]); }}
                            style={{
                              padding: "5px 11px", borderRadius: 7, fontSize: 12, fontWeight: 900, fontFamily: MONO, cursor: "pointer",
                              background: selHi ? "#f59e0b" : "#0f172a",
                              border: `2px solid ${selHi ? "#f59e0b" : "#374151"}`,
                              color: selHi ? "#000" : "#7e8ca0",
                            }}>HI</span>
                          <span
                            role="button"
                            onClick={(ev) => { ev.stopPropagation(); setSelectedLo(prev => prev.includes(seat.id) ? prev.filter(id => id !== seat.id) : [...prev, seat.id]); }}
                            style={{
                              padding: "5px 11px", borderRadius: 7, fontSize: 12, fontWeight: 900, fontFamily: MONO, cursor: "pointer",
                              background: selLo ? "#3b82f6" : "#0f172a",
                              border: `2px solid ${selLo ? "#3b82f6" : "#374151"}`,
                              color: selLo ? "#000" : "#7e8ca0",
                            }}>LO</span>
                        </span>
                      ) : (
                        <span style={{ color: isSel ? "#10b981" : "#374151", fontSize: 16 }}>🏆</span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* 확정 버튼 */}
              {isHilo ? (() => {
                const hiSeats = getAlivePlayers(streetList.length - 1).filter(s => selectedHi.includes(s.id));
                const loSeats = getAlivePlayers(streetList.length - 1).filter(s => selectedLo.includes(s.id));
                const ready = hiSeats.length > 0 || loSeats.length > 0;
                const isScoop = hiSeats.length === 1 && loSeats.length === 1 && hiSeats[0].id === loSeats[0].id;
                return (
                  <button
                    onClick={() => { if (ready) finalizeWinnersHilo(hiSeats, loSeats); }}
                    disabled={!ready}
                    style={{
                      width: "100%", marginTop: 12, padding: "13px",
                      background: !ready ? "#070f1c" : "linear-gradient(135deg, #f59e0b, #b45309)",
                      border: "none", borderRadius: 10,
                      color: !ready ? "#1a2d45" : "#000",
                      fontSize: 13, fontWeight: 900, letterSpacing: 2,
                      cursor: !ready ? "not-allowed" : "pointer",
                    }}
                  >{isScoop ? "🏆 SCOOP 확정"
                    : `🏆 Hi-Lo 확정 (Hi ${hiSeats.length} / Lo ${loSeats.length})`}</button>
                );
              })() : (
                <button
                  onClick={() => {
                    const winnerSeats = getAlivePlayers(streetList.length - 1).filter(s => selectedWinners.includes(s.id));
                    if (winnerSeats.length > 0) {
                      finalizeWinners(winnerSeats);
                      setSelectedWinners([]);
                    }
                  }}
                  disabled={selectedWinners.length === 0}
                  style={{
                    width: "100%", marginTop: 12, padding: "13px",
                    background: selectedWinners.length === 0 ? "#070f1c"
                      : "linear-gradient(135deg, #f59e0b, #b45309)",
                    border: "none", borderRadius: 10,
                    color: selectedWinners.length === 0 ? "#1a2d45" : "#000",
                    fontSize: 13, fontWeight: 900, letterSpacing: 2,
                    cursor: selectedWinners.length === 0 ? "not-allowed" : "pointer",
                  }}
                >
                  {selectedWinners.length <= 1 ? "🏆 위너 확정"
                    : `🏆 SPLIT 확정 (${selectedWinners.length}명)`}
                </button>
              )}

              {(() => {
                // 실제 액션이 입력된 마지막 스트리트로 되돌리기.
                // (자동 점프로 currentStreet가 RIVER여도, 턴에서 올인 끝났으면 턴으로)
                let lastActed = -1;
                for (let i = 0; i < streetList.length; i++) {
                  if ((currentHand.streets[streetList[i]] || []).length > 0) lastActed = i;
                }
                if (lastActed < 0) return null;
                return (
                  <button onClick={() => goToStreet(lastActed, true)} style={{
                    marginTop: 8, width: "100%", padding: "8px",
                    background: "transparent", border: "1px solid #10b981",
                    borderRadius: 8, color: "#10b981",
                    fontSize: 11, fontWeight: 700, cursor: "pointer",
                    fontFamily: MONO,
                  }}>↶ {STREET_SHORT[streetList[lastActed]]} 로 되돌리기</button>
                );
              })()}
            </div>
            );
          })()}

          {/* 핸드 진행 */}
          {isHandActive && !showWinnerPicker && (
            <div style={{
              background: "#050d1a", border: "1px solid #0f1f35",
              borderRadius: 14, padding: 14,
            }}>
              {/* 스트리트 탭 */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 12, alignItems: "center" }}>
                {streetList.map((s, i) => {
                  const isPast = i < currentStreet;
                  return (
                    <button key={s}
                      onClick={() => isPast && goToStreet(i)}
                      disabled={!isPast}
                      title={isPast ? `${STREET_SHORT[s]} 시작으로 되돌리기` : undefined}
                      style={{
                        padding: "4px 11px",
                        background: i === currentStreet
                          ? "#f59e0b" : isPast ? "#0a2e1e" : "#070f1c",
                        border: `1px solid ${
                          i === currentStreet ? "#f59e0b"
                            : isPast ? "#10b981" : "#1a2d45"
                        }`,
                        borderRadius: 6,
                        color: i === currentStreet ? "#000"
                          : isPast ? "#10b981" : "#7286a0",
                        fontSize: 10, fontWeight: 700, letterSpacing: 1,
                        cursor: isPast ? "pointer" : "default",
                        fontFamily: MONO,
                      }}>{STREET_SHORT[s]}</button>
                  );
                })}
                <div style={{ flex: 1 }} />
                {(() => {
                  const curActs = (currentHand.streets[currentStreetName] || []).length;
                  const canUndo = curActs > 0 || currentStreet > 0;
                  return (
                <button onClick={undoLastAction} disabled={!canUndo} title="되돌리기 (액션·스트리트 한 단계씩)" style={{
                  padding: "5px 13px",
                  background: canUndo ? "linear-gradient(135deg,#0891b2,#0e6f8c)" : "transparent",
                  border: canUndo ? "none" : "1.5px solid #1a2d45",
                  borderRadius: 6, color: canUndo ? "#ffffff" : "#3a4a5e",
                  fontSize: 16, fontWeight: 900, cursor: canUndo ? "pointer" : "default",
                  boxShadow: canUndo ? "0 0 10px rgba(8,145,178,.5)" : "none",
                }}>↶</button>
                  );
                })()}
                <button onClick={discardHand} title="이 핸드 취소(삭제)" style={{
                  padding: "5px 12px",
                  background: "transparent", border: "1.5px solid #7a3030",
                  borderRadius: 6, color: "#f87171",
                  fontSize: 15, fontWeight: 800, cursor: "pointer",
                }}>✕</button>
              </div>

              {/* 보드 카드 (포스트플랍, 홀덤/오마하만): 칸 탭 → 해당 스트리트 카드 입력 */}
              {currentStreet >= 1 && !GAME_TYPES[currentHand.gameType]?.draw && BOARD_COUNT_BY_STREET[currentStreetName] && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
                  <span style={{ color: "#94a3b8", fontSize: 9, letterSpacing: 1, marginRight: 2, fontWeight: 700 }}>BOARD</span>
                  {Array.from({ length: BOARD_COUNT_BY_STREET[currentStreetName] }).map((_, idx) => {
                    const card = currentHand.board?.[idx];
                    const label = card ? cardLabel(card) : "";
                    const filled = !!label;
                    const col = card && SUIT_COLOR[card[1]] ? SUIT_COLOR[card[1]] : null;
                    return (
                      <button key={idx}
                        onClick={() => setCardPickerFor({ board: currentStreetName })}
                        title={`${STREET_SHORT[currentStreetName]} 보드 편집 (${BOARD_COUNT_BY_STREET[currentStreetName]}장)`}
                        style={{
                          width: 30, height: 40, borderRadius: 5,
                          background: filled ? "#fafafa" : "#06243a",
                          border: filled ? "1px solid #2a4a6e" : "1.5px dashed #38bdf8",
                          color: filled ? (col || "#0f172a") : "#7dd3fc",
                          fontSize: filled ? 15 : 18, fontWeight: 800,
                          cursor: "pointer", fontFamily: MONO,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          padding: 0,
                          boxShadow: filled ? "none" : "0 0 8px rgba(56,189,248,.25)",
                        }}>{label || "+"}</button>
                    );
                  })}
                </div>
              )}
              {(() => {
                const nextPlayer = getNextToAct();

                if (!nextPlayer) return null; // 라운드 완료 → 아래 '다음 버튼'이 활성화됨

                const isStudGame = !!GAME_TYPES[currentHand.gameType]?.stud;
                const handCardCount = currentHand.cardCount || holeCardCount;
                // 드로우 게임: 그 시점 스냅샷(드로우 후 핸드). 비드로우/딜은 holeCards.
                const rawHole = handAtStreet(currentHand, nextPlayer.id, currentStreet);
                const holeCards = rawHole || Array(handCardCount).fill(null);
                // A규칙: 카드 모달에서 확정(entry 생성)되면 ?라도 액션 허용
                const hasCardsForNext = !!rawHole && rawHole.length > 0;

                return (
                  <div style={{
                    background: "#0a2e1e",
                    border: "1.5px solid #10b981",
                    borderRadius: 12, padding: "14px 14px",
                    boxShadow: "0 0 16px rgba(16,185,129,.25)",
                  }}>
                    {/* 스터드: 스트리트 시작 액션자 선택 (액션 전에만) */}
                    {isStudGame && (currentHand.streets[currentStreetName] || []).length === 0 && (() => {
                      const alive = getActionablePlayers();
                      const picked = currentHand.studFirstSeat?.[currentStreetName];
                      const is3rd = currentStreetName === "3RD";
                      return (
                        <div style={{
                          marginBottom: 12, padding: "8px 10px",
                          background: "#03101f", border: "1px dashed #f97316", borderRadius: 8,
                        }}>
                          <span style={{ color: "#f97316", fontSize: 9, fontWeight: 800, letterSpacing: 1 }}>
                            {is3rd ? "BRING-IN 선택 (이 사람부터 시작)" : `${STREET_SHORT[currentStreetName]} 첫 액션 선택`}
                          </span>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 6 }}>
                            {alive.map(p => {
                              const sel = picked === p.id;
                              return (
                                <button key={p.id}
                                  onClick={() => setCurrentHand(prev => !prev ? prev : ({
                                    ...prev,
                                    studFirstSeat: { ...(prev.studFirstSeat || {}), [currentStreetName]: p.id },
                                  }))}
                                  style={{
                                    display: "inline-flex", alignItems: "center", gap: 4,
                                    fontSize: 11, fontWeight: 700,
                                    background: sel ? "#f97316" : "#0a1c2c",
                                    border: `1px solid ${sel ? "#f97316" : "#1e3a52"}`,
                                    color: sel ? "#0a0a0a" : "#cbd5e1",
                                    padding: "4px 9px", borderRadius: 6, cursor: "pointer",
                                  }}>
                                  <span style={{ fontSize: 9, color: sel ? "#0a0a0a" : "#10b981" }}>{posLabel(p.position)}</span>
                                  {p.name}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                    {/* 헤더 */}
                    <div style={{
                      display: "flex", alignItems: "center", gap: 10,
                      marginBottom: 12, flexWrap: "wrap",
                    }}>
                      {currentHand.dead?.button && (
                        <span style={{
                          fontSize: 9, color: "#eab308",
                          border: "1px solid #eab308", padding: "2px 8px",
                          borderRadius: 4, letterSpacing: 1, fontWeight: 700,
                        }}>DEAD BTN</span>
                      )}
                      {currentHand.dead?.small && (
                        <span style={{
                          fontSize: 9, color: "#f87171",
                          border: "1px solid #f87171", padding: "2px 8px",
                          borderRadius: 4, letterSpacing: 1, fontWeight: 700,
                        }}>DEAD SB</span>
                      )}
                      <button
                        onClick={() => setPosEditOpen(v => !v)}
                        style={{
                          background: posEditOpen ? "#10b981" : "#020a14",
                          border: "1px solid #10b981",
                          fontSize: 11, color: posEditOpen ? "#000" : "#10b981",
                          padding: "2px 8px", borderRadius: 4, letterSpacing: 1,
                          fontWeight: 700, cursor: "pointer", fontFamily: MONO,
                        }}
                        title="포지션 수정"
                      >{posLabel(nextPlayer.position)} ▾</button>
                      <span style={{ fontSize: 16, fontWeight: 900, color: "#fff" }}>
                        {nextPlayer.name}
                      </span>
                      {/* 홀카드 */}
                      {isStudGame ? (
                        <div style={{ marginLeft: "auto", maxWidth: "72%" }}>
                          <StudCardGrid
                            hand={currentHand}
                            seatId={nextPlayer.id}
                            currentStreetIdx={currentStreet}
                            onPick={(slot) => setCardPickerFor({ studHand: { seatId: nextPlayer.id, slot } })}
                          />
                        </div>
                      ) : (
                       <>
                      {currentStreet === 0 && (
                        <button
                          onClick={() => setCardPickerFor({ seatId: nextPlayer.id })}
                          title="딜 카드 입력/수정 [H]"
                          style={{
                            display: "flex", gap: 3, flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end",
                            background: "#06243a", border: "1.5px solid #38bdf8",
                            borderRadius: 8, padding: "4px 8px",
                            cursor: "pointer", marginLeft: "auto", maxWidth: "62%",
                            boxShadow: "0 0 10px rgba(56,189,248,.35)",
                          }}
                        >
                          {holeCards.map((c, slot) => {
                            const sw = handCardCount <= 2 ? 30 : handCardCount <= 5 ? 26 : 22;
                            const sh = Math.round(sw * 40 / 30);
                            return (
                              <div key={slot} style={{
                                width: sw, height: sh,
                                background: c ? "transparent" : "#020a14",
                                border: c ? "none" : "1.5px dashed #fbbf24",
                                borderRadius: 5,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                color: "#fbbf24", fontSize: 14,
                                animation: !c ? "cardPulse 1.2s infinite" : "none",
                              }}>
                                {c ? <CardChip card={c} size={handCardCount <= 2 ? "md" : "sm"} /> : "?"}
                              </div>
                            );
                          })}
                          <span style={{ fontSize: 12, color: "#38bdf8", marginLeft: 2 }}>✎</span>
                        </button>
                      )}
                      {currentStreet === 0 && !hasCardsForNext && (
                        <span style={{
                          fontSize: 9, color: "#fde68a",
                          background: "#3a2e0a",
                          border: "1px solid #eab308",
                          padding: "3px 7px", borderRadius: 4,
                          letterSpacing: 1, fontWeight: 700,
                          width: "100%",
                          textAlign: "center", marginTop: 6,
                        }}>← 카드 선택 후 액션 (폴드는 가능)</span>
                      )}
                      {currentStreet > 0 && (
                        <button
                          onClick={() => setCardPickerFor({ edit: { seatId: nextPlayer.id, streetIdx: currentStreet } })}
                          title="이 라운드 핸드 입력/수정"
                          style={{
                            marginLeft: "auto",
                            display: "inline-flex", alignItems: "center", gap: 6,
                            background: "#06243a", border: "1.5px solid #38bdf8",
                            borderRadius: 8, padding: "4px 10px",
                            cursor: "pointer", fontFamily: MONO,
                            boxShadow: "0 0 10px rgba(56,189,248,.35)",
                          }}
                        >
                          {cardsToText(holeCards) ? (
                            <span style={{ color: "#fbbf24", fontSize: 16, fontWeight: 900 }}>
                              {cardsToText(holeCards)}
                            </span>
                          ) : (
                            <span style={{ color: "#7dd3fc", fontSize: 11, fontWeight: 700, animation: "cardPulse 1.2s infinite" }}>핸드 입력</span>
                          )}
                          <span style={{ fontSize: 12, color: "#38bdf8" }}>✎</span>
                        </button>
                      )}
                       </>
                      )}
                    </div>

                    {/* 포지션 수정 패널 (배지 클릭 시) */}
                    {posEditOpen && (
                      <div style={{
                        display: "flex", flexWrap: "wrap", gap: 5,
                        marginBottom: 10, padding: 8,
                        background: "#020a14", borderRadius: 8,
                        border: "1px solid #0f3d2a",
                      }}>
                        {POSITION_ORDER.map(p => {
                          const isCur = nextPlayer.position === p;
                          return (
                            <button key={p}
                              onClick={() => { changeSeatPosition(nextPlayer.id, p); setPosEditOpen(false); }}
                              style={{
                                padding: "5px 9px",
                                background: isCur ? "#10b981" : "#0a1628",
                                border: `1px solid ${isCur ? "#10b981" : "#1a2d45"}`,
                                borderRadius: 6,
                                color: isCur ? "#000" : "#94a3b8",
                                fontSize: 10, fontWeight: 700, cursor: "pointer",
                                letterSpacing: 1, fontFamily: MONO,
                              }}
                            >{posLabel(p)}</button>
                          );
                        })}
                      </div>
                    )}

                    {/* 베팅 금액 (선택) — OPEN/BET/RAISE/ALL-IN/ALL-IN CALL에 적용 */}
                    <div style={{
                      display: "flex", alignItems: "center", gap: 6, marginBottom: 8,
                    }}>
                      <span style={{ color: "#7e8ca0", fontSize: 9, letterSpacing: 1 }}>금액</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        className="bet-amount-input"
                        value={betAmountInput}
                        onChange={e => {
                          const v = e.target.value;
                          if (v === "" || /^\d*\.?\d*$/.test(v)) setBetAmountInput(v);
                        }}
                        placeholder="예 23500+- or 23.5+K"
                        style={{
                          flex: 1, minWidth: 0,
                          background: "#020a14",
                          border: "1px solid #1a2d45",
                          borderRadius: 6, padding: "8px 10px",
                          color: "#e2e8f0", fontSize: 16, fontWeight: 700,
                          fontFamily: MONO,
                        }}
                      />
                      {["", "k", "m"].map(u => {
                        const sel = betUnit === u;
                        return (
                          <button
                            key={u || "none"}
                            onClick={() => setBetUnit(u)}
                            style={{
                              padding: "8px 12px",
                              background: sel ? "#10b981" : "transparent",
                              border: `1px solid ${sel ? "#10b981" : "#2a3f5c"}`,
                              borderRadius: 6,
                              color: sel ? "#000" : "#9fb3c8",
                              fontSize: 12, fontWeight: 900, cursor: "pointer",
                              fontFamily: MONO,
                            }}
                          >{u === "" ? "—" : u.toUpperCase()}</button>
                        );
                      })}
                      {betAmountInput && (
                        <span style={{ color: "#cbd5e1", fontSize: 12, fontWeight: 900, minWidth: 40, textAlign: "right",
                          fontFamily: MONO }}>
                          {makeAmountText(betAmountInput, betUnit) || ""}
                        </span>
                      )}
                    </div>

                    {/* 액션 버튼 */}
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                      {ACTIONS.filter((action) => {
                        const stud = !!GAME_TYPES[currentHand.gameType]?.stud;
                        if (action.id === "bringin" || action.id === "complete") return stud; // 스터드 전용
                        if (action.id === "open") return !stud; // 스터드는 OPEN 미사용
                        return true;
                      }).map((action) => {
                        // 버튼 탭 전용 (가용성은 isActionDisabled로 판정)
                        const disabled = isActionDisabled(action.id, nextPlayer);

                        return (
                          <button
                            key={action.id}
                            onClick={() => { if (!disabled) { setPosEditOpen(false); doAction(nextPlayer.id, action.id); } }}
                            disabled={disabled}
                            style={{
                              flex: "1 1 auto", minWidth: 70,
                              padding: "11px 12px",
                              background: disabled ? "#0a1424" : action.color + "22",
                              border: `1.5px solid ${disabled ? "#2d3f5c" : action.color}`,
                              borderRadius: 8,
                              color: disabled ? "#536583" : action.color,
                              fontSize: 12, fontWeight: 900,
                              cursor: disabled ? "not-allowed" : "pointer",
                              letterSpacing: 1,
                              opacity: disabled ? .65 : 1,
                              transition: "all .1s",
                              position: "relative",
                            }}
                          >
                            {action.lines ? (
                              <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.05, alignItems: "center" }}>
                                {action.lines.map((l, k) => (
                                  <span key={k} style={{ fontSize: 10 }}>{l}</span>
                                ))}
                              </span>
                            ) : (
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                                {action.label}
                                {ACTION_KEY[action.id] && (
                                  <span style={{ fontSize: 9, opacity: 0.55, fontWeight: 700, letterSpacing: 0 }}>
                                    [{ACTION_KEY[action.id]}]
                                  </span>
                                )}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* 다음 스트리트 / 위너 버튼 — 라운드 완료 시에만 표시 (액션 중엔 숨김) */}
              {(() => {
                if (!isRoundComplete()) return null;
                const actionableCount = getActionablePlayers().length;
                const goToShowdown = actionableCount <= 1;
                const lastIdx = streetList.length - 1;
                const isGold = currentStreet === lastIdx || goToShowdown;
                return (
                  <button
                    onClick={nextStreet}
                    style={{
                      width: "100%", marginTop: 12, padding: "15px 12px",
                      background: isGold ? "linear-gradient(135deg, #f59e0b, #b45309)"
                        : "linear-gradient(135deg, #1a3a8f, #0f2060)",
                      border: "none", borderRadius: 12,
                      color: "#fff", fontSize: 14, fontWeight: 900, letterSpacing: 2,
                      cursor: "pointer",
                      boxShadow: isGold ? "0 0 20px rgba(245,158,11,.4)" : "0 0 16px rgba(26,58,143,.4)",
                    }}
                  >
                    {goToShowdown ? "🏆 SHOWDOWN → WINNER 선택"
                      : currentStreet < lastIdx ? `→ ${STREET_SHORT[streetList[currentStreet + 1]]} 로 이동`
                        : "🏆 WINNER 선택"}
                  </button>
                );
              })()}

              {/* 누적 액션 로그 (Pre부터 현재까지 전체) */}
              {(() => {
                const hasAny = streetList.some(s =>
                  (currentHand.streets[s] || []).length > 0);
                if (!hasAny) return null;
                // 같은 카드 2명+ 이면 이름 표시 (로그와 동일 규칙)
                const dupCardSeats = computeDupCardSeats(currentHand);
                return (
                  <div style={{
                    marginTop: 12, padding: "8px 10px",
                    background: "#020a14", border: "1px solid #0f1f35",
                    borderRadius: 8,
                  }}>
                    {GAME_TYPES[currentHand.gameType]?.name && (
                      <div style={{
                        color: "#10b981", fontSize: 10, fontWeight: 800, letterSpacing: 1,
                        marginBottom: 6, paddingBottom: 5, borderBottom: "1px solid #0f1f35",
                      }}>{GAME_TYPES[currentHand.gameType].name}</div>
                    )}
                    <BoardLine hand={currentHand} size="sm" />
                    {streetList.map((s, idx) => (
                      <StreetLine key={s} hand={currentHand} streetIdx={idx} dupCardSeats={dupCardSeats} size="sm" />
                    ))}
                  </div>
                );
              })()}

              {/* 살아있는 사람들 요약 */}
              <div style={{
                marginTop: 12, padding: "8px 10px",
                background: "#020a14",
                border: "1px solid #0f1f35",
                borderRadius: 8,
                display: "flex", flexWrap: "wrap",
                gap: GAME_TYPES[currentHand.gameType]?.stud ? 10 : 6,
                alignItems: GAME_TYPES[currentHand.gameType]?.stud ? "stretch" : "center",
                flexDirection: GAME_TYPES[currentHand.gameType]?.stud ? "column" : "row",
              }}>
                <span style={{ color: "#7e8ca0", fontSize: 9, letterSpacing: 2 }}>
                  ALIVE
                </span>
                {GAME_TYPES[currentHand.gameType]?.stud
                  ? getActionablePlayers().map(p => (
                      <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, minWidth: 64 }}>
                          <span style={{ color: "#10b981", fontSize: 10, fontWeight: 700 }}>{posLabel(p.position)}</span>
                          <span style={{ color: "#cbd5e1", fontWeight: 700, fontSize: 12 }}>{p.name}</span>
                        </span>
                        <StudCardGrid
                          hand={currentHand}
                          seatId={p.id}
                          currentStreetIdx={currentStreet}
                          onPick={(slot) => setCardPickerFor({ studHand: { seatId: p.id, slot } })}
                          size="sm"
                        />
                      </div>
                    ))
                  : getActionablePlayers().map(p => {
                  const hc = handAtStreet(currentHand, p.id, currentStreet);
                  const hcText = cardsToText(hc);
                  // 언제든(액션 후/드로우 후 포함) 핸드 칩 탭 → 그 시점 핸드 수정.
                  // street0=딜(holeCards), 드로우=해당 라운드 스냅샷에 기록.
                  const inner = (
                    <>
                      <span style={{ color: "#10b981", fontSize: 9 }}>{posLabel(p.position)}</span>
                      <span style={{ color: "#94a3b8", fontWeight: 700 }}>{p.name}</span>
                      {hcText ? (
                        <span style={{ color: "#fbbf24", fontFamily: MONO, fontWeight: 900 }}>
                          {hcText}
                        </span>
                      ) : (
                        <span style={{
                          color: "#fbbf24", fontSize: 9, fontWeight: 700,
                          border: "1px dashed #fbbf24", borderRadius: 4, padding: "0 4px",
                        }}>+카드</span>
                      )}
                    </>
                  );
                  return (
                    <button key={p.id}
                      onClick={() => setCardPickerFor({ edit: { seatId: p.id, streetIdx: currentStreet } })}
                      title={currentStreet === 0 ? "딜 카드 입력/수정" : "이 라운드 핸드 입력/수정"}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        fontSize: 11, background: "#0a1c2c", border: "1px solid #1e3a52",
                        padding: "3px 6px", borderRadius: 6, cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                    >{inner}<span style={{ fontSize: 9, color: "#38bdf8" }}>✎</span></button>
                  );
                })}
              </div>

              {/* 스터드 업카드 보드 (현재 스트리트 업카드를 생존자별로 한눈에 입력) */}
              {GAME_TYPES[currentHand.gameType]?.stud && STUD_UP_STREETS.has(currentStreetName) && (() => {
                const alive = getActionablePlayers();
                const slot = STUD_UP_SLOT[currentStreetName];
                return (
                  <div style={{
                    marginTop: 10, padding: "8px 10px",
                    background: "#03101f", border: "1px solid #13314c", borderRadius: 8,
                  }}>
                    <span style={{ color: "#7e8ca0", fontSize: 9, letterSpacing: 2 }}>업카드 ({STREET_SHORT[currentStreetName]}▲)</span>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                      {alive.map(p => {
                        const card = studCardAt(currentHand, p.id, slot);
                        const label = card ? cardLabel(card) : null;
                        const col = card && SUIT_COLOR[card[1]] ? SUIT_COLOR[card[1]] : "#7dd3fc";
                        return (
                          <button key={p.id}
                            onClick={() => setCardPickerFor({ studHand: { seatId: p.id, slot } })}
                            style={{
                              display: "inline-flex", alignItems: "center", gap: 4,
                              fontSize: 11, background: label ? "#fafafa" : "#06243a",
                              border: label ? "1px solid #2a4a6e" : "1.5px dashed #38bdf8",
                              padding: "3px 8px", borderRadius: 6, cursor: "pointer",
                              boxShadow: label ? "none" : "0 0 6px rgba(56,189,248,.2)",
                            }}>
                            <span style={{ color: "#10b981", fontSize: 9 }}>{posLabel(p.position)}</span>
                            <span style={{ color: label ? "#0f172a" : "#94a3b8", fontWeight: 700, fontSize: 11 }}>{p.name}</span>
                            {label
                              ? <span style={{ color: col, fontFamily: MONO, fontWeight: 900, fontSize: 13 }}>{label}</span>
                              : <span style={{ color: "#7dd3fc", fontSize: 10, fontWeight: 700 }}>+업</span>
                            }
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* 승률 계산 (홀덤 전용) — 스트리트 선택해서 그 상황 승률 보기 */}
              {GAME_TYPES[currentHand.gameType]?.cards === 2 && !GAME_TYPES[currentHand.gameType]?.stud && (() => {
                const eligible = equityEligible().length;
                const ready = eligible >= 2;
                return (
                  <div style={{
                    marginTop: 12, padding: "10px 12px",
                    background: "#020a14", border: "1px solid #0f1f35", borderRadius: 8,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: ready ? 8 : 0 }}>
                      <span style={{ color: "#0ea5e9", fontSize: 9, fontWeight: 900, letterSpacing: 1, fontFamily: MONO }}>📊 승률</span>
                      <span style={{ marginLeft: "auto", color: "#64748b", fontSize: 9, letterSpacing: 1 }}>
                        {ready ? `${eligible}명 비교` : "문양 입력 필요"}
                      </span>
                    </div>
                    {ready && (
                      <div style={{ display: "flex", gap: 6 }}>
                        {streetList.map(s => {
                          const sel = equityStreet === s;
                          const need = BOARD_COUNT_BY_STREET[s] || 0;
                          const have = (currentHand.board || []).slice(0, need).filter(cardIsSuited).length;
                          const boardReady = have >= need;
                          return (
                            <button key={s}
                              onClick={() => runEquityFor(s)}
                              disabled={equityBusy}
                              style={{
                                flex: 1, padding: "8px 4px", borderRadius: 7,
                                background: sel ? "linear-gradient(135deg,#0ea5e9,#0369a1)" : "transparent",
                                border: `1px solid ${sel ? "#0ea5e9" : boardReady ? "#1e3a52" : "#142235"}`,
                                color: sel ? "#fff" : boardReady ? "#9fb3c8" : "#3a4a5e",
                                fontSize: 11, fontWeight: 800, letterSpacing: 1,
                                cursor: equityBusy ? "wait" : "pointer", fontFamily: MONO,
                              }}
                            >{STREET_SHORT[s]}</button>
                          );
                        })}
                      </div>
                    )}

                    {equityBusy && (
                      <div style={{ marginTop: 8, color: "#7dd3fc", fontSize: 10 }}>계산 중…</div>
                    )}
                    {equityResult?.error && (
                      <div style={{ marginTop: 8, color: "#f59e0b", fontSize: 10 }}>{equityResult.error}</div>
                    )}
                    {equityResult?.players && (
                      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                        {equityResult.players.map((p, i) => (
                          <div key={p.seatId} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ width: 116, display: "inline-flex", alignItems: "center", gap: 5, overflow: "hidden" }}>
                              {p.position && (
                                <span style={{ color: "#10b981", fontSize: 9, fontWeight: 700, minWidth: 22 }}>{p.position}</span>
                              )}
                              <span style={{ color: i === 0 ? "#10b981" : "#cbd5e1", fontSize: 12, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name || "?"}</span>
                              <span style={{ color: "#fbbf24", fontSize: 12, fontWeight: 900, fontFamily: MONO, whiteSpace: "nowrap" }}>{cardsToText(p.cards)}</span>
                            </span>
                            <div style={{ flex: 1, height: 14, background: "#071726", borderRadius: 7, overflow: "hidden", position: "relative" }}>
                              <div style={{
                                width: `${Math.round(p.equity * 100)}%`, height: "100%",
                                background: i === 0 ? "linear-gradient(90deg,#10b981,#059669)" : "linear-gradient(90deg,#334155,#1e293b)",
                                transition: "width .3s",
                              }} />
                            </div>
                            <span style={{ width: 44, textAlign: "right", color: i === 0 ? "#10b981" : "#94a3b8", fontSize: 12, fontWeight: 900, fontFamily: MONO }}>
                              {(p.equity * 100).toFixed(1)}%
                            </span>
                          </div>
                        ))}
                        <div style={{ color: "#475569", fontSize: 8, letterSpacing: 1, marginTop: 2 }}>
                          {(equityResult.street ? STREET_SHORT[equityResult.street] + " 기준 · " : "")}
                          {equityResult.exact ? "정확 계산(완전열거)" : `몬테카를로 ${(equityResult.iterations / 1000).toFixed(0)}k 샘플 · 타이 포함 지분`}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

            </div>
          )}

          {/* NEW HAND */}
          {!isHandActive && (
            <button
              onClick={startHand}
              disabled={playingSeats.length < 2}
              style={{
                width: "100%", padding: "14px",
                background: playingSeats.length >= 2
                  ? "linear-gradient(135deg, #10b981, #059669)"
                  : "#070f1c",
                border: `1px solid ${playingSeats.length >= 2 ? "#10b981" : "#1a2d45"}`,
                borderRadius: 12,
                color: playingSeats.length >= 2 ? "#000" : "#536583",
                fontSize: 14, fontWeight: 900,
                cursor: playingSeats.length >= 2 ? "pointer" : "not-allowed",
                letterSpacing: 3,
              }}
            >
              {playingSeats.length >= 2
                ? `▶ NEW HAND  (${playingSeats.length}명)`
                : "시트를 설정하세요 (최소 2명)"}
            </button>
          )}

          {/* 초기화 (핸드 진행 중이 아닐 때만) */}
          {!isHandActive && (
            <button
              onClick={() => {
                const ok = window.confirm(
                  "전체 초기화하시겠습니까?\n\n저장된 모든 핸드 기록과 시트 설정이 삭제됩니다.\n이 작업은 되돌릴 수 없습니다."
                );
                if (!ok) return;
                setHands([]);
                setSeats(initSeats());
                setButtonSeatId(null);
                setCurrentHand(null);
                setCurrentStreet(0);
                setShowWinnerPicker(false);
                setSelectedWinners([]);
                setRecapHand(null);
                setEditingSeat(null);
                setCardPickerFor(null);
              }}
              style={{
                width: "100%", padding: "10px",
                marginTop: 10,
                background: "transparent",
                border: "1px solid #3a1520",
                borderRadius: 10,
                color: "#7f1d2e",
                fontSize: 11, fontWeight: 700,
                cursor: "pointer",
                letterSpacing: 2,
              }}
            >
              🗑 전체 초기화 (핸드 + 시트)
            </button>
          )}
        </div>
      )}

      {/* ══════════════════ LOG VIEW ══════════════════ */}
      {activeView === "log" && (
        <div style={{ padding: "14px 16px" }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: 14, gap: 8,
          }}>
            <span style={{ color: "#7e8ca0", fontSize: 10, letterSpacing: 3 }}>
              HAND HISTORY
            </span>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <button
                onClick={() => setShowEventName(v => !v)}
                title="복사 로그 최상단의 게임 이벤트명 표시 여부"
                style={{
                  background: showEventName ? "#0f2a1e" : "#0a1628",
                  border: `1px solid ${showEventName ? "#10b981" : "#1a2d45"}`,
                  borderRadius: 6, padding: "3px 10px",
                  color: showEventName ? "#10b981" : "#64748b", fontSize: 10, fontWeight: 700,
                  letterSpacing: 1, cursor: "pointer",
                  fontFamily: MONO,
                }}
              >이벤트명 {showEventName ? "ON" : "OFF"}</button>
              {hands.length > 0 && (
                <>
                  <button
                    onClick={() => {
                      // 핸드 하나당 한 셀(여러 줄), 핸드끼리는 세로(다음 행)로 배치
                      const all = hands.slice().reverse()
                        .map(h => toSheetCell(handToText(h, showEventName)))
                        .join("\n");
                      if (navigator.clipboard) navigator.clipboard.writeText(all);
                    }}
                    style={{
                      background: "#0a1628", border: "1px solid #1a2d45",
                      borderRadius: 6, padding: "3px 10px",
                      color: "#94a3b8", fontSize: 10, fontWeight: 700,
                      letterSpacing: 1, cursor: "pointer",
                      fontFamily: MONO,
                    }}
                  >📋 ALL</button>
                  <button
                    onClick={() => {
                      if (window.confirm(`전체 ${hands.length}개 핸드를 삭제할까요?\n복구 불가능합니다.`)) {
                        setHands([]);
                      }
                    }}
                    style={{
                      background: "#2d1a1a", border: "1px solid #4a2020",
                      borderRadius: 6, padding: "3px 10px",
                      color: "#dc2626", fontSize: 10, fontWeight: 700,
                      letterSpacing: 1, cursor: "pointer",
                      fontFamily: MONO,
                    }}
                  >🗑 전체삭제</button>
                </>
              )}
              <span style={{
                background: "#0a1628", color: "#10b981",
                fontSize: 11, fontWeight: 700, padding: "2px 10px",
                borderRadius: 999, border: "1px solid #0f2a1e",
              }}>{hands.length} hands</span>
            </div>
          </div>

          {hands.length === 0 ? (
            <div style={{
              textAlign: "center", padding: "60px 20px",
              color: "#1a2d45", fontSize: 13, letterSpacing: 1,
            }}>아직 기록된 핸드가 없습니다</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {hands.map(hand => (
                <HandHistoryCard key={hand.id} hand={hand} showEventName={showEventName} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* 카드 선택 모달 */}
      <CardPickerModal
        open={!!cardPickerFor}
        onClose={closeCardPicker}
        onSelectBoth={handleCardPick}
        initialCards={
          cardPickerFor?.studHand
            ? (currentHand?.studCards?.[cardPickerFor.studHand.seatId] || Array(STUD_SLOTS.length).fill(null))
            : cardPickerFor?.board
              ? (currentHand?.board || []).slice(0, BOARD_COUNT_BY_STREET[cardPickerFor.board])
              : cardPickerFor?.showdown
                ? (handAtStreet(currentHand, cardPickerFor.showdown.seatId, streetsOf(currentHand).length - 1) || [])
                : cardPickerFor?.edit
                  ? (handAtStreet(currentHand, cardPickerFor.edit.seatId, cardPickerFor.edit.streetIdx) || [])
                  : (currentHand?.holeCards[cardPickerFor?.seatId] || [null, null])
        }
        cardCount={
          cardPickerFor?.studHand
            ? STUD_SLOTS.length
            : cardPickerFor?.board
              ? BOARD_COUNT_BY_STREET[cardPickerFor.board]
              : (currentHand?.cardCount || holeCardCount)
        }
        initialActiveSlot={cardPickerFor?.studHand ? cardPickerFor.studHand.slot : null}
        slotMeta={cardPickerFor?.studHand ? STUD_SLOTS.map(m => ({ label: STREET_SHORT[m.street], face: m.face })) : null}
      />

      {/* 핸드 종료 리캡 모달 */}
      <RecapModal
        hand={recapHand}
        onClose={() => setRecapHand(null)}
        onReopen={reopenLastHand}
        showEventName={showEventName}
      />

      {/* 로그 복사 피드백 토스트 (C / Ctrl+C) — 모달 위에도 보이도록 높은 zIndex */}
      {logCopied && (
        <div style={{
          position: "fixed", left: "50%", bottom: 40, transform: "translateX(-50%)",
          zIndex: 300, background: "#10b981", color: "#04140d",
          padding: "10px 18px", borderRadius: 10, fontWeight: 900, fontSize: 13,
          letterSpacing: 1, boxShadow: "0 4px 20px rgba(0,0,0,.5)",
          pointerEvents: "none",
        }}>✓ 로그 복사됨</div>
      )}

      <style>{`
        .bet-amount-input::placeholder {
          font-size: 10px;
          font-weight: 400;
          letter-spacing: 0;
        }
        @keyframes nextPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(34, 211, 238, .55); }
          50% { box-shadow: 0 0 0 6px rgba(34, 211, 238, 0); }
        }
        @keyframes cardPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(251, 191, 36, .7); }
          50% { box-shadow: 0 0 0 6px rgba(251, 191, 36, 0); }
        }
        @keyframes recapFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

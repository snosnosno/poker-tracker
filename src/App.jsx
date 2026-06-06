import React, { useState, useEffect, useCallback } from "react";

// ══════════════════════════════════════════════════════════════════════════════
// 상수
// ══════════════════════════════════════════════════════════════════════════════
const STREETS = ["PREFLOP", "FLOP", "TURN", "RIVER"]; // 홀덤/오마하 기본 (하위호환 기본값)
const STREET_SHORT = {
  PREFLOP: "Pre", FLOP: "Flop", TURN: "Turn", RIVER: "River",
  DRAW1: "Draw 1", DRAW2: "Draw 2", DRAW3: "Draw 3",
};

// 게임 타입 정의: 카드 장수 + 스트리트 구성 + 드로우 여부
const GAME_TYPES = {
  holdem: { label: "홀덤", cards: 2, streets: ["PREFLOP", "FLOP", "TURN", "RIVER"], draw: false },
  plo4:   { label: "PLO4", cards: 4, streets: ["PREFLOP", "FLOP", "TURN", "RIVER"], draw: false },
  plo5:   { label: "PLO5", cards: 5, streets: ["PREFLOP", "FLOP", "TURN", "RIVER"], draw: false },
  plo6:   { label: "PLO6", cards: 6, streets: ["PREFLOP", "FLOP", "TURN", "RIVER"], draw: false },
  td27:   { label: "2-7TD", cards: 5, streets: ["PREFLOP", "DRAW1", "DRAW2", "DRAW3"], draw: true },
  tdA5:   { label: "A-5TD", cards: 5, streets: ["PREFLOP", "DRAW1", "DRAW2", "DRAW3"], draw: true },
  badugi: { label: "Badugi", cards: 4, streets: ["PREFLOP", "DRAW1", "DRAW2", "DRAW3"], draw: true },
  sd27:   { label: "2-7SD", cards: 5, streets: ["PREFLOP", "DRAW1"], draw: true },
};
const GAME_ORDER = ["holdem", "plo4", "plo5", "plo6", "td27", "tdA5", "badugi", "sd27"];
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
function boardToText(board, count) {
  if (!board) return "";
  const cards = [];
  for (let i = 0; i < count; i++) {
    cards.push(cardLabel(board[i]));
  }
  return cards.join(" ");
}

const ACTIONS = [
  { id: "open",   label: "OPEN",   color: "#f59e0b" },
  { id: "bet",    label: "BET",    color: "#22c55e" },
  { id: "raise",  label: "RAISE",  color: "#ef4444" },
  { id: "call",   label: "CALL",   color: "#3b82f6" },
  { id: "check",  label: "CHECK",  color: "#94a3b8" },
  { id: "fold",   label: "FOLD",   color: "#7e8ca0" },
  { id: "allin",  label: "ALL-IN", color: "#8b5cf6" },
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
  "MP+1": "MP",
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

// 베팅 금액 입력 대상 액션 (사이징)
const AMOUNT_ACTIONS = new Set(["open", "bet", "raise", "allin"]);

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

  // 이전까지의 raise + open 횟수 합산 (모두 1단계 ↑)
  let aggCount = 0;
  for (let i = 0; i < index; i++) {
    if (entries[i].action === "raise" || entries[i].action === "open") aggCount++;
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

// 프리플랍에서 (오픈폴드만으로) 전원 폴드되어 끝났는지.
// 조건: 확정 + 플랍 이상 없음 + 폴드 존재 + 생존자 정확히 1명
//       + 모든 폴드가 "첫 액션 폴드"(=숨겨지는 오픈폴드)일 것.
// 이미 액션한 사람이 폴드한 경우(콜/오픈 후 폴드 = 로그에 보임)는 ALL-FOLD 생략.
// 올인-콜 쇼다운(생존 2명+)·헤즈업도 제외.
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

function handToText(hand) {
  const lines = [];
  const isHeadsUp = (hand.seats?.length || 0) === 2;

  // 같은 카드 표기를 2명 이상이 가지면, 그 seat들은 이름도 함께 표시(구분용)
  const dupCardSeats = computeDupCardSeats(hand);
  const SL = streetsOf(hand);
  const isDrawGame = !!GAME_TYPES[hand.gameType]?.draw;

  SL.forEach((street, sIdx) => {
    const rawEntries = hand.streets[street] || [];
    const isPreflop = street === "PREFLOP";

    let entries, showAllFold = false;
    if (isPreflop) {
      const r = processPreflopEntries(rawEntries, isHeadsUp);
      entries = r.entries;
      showAllFold = preflopEndedByFold(hand);
    } else {
      entries = rawEntries;
    }

    const isDrawStreet = isDrawGame && sIdx >= 1;
    const parts = [];
    const seenSeats = new Set();
    entries.forEach((e, i) => {
      // 카드: 그 스트리트 시점 핸드 (드로우면 라운드 스냅샷, 아니면 딜/홀카드)
      const handText = cardsToText(handAtStreet(hand, e.seatId, sIdx));
      const label = getActionLabel(entries, i);
      const isFirstForPlayer = !seenSeats.has(e.seatId);
      seenSeats.add(e.seatId);

      let prefix = "";
      if (isPreflop && isFirstForPlayer) {
        prefix = `${posLabel(e.position)} ${e.playerName} `;
        prefix += handText ? `${handText} ` : "(?) ";
      } else if (isDrawStreet && isFirstForPlayer) {
        // 드로우 첫 액션: 이름 + 교환수(PAT/ND) + 핸드
        const di = drawInfoText(hand, e.seatId, sIdx);
        prefix = `${e.playerName} ${di}${handText ? " " + handText : ""} `;
      } else if (isDrawStreet) {
        // 드로우 후속 액션: 이름만
        prefix = `${e.playerName} `;
      } else if (handText) {
        // 프리플랍 후속 + 비드로우 포스트플랍: 카드 우선 (같은 카드 2명+면 이름 병기)
        prefix = dupCardSeats.has(e.seatId) ? `${e.playerName} ${handText} ` : `${handText} `;
      } else {
        prefix = `${e.playerName} `;
      }
      parts.push(`${prefix}${label}${e.amountText ? " " + e.amountText : ""}`);
    });
    if (showAllFold) parts.push("ALL-FOLD");

    if (isPreflop) {
      lines.push(`${STREET_SHORT[street]}: ${parts.join(" / ")}`);
    } else if (isDrawStreet) {
      // 드로우 스트리트: 항상 표시(빈 줄은 라벨만). 첫 액션에 교환수+핸드 포함.
      lines.push(`${STREET_SHORT[street]}: ${parts.join(" / ")}`.trimEnd());
    } else {
      // 비드로우 포스트플랍: 항상 표시. 보드 입력됐으면 보드 줄(+액션 줄), 아니면 라벨+액션 한 줄.
      const count = BOARD_COUNT_BY_STREET[street];
      const hasBoard = (hand.board || []).slice(0, count).some(c => c && c !== CARD_UNKNOWN);
      const hasActions = parts.length > 0;
      if (hasBoard) {
        lines.push(`${STREET_SHORT[street]}: ${boardToText(hand.board, count)}`);
        if (hasActions) lines.push(parts.join(" / "));
      } else {
        lines.push(`${STREET_SHORT[street]}: ${parts.join(" / ")}`.trimEnd());
      }
    }
  });

  lines.push("=".repeat(13));
  // Winner: 이름 + 최종 핸드 (드로우=마지막 스냅샷, 비드로우=딜/홀카드). 스플릿은 이름만.
  let winnerLine = `Winner: ${hand.winnerName || "—"}`;
  if (hand.winnerSeatId != null && !hand.isSplit) {
    const wh = cardsToText(handAtStreet(hand, hand.winnerSeatId, SL.length - 1));
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
      if (a.action === "allin") allInIds.add(a.seatId);
    });
  }
  hand.streets[SL[streetIdx]].forEach(a => {
    if (a.action === "fold") foldedIds.add(a.seatId);
    if (a.action === "allin") allInIds.add(a.seatId);
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
  if (isHeadsUp) {
    for (const p of actionable) {
      if (!respondedSeatIds.has(p.id)) return p;
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
  const cardsText = cardsToText(handAtStreet(hand, e.seatId, streetIdx));
  const label = getActionLabel(entries, i);
  const isNBet = label && label.endsWith("-BET");
  const isDrawStreet = streetIsDraw(hand, streetIdx);
  // 같은 카드 표기 2명+ 이면 이름 병기. 단 프리플랍 첫 액션은 이미 이름 있음.
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

  let lead;
  if (isPreflop && isFirstForPlayer) {
    lead = (<>
      <span style={{ color: "#10b981", fontSize: 11, fontWeight: 700 }}>{posLabel(e.position)}</span>{" "}
      {nameEl(false)}{" "}{cardsEl}{cardsText && " "}
    </>);
  } else if (isDrawStreet && isFirstForPlayer) {
    // 드로우 첫 액션: 이름 + 교환수(PAT/ND) + 핸드
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
  const street = streetsOf(hand)[streetIdx];
  const rawEntries = hand.streets?.[street] || [];
  const isPreflop = streetIdx === 0;
  const isDrawStreet = streetIsDraw(hand, streetIdx);
  const isHeadsUp = (hand.seats?.length || 0) === 2;

  let entries, showAllFold = false;
  if (isPreflop) {
    const r = processPreflopEntries(rawEntries, isHeadsUp);
    entries = r.entries;
    showAllFold = preflopEndedByFold(hand);
  } else {
    entries = rawEntries;
  }

  const count = (!isPreflop && !isDrawStreet) ? BOARD_COUNT_BY_STREET[street] : 0;
  const hasBoardCards = count > 0 && (hand.board || []).slice(0, count).some(c => c && c !== CARD_UNKNOWN);

  // 스킵: showEmpty면 빈 스트리트도 라벨만 표시. 아니면 도달 안 한 스트리트 생략.
  if (!showEmpty) {
    if (isPreflop && entries.length === 0) return null;
    if (!isPreflop && entries.length === 0 && !hasBoardCards) return null;
  }

  const dup = dupCardSeats || computeDupCardSeats(hand);
  const seen = new Set();
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

  const boardEl = hasBoardCards && (
    <span style={{ color: "#e8eef5", fontSize: size === "md" ? 12 : 11, fontWeight: 800, letterSpacing: 1, marginRight: size === "md" ? 8 : 4 }}>
      {boardToText(hand.board, count)}
    </span>
  );

  if (size === "md") {
    return (
      <div style={{ marginBottom: 8, lineHeight: 1.8 }}>
        <span style={{ color: "#7e8ca0", fontSize: 11, fontWeight: 700, letterSpacing: 2 }}>{STREET_SHORT[street]}:{" "}</span>
        {boardEl}{items}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center", fontSize: 11, marginBottom: 4 }}>
      <span style={{ color: "#64748b", fontWeight: 700, fontSize: 9, minWidth: 34, letterSpacing: 1 }}>{STREET_SHORT[street]}</span>
      {boardEl}{items}
    </div>
  );
}

// Winner 줄 (=====) + 이름 + 최종핸드. 히스토리/리캡 공용.
function WinnerLine({ hand, size = "md" }) {
  const SL = streetsOf(hand);
  const wh = (hand.winnerSeatId != null && !hand.isSplit)
    ? cardsToText(handAtStreet(hand, hand.winnerSeatId, SL.length - 1)) : "";
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
  const dup = computeDupCardSeats(hand);
  const showCards = !isDraw && Object.entries(hand.holeCards || {}).filter(([_, c]) => (c || []).some(Boolean)).length > 0;
  return (
    <>
      {showCards && (
        <div style={{ marginBottom: 10 }}>
          <span style={{ color: "#7e8ca0", fontSize: 10, letterSpacing: 2 }}>Cards: </span>
          {hand.seats.filter(s => hand.holeCards?.[s.id]?.some(Boolean)).map(s => (
            <span key={s.id} style={{ marginRight: 10, display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span style={{ color: "#94a3b8", fontSize: 11 }}>{s.name}</span>
              {hand.holeCards[s.id].map((c, ci) => <CardChip key={ci} card={c} size="sm" />)}
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
function CardChip({ card, size = "sm" }) {
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
      <span style={{ fontSize: size === "sm" ? 9 : 13 }}>{suit.label}</span>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 카드 선택 모달 (랭크만, 슈트 무시)
// ══════════════════════════════════════════════════════════════════════════════
function CardPickerModal({ open, onClose, onSelectBoth, initialCards = [null, null], cardCount = 2 }) {
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
      setActiveSlot(firstEmpty === -1 ? 0 : firstEmpty);
    }
  }, [open]);

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
      if (k === "enter") { commit(picksRef.current); return; }
      if (k === "escape") { onClose(); return; }
      // ? 입력: '0' / '/' / '?'
      if (k === "0" || k === "/" || k === "?") { fillSlot(null, CARD_UNKNOWN); pendingSuitSlotRef.current = null; return; }
      // 슈트키: 직전 랭크 카드에 문양 지정 (랭크키와 안 겹침)
      if (k === "h" || k === "d" || k === "c" || k === "s") { setSuit(k); return; }
      const lookupKey = k === "1" ? "a" : k; // '1' 도 A
      const gi = RANK_KEYS.indexOf(lookupKey);
      if (gi >= 0) placeRank(null, RANK_GRID[gi]); // 슈트 미지정(placeholder 'x')
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
  const pvW = cardCount <= 2 ? 70 : cardCount <= 4 ? 56 : 44;
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
        }}>카드 선택 · 랭크 + 문양(선택) · {cardCount}장</div>

        {/* 선택된 카드 미리보기 (cardCount장) */}
        <div style={{
          display: "flex", justifyContent: "center", gap: 10,
          marginBottom: 18, flexWrap: "wrap",
        }}>
          {picks.map((p, i) => {
            const isActive = activeSlot === i;
            return (
              <button
                key={i}
                onClick={() => p ? clearSlot(i) : setActiveSlot(i)}
                style={{
                  width: pvW, height: pvH,
                  background: p ? "#fafafa" : "transparent",
                  border: `2.5px ${p ? "solid transparent" : "dashed"} ${
                    isActive ? "#fbbf24" : "#1a2d45"
                  }`,
                  borderRadius: 8,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#0f172a",
                  fontFamily: MONO,
                  fontWeight: 900,
                  fontSize: pvFont,
                  cursor: "pointer",
                  boxShadow: isActive && !p ? "0 0 12px rgba(251,191,36,.4)" : "none",
                  animation: isActive && !p ? "cardPulse 1.2s infinite" : "none",
                }}
              >
                {p ? (
                  <span style={{ color: SUIT_COLOR[p[1]] || "#0f172a" }}>
                    {p === CARD_UNKNOWN ? "?" : p[0]}
                    {SUIT_SYMBOL[p[1]] ? <span style={{ fontSize: Math.round(pvFont * 0.6) }}>{SUIT_SYMBOL[p[1]]}</span> : null}
                  </span>
                ) : (
                  <span style={{ color: "#1a2d45", fontSize: Math.round(pvFont * 0.66) }}>?</span>
                )}
              </button>
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
function HandHistoryCard({ hand }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = (e) => {
    e.stopPropagation();
    const text = toSheetCell(handToText(hand));
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
function RecapModal({ hand, onClose, onReopen }) {
  const [copied, setCopied] = useState(false);

  // 모달 닫을 때 copied 상태 리셋
  useEffect(() => {
    if (!hand) setCopied(false);
  }, [hand]);

  if (!hand) return null;

  const handleCopy = () => {
    const text = toSheetCell(handToText(hand));
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
// 메인 앱
// ══════════════════════════════════════════════════════════════════════════════
export default function App() {
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
  const [showWinnerPicker, setShowWinnerPicker] = useState(false);
  const [selectedWinners, setSelectedWinners] = useState([]); // 다중 위너 선택용 seatId 배열
  const [cardPickerFor, setCardPickerFor] = useState(null); // { seatId } | { board } | { showdown } | { edit }
  const [equityResult, setEquityResult] = useState(null); // { players,exact,iterations,street } | { error,street }
  const [equityStreet, setEquityStreet] = useState(null);  // 계산 대상 스트리트 키
  const [equityBusy, setEquityBusy] = useState(false);
  const [recapHand, setRecapHand] = useState(null); // 방금 끝난 핸드를 모달로 보여줌
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

    // 버튼 자리 기준 포지션 계산 (데드 스몰/버튼 자동)
    const { positions, dead } = computePositions(aged, btn);

    // 참여 시트 + 계산된 포지션 (계산에서 빠진 시트는 제외 = 안전)
    const handSeats = playingSeats
      .filter(s => positions[s.id])
      .map(s => ({ id: s.id, name: s.name, position: positions[s.id] }));

    // aged + 포지션 반영 (테이블 표시/수동수정 일관성)
    setSeats(aged.map(s =>
      positions[s.id] ? { ...s, position: positions[s.id] } : s
    ));

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
      roundHole: {}, // 드로우 후 라운드별 핸드 스냅샷 { streetKey: { seatId: [cards] } }
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
    const street = streetsOf(currentHand)[currentStreet];
    setCurrentHand(prev => ({
      ...prev,
      streets: {
        ...prev.streets,
        [street]: (prev.streets[street] || []).slice(0, -1),
      },
    }));
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
    setEquityResult(null); // 카드 바뀌면 이전 승률 무효
    if (cardPickerFor.board) {
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
    const streetActions = currentHand.streets[currentStreetName] || [];
    const someoneOpened = streetActions.some(a => a.action === "open" || a.action === "raise" || a.action === "allin");
    const someoneBet = streetActions.some(a => a.action === "bet" || a.action === "raise" || a.action === "allin");
    const lastAggressive = [...streetActions].reverse()
      .find(a => a.action === "open" || a.action === "bet" || a.action === "raise" || a.action === "allin");

    const rawHole = currentHand.holeCards[player.id];
    // A규칙: 카드 확정(entry 생성)되면 ?라도 액션 허용. 확정 전엔 폴드만 가능.
    const hasCards = !!rawHole && rawHole.length > 0;

    if (currentStreet === 0 && !hasCards && actionId !== "fold") return true;
    if (actionId === "open") {
      if (currentStreet !== 0) return true;
      if (someoneOpened) return true;
    }
    if (actionId === "bet") {
      if (currentStreet === 0) return true;
      if (someoneBet) return true;
    }
    if (actionId === "raise") {
      // 프리플랍은 베팅 없어도 RAISE 허용(운영진 입력 편의). 포스트플랍은 베팅 있어야.
      if (currentStreet > 0 && !someoneBet) return true;
    }
    if (actionId === "check") {
      if (someoneOpened || someoneBet) return true;
      // 프리플랍: 베팅 없을 때 BB 옵션만 체크 허용
      if (currentStreet === 0 && player.position !== "BB") return true;
    }
    if (actionId === "call") {
      if (currentStreet > 0 && !someoneBet) return true;
      if (lastAggressive?.seatId === player.id) return true;
    }
    return false;
  };

  // ── 키보드 단축키 ─────────────────────────────────────────────────────────
  useEffect(() => {
    const handleKey = (e) => {
      // 입력창에 포커스 있으면 무시
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      // 카드 선택 모달이 열려있으면 메인 단축키 무시 (모달이 자체 처리)
      if (cardPickerFor) return;

      const key = e.key.toLowerCase();

      // 리캡 모달 열림: C=복사, Enter/N=닫기
      if (recapHand) {
        if (key === "c") {
          const text = toSheetCell(handToText(recapHand));
          if (navigator.clipboard) navigator.clipboard.writeText(text);
        } else if (key === "enter" || key === "n") {
          setRecapHand(null);
        }
        return;
      }

      // 위너 선택 화면: 숫자로 토글, Enter로 확정, Esc로 취소
      if (showWinnerPicker && currentHand) {
        const lastIdx = streetsOf(currentHand).length - 1;
        const alive = getAlivePlayers(lastIdx);
        if (key === "escape") { setShowWinnerPicker(false); setSelectedWinners([]); return; }
        if (key === "enter") {
          const winnerSeats = alive.filter(s => selectedWinners.includes(s.id));
          if (winnerSeats.length > 0) {
            finalizeWinners(winnerSeats);
            setSelectedWinners([]);
          }
          return;
        }
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
        // 액션은 버튼 탭으로만 (숫자키는 금액 입력 전용 → 단축키 충돌 제거)
        // Enter = 다음 스트리트 (라운드 완료 시)
        if (key === "enter" && isRoundComplete()) {
          nextStreet();
          return;
        }
        // Z = undo
        if (key === "z") {
          undoLastAction();
          return;
        }
      } else {
        // 핸드 없을 때 N or Enter = 새 핸드
        if ((key === "n" || key === "enter") && playingSeats.length >= 2) {
          startHand();
        }
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [currentHand, currentStreet, cardPickerFor, recapHand, showWinnerPicker, selectedWinners, seats]);

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
        </div>
      </div>

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
                >{g.label}<span style={{ fontSize: 9, opacity: .6, marginLeft: 4 }}>{g.cards}</span></button>
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
                        if (a.action === "allin") isAllIn = true;
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
                  fontSize: 13, outline: "none", boxSizing: "border-box",
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
          {showWinnerPicker && currentHand && (
            <div style={{
              background: "#050d1a",
              border: "2px solid #f59e0b",
              borderRadius: 14, padding: 16, marginBottom: 12,
              boxShadow: "0 0 30px rgba(245,158,11,.2)",
            }}>
              <div style={{
                color: "#f59e0b", fontSize: 13, fontWeight: 900,
                letterSpacing: 2, marginBottom: 6, textAlign: "center",
              }}>🏆 WINNER 선택</div>
              <div style={{
                color: "#7e8ca0", fontSize: 10, marginBottom: 12, textAlign: "center",
              }}>여러 명 선택 시 SPLIT(찹) 처리</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {getAlivePlayers(streetList.length - 1).map(seat => {
                  const isSel = selectedWinners.includes(seat.id);
                  return (
                    <button
                      key={seat.id}
                      onClick={() => setSelectedWinners(prev =>
                        prev.includes(seat.id)
                          ? prev.filter(id => id !== seat.id)
                          : [...prev, seat.id]
                      )}
                      style={{
                        padding: "12px 16px",
                        background: isSel ? "#1a3d2e" : "#0a1628",
                        border: `2px solid ${isSel ? "#10b981" : "#1a2d45"}`,
                        borderRadius: 10,
                        color: "#e2e8f0",
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        cursor: "pointer",
                        transition: "all .15s",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{
                          width: 20, height: 20, borderRadius: 5,
                          border: `2px solid ${isSel ? "#10b981" : "#7e8ca0"}`,
                          background: isSel ? "#10b981" : "transparent",
                          color: "#000", fontSize: 12, fontWeight: 900,
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>{isSel ? "✓" : ""}</span>
                        <span style={{
                          background: "#0f172a", border: "1px solid #1e293b",
                          fontSize: 10, color: "#10b981", padding: "1px 6px", borderRadius: 4,
                        }}>{posLabel(seat.position)}</span>
                        <span style={{ fontSize: 14, fontWeight: 700 }}>{seat.name}</span>
                        {(() => {
                          const lastIdx = streetList.length - 1;
                          const finalText = cardsToText(handAtStreet(currentHand, seat.id, lastIdx));
                          return (
                            <span
                              role="button"
                              onClick={(ev) => { ev.stopPropagation(); setCardPickerFor({ showdown: { seatId: seat.id } }); }}
                              title="쇼다운 핸드 입력/수정"
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
                      <span style={{ color: isSel ? "#10b981" : "#374151", fontSize: 16 }}>🏆</span>
                    </button>
                  );
                })}
              </div>

              {/* 확정 버튼 */}
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
          )}

          {/* 핸드 진행 */}
          {isHandActive && !showWinnerPicker && (
            <div style={{
              background: "#050d1a", border: "1px solid #0f1f35",
              borderRadius: 14, padding: 14,
            }}>
              {/* 스트리트 탭 */}
              <div style={{ display: "flex", gap: 5, marginBottom: 12, alignItems: "center" }}>
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
                          : isPast ? "#10b981" : "#536583",
                        fontSize: 10, fontWeight: 700, letterSpacing: 1,
                        cursor: isPast ? "pointer" : "default",
                        fontFamily: MONO,
                      }}>{STREET_SHORT[s]}</button>
                  );
                })}
                <div style={{ flex: 1 }} />
                {(() => {
                  const betEmpty = (currentHand.streets[currentStreetName] || []).length === 0;
                  const canUndo = !betEmpty;
                  return (
                <button onClick={undoLastAction} disabled={!canUndo} style={{
                  padding: "4px 10px",
                  background: "transparent", border: "1px solid #1a2d45",
                  borderRadius: 6, color: "#7e8ca0",
                  fontSize: 10, cursor: "pointer",
                  opacity: canUndo ? 1 : .3,
                }}>↶</button>
                  );
                })()}
                <button onClick={discardHand} style={{
                  padding: "4px 10px",
                  background: "transparent", border: "1px solid #2d1a1a",
                  borderRadius: 6, color: "#4a2020",
                  fontSize: 10, cursor: "pointer",
                }}>✕</button>
              </div>

              {/* 보드 카드 (포스트플랍, 홀덤/오마하만): 칸 탭 → 해당 스트리트 카드 입력 */}
              {currentStreet >= 1 && !GAME_TYPES[currentHand.gameType]?.draw && BOARD_COUNT_BY_STREET[currentStreetName] && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
                  <span style={{ color: "#7e8ca0", fontSize: 9, letterSpacing: 1, marginRight: 2 }}>BOARD</span>
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
                          background: filled ? "#fafafa" : "#070f1c",
                          border: `1px solid ${filled ? "#2a4a6e" : "#162a40"}`,
                          color: filled ? (col || "#0f172a") : "#2a4055",
                          fontSize: filled ? 15 : 12, fontWeight: 800,
                          cursor: "pointer", fontFamily: MONO,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          padding: 0,
                        }}>{label || "+"}</button>
                    );
                  })}
                </div>
              )}
              {(() => {
                const nextPlayer = getNextToAct();

                if (!nextPlayer) return null; // 라운드 완료 → 아래 '다음 버튼'이 활성화됨

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
                    {/* 헤더 */}
                    <div style={{
                      display: "flex", alignItems: "center", gap: 10,
                      marginBottom: 12, flexWrap: "wrap",
                    }}>
                      <span style={{
                        fontSize: 9, color: "#10b981",
                        border: "1px solid #10b981", padding: "2px 8px",
                        borderRadius: 4, letterSpacing: 1.5, fontWeight: 700,
                      }}>NEXT TO ACT</span>
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
                      {currentStreet === 0 && (
                        <button
                          onClick={() => setCardPickerFor({ seatId: nextPlayer.id })}
                          title="딜 카드 입력/수정"
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

                    {/* 베팅 금액 (선택) — OPEN/BET/RAISE/ALL-IN에만 적용 */}
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
                          color: "#e2e8f0", fontSize: 14, fontWeight: 700,
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
                              border: `1px solid ${sel ? "#10b981" : "#1a2d45"}`,
                              borderRadius: 6,
                              color: sel ? "#000" : "#7e8ca0",
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
                      {ACTIONS.map((action) => {
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
                            {action.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* 다음 스트리트 / 위너 버튼 (라운드 완료 시 활성) — 베팅 패널 자리 */}
              {(() => {
                const complete = isRoundComplete();
                const actionableCount = getActionablePlayers().length;
                const goToShowdown = actionableCount <= 1;
                const lastIdx = streetList.length - 1;
                const isGold = currentStreet === lastIdx || goToShowdown;
                return (
                  <button
                    onClick={nextStreet}
                    disabled={!complete}
                    style={{
                      width: "100%", marginTop: 12, padding: "15px 12px",
                      background: !complete ? "#070f1c"
                        : isGold ? "linear-gradient(135deg, #f59e0b, #b45309)"
                          : "linear-gradient(135deg, #1a3a8f, #0f2060)",
                      border: !complete ? "1px solid #1a2d45" : "none",
                      borderRadius: 12,
                      color: !complete ? "#1a2d45" : "#fff",
                      fontSize: 14, fontWeight: 900, letterSpacing: 2,
                      cursor: !complete ? "not-allowed" : "pointer",
                      boxShadow: complete ? (isGold ? "0 0 20px rgba(245,158,11,.4)" : "0 0 16px rgba(26,58,143,.4)") : "none",
                      opacity: !complete ? .5 : 1,
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
                display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center",
              }}>
                <span style={{ color: "#7e8ca0", fontSize: 9, letterSpacing: 2 }}>
                  ALIVE
                </span>
                {getActionablePlayers().map(p => {
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

              {/* 승률 계산 (홀덤 전용) — 스트리트 선택해서 그 상황 승률 보기 */}
              {GAME_TYPES[currentHand.gameType]?.cards === 2 && (() => {
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
              {hands.length > 0 && (
                <>
                  <button
                    onClick={() => {
                      // 핸드 하나당 한 셀(여러 줄), 핸드끼리는 세로(다음 행)로 배치
                      const all = hands.slice().reverse()
                        .map(h => toSheetCell(handToText(h)))
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
                <HandHistoryCard key={hand.id} hand={hand} />
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
          cardPickerFor?.board
            ? (currentHand?.board || []).slice(0, BOARD_COUNT_BY_STREET[cardPickerFor.board])
            : cardPickerFor?.showdown
              ? (handAtStreet(currentHand, cardPickerFor.showdown.seatId, streetsOf(currentHand).length - 1) || [])
              : cardPickerFor?.edit
                ? (handAtStreet(currentHand, cardPickerFor.edit.seatId, cardPickerFor.edit.streetIdx) || [])
                : (currentHand?.holeCards[cardPickerFor?.seatId] || [null, null])
        }
        cardCount={
          cardPickerFor?.board
            ? BOARD_COUNT_BY_STREET[cardPickerFor.board]
            : (currentHand?.cardCount || holeCardCount)
        }
      />

      {/* 핸드 종료 리캡 모달 */}
      <RecapModal
        hand={recapHand}
        onClose={() => setRecapHand(null)}
        onReopen={reopenLastHand}
      />

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

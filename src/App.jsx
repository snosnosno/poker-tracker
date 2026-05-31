import React, { useState, useEffect, useCallback } from "react";

// ══════════════════════════════════════════════════════════════════════════════
// 상수
// ══════════════════════════════════════════════════════════════════════════════
const STREETS = ["PREFLOP", "FLOP", "TURN", "RIVER"];
const STREET_SHORT = { PREFLOP: "Pre", FLOP: "Flop", TURN: "Turn", RIVER: "River" };

const ACTIONS = [
  { id: "open",   label: "OPEN",   color: "#f59e0b" },
  { id: "bet",    label: "BET",    color: "#22c55e" },
  { id: "raise",  label: "RAISE",  color: "#ef4444" },
  { id: "call",   label: "CALL",   color: "#3b82f6" },
  { id: "check",  label: "CHECK",  color: "#94a3b8" },
  { id: "fold",   label: "FOLD",   color: "#475569" },
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

const SUITS = [
  { id: "s", label: "♠", color: "#e2e8f0" },
  { id: "h", label: "♥", color: "#f87171" },
  { id: "d", label: "♦", color: "#fbbf24" },
  { id: "c", label: "♣", color: "#86efac" },
];

// 카드 랭크 강도 (높을수록 강함)
const RANK_VALUE = { A: 14, K: 13, Q: 12, J: 11, T: 10, "9":9, "8":8, "7":7, "6":6, "5":5, "4":4, "3":3, "2":2 };

// 홀카드를 "KQ" "JT" 같은 표기로 변환 (높은 랭크 먼저)
function cardsToText(cards) {
  if (!cards) return "";
  const valid = cards.filter(Boolean);
  if (valid.length === 0) return "";
  // 랭크 강도로 정렬 (높은 것 먼저)
  const sorted = [...valid].sort((a, b) => (RANK_VALUE[b[0]] || 0) - (RANK_VALUE[a[0]] || 0));
  return sorted.map(c => c[0]).join("");
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

// 구글 시트에서 한 셀에 들어가도록 큰따옴표로 감싸기 (내부 줄바꿈 보존)
// 내부 " 는 "" 로 이스케이프
function toSheetCell(text) {
  return '"' + String(text).replace(/"/g, '""') + '"';
}

function handToText(hand) {
  const lines = [];
  const isHeadsUp = (hand.seats?.length || 0) === 2;

  STREETS.forEach(street => {
    const rawEntries = hand.streets[street] || [];
    const isPreflop = street === "PREFLOP";

    let entries, showAllFold = false;
    if (isPreflop) {
      const r = processPreflopEntries(rawEntries, isHeadsUp);
      entries = r.entries;
      showAllFold = r.showAllFold;
    } else {
      entries = rawEntries;
    }

    const parts = [];
    const seenSeats = new Set();
    entries.forEach((e, i) => {
      const cardsText = cardsToText(hand.holeCards?.[e.seatId]);
      const label = getActionLabel(entries, i);
      const isFirstForPlayer = !seenSeats.has(e.seatId);
      seenSeats.add(e.seatId);

      let prefix = "";
      if (isPreflop && isFirstForPlayer) {
        prefix = `${posLabel(e.position)} ${e.playerName} `;
        if (cardsText) prefix += `${cardsText} `;
        else prefix += "(?) ";
      } else if (cardsText) {
        prefix = `${cardsText} `;
      } else {
        prefix = `${e.playerName} `;
      }
      parts.push(`${prefix}${label}`);
    });
    if (showAllFold) parts.push("ALL-FOLD");

    lines.push(`${STREET_SHORT[street]}: ${parts.join(" / ")}`);
  });

  lines.push("=".repeat(28));
  lines.push(`Winner: ${hand.winnerName || "—"}`);

  return lines.join("\n");
}

// 9시트 원형 배치
function getSeatPos(index, total = 9, rx = 39, ry = 31) {
  const angle = ((-90 + (index * 360) / total) * Math.PI) / 180;
  return { x: 50 + rx * Math.cos(angle), y: 50 + ry * Math.sin(angle) };
}

// ── C: 버튼 자리 기반 포지션 계산 (데드 스몰/데드 버튼 자동) ─────────────────
// 인원수별 포지션 풀 (BB~UTG). 데드가 없을 때의 정상 집합.
const FULL_BY_COUNT = {
  3: ["D", "SB", "BB"],
  4: ["CO", "D", "SB", "BB"],
  5: ["HJ", "CO", "D", "SB", "BB"],
  6: ["UTG", "HJ", "CO", "D", "SB", "BB"],
  7: ["UTG", "MP", "HJ", "CO", "D", "SB", "BB"],
  8: ["UTG", "UTG+1", "MP", "HJ", "CO", "D", "SB", "BB"],
  9: ["UTG", "UTG+1", "MP", "MP+1", "HJ", "CO", "D", "SB", "BB"],
};

// 핸드에 실제 참여하는 시트 (활성 + 이름 있음 + 아웃 아님)
function isPlaying(s) {
  return !!(s && s.active && s.name && !s.out);
}

// 물리 좌석 순서에서 fromIdx 다음(시계방향) 첫 playing 자리 인덱스
function nextPlayingIdx(seatsInOrder, fromIdx) {
  const n = seatsInOrder.length;
  for (let k = 1; k <= n; k++) {
    const idx = (fromIdx + k) % n;
    if (isPlaying(seatsInOrder[idx])) return idx;
  }
  return -1;
}

// 버튼 자리 기준으로 각 참여 시트의 포지션 계산.
// 반환: { positions: { [seatId]: "D"|"SB"|... }, dead: { button, small } }
function computePositions(seatsInOrder, buttonSeatId) {
  const n = seatsInOrder.length;
  const playing = seatsInOrder.filter(isPlaying);
  const result = { positions: {}, dead: { button: false, small: false } };
  if (playing.length < 2) return result;

  const btnIdx = seatsInOrder.findIndex(s => s.id === buttonSeatId);
  if (btnIdx === -1) return result;

  // 헤즈업: 버튼=D(SB 겸), 다음 playing=BB
  if (playing.length === 2) {
    let dIdx = btnIdx;
    if (!isPlaying(seatsInOrder[btnIdx])) dIdx = nextPlayingIdx(seatsInOrder, btnIdx);
    const bbIdx = nextPlayingIdx(seatsInOrder, dIdx);
    result.positions[seatsInOrder[dIdx].id] = "D";
    result.positions[seatsInOrder[bbIdx].id] = "BB";
    return result;
  }

  // 3명 이상
  if (!isPlaying(seatsInOrder[btnIdx])) result.dead.button = true;

  const sbSeatIdx = (btnIdx + 1) % n;
  let bbIdx;
  if (isPlaying(seatsInOrder[sbSeatIdx])) {
    result.positions[seatsInOrder[sbSeatIdx].id] = "SB";
    bbIdx = nextPlayingIdx(seatsInOrder, sbSeatIdx);
  } else {
    result.dead.small = true;
    bbIdx = nextPlayingIdx(seatsInOrder, sbSeatIdx);
  }
  result.positions[seatsInOrder[bbIdx].id] = "BB";

  if (isPlaying(seatsInOrder[btnIdx])) {
    result.positions[seatsInOrder[btnIdx].id] = "D";
  }

  // BB 다음 playing부터 UTG, UTG+1, ... CO 순 배정.
  // 아직 포지션 못 받은 자리 수 = playing - 배정된 수.
  // 데드(스몰/버튼)로 D나 SB가 빠지면 early가 그만큼 더 필요하므로,
  // "필요한 개수+3"명 기준 풀의 early 목록(UTG..CO)을 사용해 표준 명칭을 맞춤.
  const assignedCount = Object.keys(result.positions).length;
  const remaining = playing.length - assignedCount;
  if (remaining > 0) {
    const refCount = Math.min(remaining + 3, 9);
    const refFull = FULL_BY_COUNT[refCount] || FULL_BY_COUNT[9];
    const earlyAll = refFull.filter(p => p !== "D" && p !== "SB" && p !== "BB");
    // earlyAll 길이가 remaining보다 길 수 있으니 앞에서 remaining개 (UTG부터)
    const earlyPositions = earlyAll.slice(0, remaining);
    let cur = bbIdx;
    for (let i = 0; i < earlyPositions.length; i++) {
      cur = nextPlayingIdx(seatsInOrder, cur);
      while (cur !== -1 && result.positions[seatsInOrder[cur].id]) {
        cur = nextPlayingIdx(seatsInOrder, cur);
      }
      if (cur === -1) break;
      result.positions[seatsInOrder[cur].id] = earlyPositions[i];
    }
  }

  return result;
}

// 버튼을 다음 물리 자리로 한 칸 전진 (사람 유무 무관 = 데드 발생의 핵심)
function advanceButton(seatsInOrder, buttonSeatId) {
  const n = seatsInOrder.length;
  const btnIdx = seatsInOrder.findIndex(s => s.id === buttonSeatId);
  if (btnIdx === -1) return buttonSeatId;
  return seatsInOrder[(btnIdx + 1) % n].id;
}

// ── 액션 계산 순수 헬퍼 (hand 객체 + 스트리트 인덱스 기반) ──────────────────
// 컴포넌트 메서드와 logAction 내부 자동판정에서 공용으로 사용.
// 현재 스트리트에서 폴드/올인하지 않은(=액션 가능한) 플레이어
function computeActionablePlayers(hand, streetIdx) {
  if (!hand) return [];
  const foldedIds = new Set();
  const allInIds = new Set();
  for (let i = 0; i < streetIdx; i++) {
    hand.streets[STREETS[i]].forEach(a => {
      if (a.action === "fold") foldedIds.add(a.seatId);
      if (a.action === "allin") allInIds.add(a.seatId);
    });
  }
  hand.streets[STREETS[streetIdx]].forEach(a => {
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
  const streetActions = hand.streets[STREETS[streetIdx]];
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
      fontFamily: "'Courier New', monospace",
    }}>{a.label}</span>
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
        fontFamily: "'Georgia', serif",
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
      fontFamily: "'Georgia', serif",
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
function CardPickerModal({ open, onClose, onSelectBoth, initialCards = [null, null] }) {
  const [picks, setPicks] = useState([null, null]);
  const [activeSlot, setActiveSlot] = useState(0); // 0 또는 1

  useEffect(() => {
    if (open) {
      setPicks([initialCards[0] || null, initialCards[1] || null]);
      setActiveSlot(initialCards[0] ? 1 : 0);
    }
  }, [open]);

  // 카드 모달 키보드 입력
  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => {
      const k = e.key.toLowerCase();
      if (k === "enter") {
        setPicks(cur => {
          if (cur[0] !== null && cur[1] !== null) {
            onSelectBoth(cur);
            return [null, null];
          }
          return cur;
        });
        return;
      }
      if (k === "escape") { onClose(); return; }
      // '1' 도 A로 허용
      const lookupKey = k === "1" ? "a" : k;
      const gi = RANK_KEYS.indexOf(lookupKey);
      if (gi >= 0) {
        const card = RANK_GRID[gi] + "x";
        setActiveSlot(slot => {
          setPicks(prev => {
            const next = [...prev];
            next[slot] = card;
            return next;
          });
          return slot === 0 ? 1 : 0;
        });
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onSelectBoth, onClose]);

  if (!open) return null;

  // 카드 선택: 현재 active 슬롯에 넣고 다음 슬롯으로
  // 랭크는 'A','K' 등 한 글자. 내부 저장은 'Ax', 'Kx' (슈트 placeholder 'x')
  const pickRank = (rank) => {
    const card = rank + "x";
    setPicks(prev => {
      const next = [...prev];
      next[activeSlot] = card;
      return next;
    });
    // 다음 빈 슬롯으로
    setActiveSlot(s => (s === 0 ? 1 : 0));
  };

  const confirm = () => {
    onSelectBoth(picks);
    setPicks([null, null]);
    setActiveSlot(0);
  };

  const clearAll = () => {
    setPicks([null, null]);
    setActiveSlot(0);
  };

  const clearSlot = (slot) => {
    setPicks(prev => {
      const next = [...prev];
      next[slot] = null;
      return next;
    });
    setActiveSlot(slot);
  };

  const canConfirm = picks[0] !== null && picks[1] !== null;

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
        }}>홀카드 선택 (랭크만)</div>

        {/* 선택된 카드 미리보기 (2장, 큼직하게) */}
        <div style={{
          display: "flex", justifyContent: "center", gap: 12,
          marginBottom: 18,
        }}>
          {[0, 1].map(i => {
            const isActive = activeSlot === i;
            return (
              <button
                key={i}
                onClick={() => picks[i] ? clearSlot(i) : setActiveSlot(i)}
                style={{
                  width: 70, height: 96,
                  background: picks[i] ? "#fafafa" : "transparent",
                  border: `2.5px ${picks[i] ? "solid transparent" : "dashed"} ${
                    isActive ? "#fbbf24" : "#1a2d45"
                  }`,
                  borderRadius: 8,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#0f172a",
                  fontFamily: "'Georgia', serif",
                  fontWeight: 900,
                  fontSize: 42,
                  cursor: "pointer",
                  boxShadow: isActive && !picks[i] ? "0 0 12px rgba(251,191,36,.4)" : "none",
                  animation: isActive && !picks[i] ? "cardPulse 1.2s infinite" : "none",
                }}
              >
                {picks[i] ? picks[i][0] : (
                  <span style={{ color: "#1a2d45", fontSize: 28 }}>?</span>
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
                  fontFamily: "'Georgia', serif",
                  cursor: "pointer",
                  transition: "all .1s",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  position: "relative",
                }}
              >
                <span style={{
                  position: "absolute", top: 2, left: 4,
                  fontSize: 9, color: isInPicks ? "#000" : "#94a3b8",
                  opacity: .6, fontWeight: 700, fontFamily: "monospace",
                }}>{RANK_KEYS[gi].toUpperCase()}</span>
                {rank}
              </button>
            );
          })}
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
            borderRadius: 8, color: "#475569",
            fontSize: 11, cursor: "pointer",
          }}>비우기</button>
          <button onClick={onClose} style={{
            padding: "12px 16px",
            background: "transparent", border: "1px solid #1a2d45",
            borderRadius: 8, color: "#475569",
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
          <span style={{ color: "#10b981", fontSize: 13, fontWeight: 900, fontFamily: "monospace" }}>
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
            fontFamily: "'Courier New',monospace",
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
          fontFamily: "'Courier New', monospace",
        }}>
          {/* 홀카드 표시 */}
          {Object.entries(hand.holeCards || {}).filter(([_, c]) => c[0] || c[1]).length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <span style={{ color: "#475569", fontSize: 10, letterSpacing: 2 }}>Cards: </span>
              {hand.seats.filter(s => hand.holeCards?.[s.id]?.[0] || hand.holeCards?.[s.id]?.[1]).map(s => (
                <span key={s.id} style={{ marginRight: 10, display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <span style={{ color: "#94a3b8", fontSize: 11 }}>{s.name}</span>
                  <CardChip card={hand.holeCards[s.id][0]} size="sm" />
                  <CardChip card={hand.holeCards[s.id][1]} size="sm" />
                </span>
              ))}
            </div>
          )}

          {STREETS.map(street => {
            const rawEntries = hand.streets[street] || [];
            const isPreflop = street === "PREFLOP";
            const isHeadsUp = (hand.seats?.length || 0) === 2;

            let entries, showAllFold = false;
            if (isPreflop) {
              const r = processPreflopEntries(rawEntries, isHeadsUp);
              entries = r.entries;
              showAllFold = r.showAllFold;
            } else {
              entries = rawEntries;
            }

            return (
              <div key={street} style={{ marginBottom: 8, lineHeight: 1.8 }}>
                <span style={{
                  color: "#475569", fontSize: 11, fontWeight: 700, letterSpacing: 2,
                }}>
                  {STREET_SHORT[street]}:{" "}
                </span>
                {(() => {
                  const seenSeats = new Set();
                  return entries.map((e, i) => {
                    const cardsText = cardsToText(hand.holeCards?.[e.seatId]);
                    const isFirstForPlayer = !seenSeats.has(e.seatId);
                    seenSeats.add(e.seatId);
                    const label = getActionLabel(entries, i);
                    const isNBet = label && label.endsWith("-BET");

                    return (
                      <span key={i} style={{ marginRight: 6, whiteSpace: "nowrap" }}>
                        {/* 프리플랍 첫 액션만 포지션+이름 표시 */}
                        {isPreflop && isFirstForPlayer && (
                          <>
                            <span style={{ color: "#10b981", fontSize: 11, fontWeight: 700 }}>{posLabel(e.position)}</span>
                            {" "}
                            <span style={{ color: "#e2e8f0", fontSize: 12, fontWeight: 700 }}>{e.playerName}</span>
                            {" "}
                          </>
                        )}
                        {cardsText ? (
                          <span style={{ color: "#fbbf24", fontSize: 12, fontWeight: 900, fontFamily: "'Georgia',serif" }}>
                            {cardsText}
                          </span>
                        ) : (
                          <span style={{ color: "#94a3b8", fontSize: 11 }}>{e.playerName}</span>
                        )}
                        {" "}
                        {isNBet ? (
                          <span style={{
                            background: "#ef4444" + "22",
                            color: "#ef4444",
                            border: "1px solid #ef444455",
                            fontSize: 9, fontWeight: 900,
                            padding: "1px 6px", borderRadius: 4,
                            letterSpacing: 1, fontFamily: "'Courier New',monospace",
                          }}>{label}</span>
                        ) : (
                          <ActionBadge actionId={e.action} size="sm" />
                        )}
                        {i < entries.length - 1 && (
                          <span style={{ color: "#1e3a5f", margin: "0 4px" }}>/</span>
                        )}
                      </span>
                    );
                  });
                })()}
                {showAllFold && (
                  <span style={{
                    background: "#475569" + "22",
                    color: "#94a3b8",
                    border: "1px solid #47556955",
                    fontSize: 9, fontWeight: 900,
                    padding: "1px 6px", borderRadius: 4,
                    letterSpacing: 1, fontFamily: "'Courier New',monospace",
                  }}>ALL-FOLD</span>
                )}
              </div>
            );
          })}
          <div style={{
            borderTop: "1px dashed #1e3a5f",
            marginTop: 8, paddingTop: 8,
            color: "#475569", fontSize: 10, letterSpacing: 2,
          }}>{"=".repeat(28)}</div>
          <div style={{ marginTop: 6 }}>
            <span style={{ color: "#475569", fontSize: 11, letterSpacing: 2 }}>Winner: </span>
            <span style={{ color: "#f59e0b", fontSize: 13, fontWeight: 900 }}>
              {hand.winnerName || "—"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 핸드 종료 리캡 모달
// ══════════════════════════════════════════════════════════════════════════════
function RecapModal({ hand, onClose }) {
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
          fontFamily: "'Courier New', monospace",
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
            color: "#475569", fontSize: 18, cursor: "pointer", padding: 0,
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
          {STREETS.map(street => {
            const rawEntries = hand.streets[street] || [];
            const isPreflop = street === "PREFLOP";
            const isHeadsUp = (hand.seats?.length || 0) === 2;

            let entries, showAllFold = false;
            if (isPreflop) {
              const r = processPreflopEntries(rawEntries, isHeadsUp);
              entries = r.entries;
              showAllFold = r.showAllFold;
            } else {
              entries = rawEntries;
            }

            return (
              <div key={street} style={{ marginBottom: 8, lineHeight: 1.8 }}>
                <span style={{
                  color: "#475569", fontSize: 11, fontWeight: 700, letterSpacing: 2,
                }}>
                  {STREET_SHORT[street]}:{" "}
                </span>
                {(() => {
                  const seenSeats = new Set();
                  return entries.map((e, i) => {
                    const cardsText = cardsToText(hand.holeCards?.[e.seatId]);
                    const isFirstForPlayer = !seenSeats.has(e.seatId);
                    seenSeats.add(e.seatId);
                    const label = getActionLabel(entries, i);
                    const isNBet = label && label.endsWith("-BET");
                    return (
                      <span key={i} style={{ marginRight: 6, whiteSpace: "nowrap" }}>
                        {isPreflop && isFirstForPlayer && (
                          <>
                            <span style={{ color: "#10b981", fontSize: 11, fontWeight: 700 }}>{posLabel(e.position)}</span>{" "}
                            <span style={{ color: "#e2e8f0", fontSize: 12, fontWeight: 700 }}>{e.playerName}</span>{" "}
                          </>
                        )}
                        {cardsText ? (
                          <span style={{ color: "#fbbf24", fontSize: 12, fontWeight: 900, fontFamily: "'Georgia',serif" }}>
                            {cardsText}
                          </span>
                        ) : (
                          <span style={{ color: "#94a3b8", fontSize: 11 }}>{e.playerName}</span>
                        )}
                        {" "}
                        {isNBet ? (
                          <span style={{
                            background: "#ef4444" + "22",
                            color: "#ef4444",
                            border: "1px solid #ef444455",
                            fontSize: 9, fontWeight: 900,
                            padding: "1px 6px", borderRadius: 4,
                            letterSpacing: 1,
                          }}>{label}</span>
                        ) : (
                          <ActionBadge actionId={e.action} size="sm" />
                        )}
                        {i < entries.length - 1 && (
                          <span style={{ color: "#1e3a5f", margin: "0 4px" }}>/</span>
                        )}
                      </span>
                    );
                  });
                })()}
                {showAllFold && (
                  <span style={{
                    background: "#475569" + "22",
                    color: "#94a3b8",
                    border: "1px solid #47556955",
                    fontSize: 9, fontWeight: 900,
                    padding: "1px 6px", borderRadius: 4,
                    letterSpacing: 1,
                  }}>ALL-FOLD</span>
                )}
              </div>
            );
          })}
          <div style={{
            borderTop: "1px dashed #1e3a5f",
            marginTop: 10, paddingTop: 8,
            color: "#475569", fontSize: 10, letterSpacing: 2,
          }}>{"=".repeat(28)}</div>
          <div style={{ marginTop: 6 }}>
            <span style={{ color: "#475569", fontSize: 11, letterSpacing: 2 }}>Winner: </span>
            <span style={{ color: "#f59e0b", fontSize: 14, fontWeight: 900 }}>
              {hand.winnerName}
            </span>
          </div>
        </div>

        {/* 하단 버튼 */}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={handleCopy} style={{
            flex: 1, padding: "12px",
            background: copied ? "#10b981" : "#0a1628",
            border: `1.5px solid ${copied ? "#10b981" : "#1a2d45"}`,
            borderRadius: 10,
            color: copied ? "#000" : "#94a3b8",
            fontSize: 12, fontWeight: 900,
            letterSpacing: 1.5, cursor: "pointer",
            fontFamily: "'Courier New',monospace",
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
  const [editName, setEditName] = useState("");
  const [editPosition, setEditPosition] = useState("");
  const [editOut, setEditOut] = useState(false);
  const [posEditOpen, setPosEditOpen] = useState(false);
  const [activeView, setActiveView] = useState("table");
  const [showWinnerPicker, setShowWinnerPicker] = useState(false);
  const [selectedWinners, setSelectedWinners] = useState([]); // 다중 위너 선택용 seatId 배열
  const [cardPickerFor, setCardPickerFor] = useState(null); // { seatId }
  const [recapHand, setRecapHand] = useState(null); // 방금 끝난 핸드를 모달로 보여줌

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

  const activeSeats = seats.filter(s => s.active && s.name);
  // 실제 핸드에 참여하는 시트 (아웃된 시트 제외 = 데드버튼/데드블라인드 표현)
  const playingSeats = activeSeats.filter(s => !s.out);

  // ── 핸드 시작 ─────────────────────────────────────────────────────────────
  const startHand = () => {
    if (playingSeats.length < 2) return;

    // 버튼 위치 결정: 지정 안 됐으면 첫 playing 시트를 버튼으로
    let btn = buttonSeatId;
    const btnValid = btn != null && seats.some(s => s.id === btn);
    if (!btnValid) {
      btn = playingSeats[0].id;
      setButtonSeatId(btn);
    }

    // 버튼 자리 기준 포지션 계산 (데드 스몰/버튼 자동)
    const { positions, dead } = computePositions(seats, btn);

    // 참여 시트 + 계산된 포지션 (계산에서 빠진 시트는 제외 = 안전)
    const handSeats = playingSeats
      .filter(s => positions[s.id])
      .map(s => ({ id: s.id, name: s.name, position: positions[s.id] }));

    // 원본 seats에도 포지션 반영 (테이블 표시/수동수정 일관성)
    setSeats(prev => prev.map(s =>
      positions[s.id] ? { ...s, position: positions[s.id] } : s
    ));

    setCurrentHand({
      id: Date.now(),
      number: hands.length + 1,
      seats: handSeats,
      buttonSeatId: btn,
      dead,
      streets: { PREFLOP: [], FLOP: [], TURN: [], RIVER: [] },
      holeCards: {},
      winner: null,
      startedAt: new Date().toLocaleTimeString("ko-KR"),
    });
    setCurrentStreet(0);
    setShowWinnerPicker(false);
  };

  // ── 액션 기록 ────────────────────────────────────────────────────────────
  const logAction = (seatId, actionId) => {
    if (!currentHand) return;
    const street = STREETS[currentStreet];
    const seat = currentHand.seats.find(s => s.id === seatId);

    setCurrentHand(prev => {
      const updated = {
        ...prev,
        streets: {
          ...prev.streets,
          [street]: [
            ...prev.streets[street],
            { seatId, playerName: seat.name, position: seat.position, action: actionId },
          ],
        },
      };

      // 자동 위너 판정: 폴드 액션 후 한 명만 남으면 즉시 종료
      let autoEnded = false;
      if (actionId === "fold") {
        const foldedIds = new Set();
        for (let i = 0; i <= currentStreet; i++) {
          updated.streets[STREETS[i]].forEach(a => {
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
        for (const st of STREETS) {
          newStreets[st] = prev.streets[st].map(a =>
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
      for (const st of STREETS) {
        newStreets[st] = prev.streets[st].map(a => ({ ...a, position: remap(a.position) }));
      }
      return { ...prev, seats: newSeats, streets: newStreets };
    });
  };

  // ── 마지막 액션 되돌리기 (실수 정정용) ──────────────────────────────────
  const undoLastAction = () => {
    if (!currentHand) return;
    const street = STREETS[currentStreet];
    setCurrentHand(prev => ({
      ...prev,
      streets: {
        ...prev.streets,
        [street]: prev.streets[street].slice(0, -1),
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
    if (cardPickerFor) setHoleCards(cardPickerFor.seatId, cards);
  }, [cardPickerFor, setHoleCards]);

  // ── 살아있는 플레이어 계산 ────────────────────────────────────────────────
  // FOLD하지 않은 플레이어 = 살아있음
  const getAlivePlayers = (atStreetIdx) => {
    if (!currentHand) return [];
    const foldedIds = new Set();
    for (let i = 0; i <= atStreetIdx; i++) {
      const street = STREETS[i];
      currentHand.streets[street].forEach(a => {
        if (a.action === "fold") foldedIds.add(a.seatId);
      });
    }
    return currentHand.seats.filter(s => !foldedIds.has(s.id));
  };

  // 현재 스트리트에서 액션 가능한 플레이어
  // PREFLOP: 모든 활성 시트
  // FLOP+: 직전 스트리트까지 FOLD 안 한 사람만
  // 추가로 ALL-IN한 사람은 더 이상 액션 불가
  const getActionablePlayers = () => computeActionablePlayers(currentHand, currentStreet);

  // 액션 순서로 정렬
  const sortedActionable = () => computeSortedActionable(currentHand, currentStreet);

  // ── 다음 액션할 플레이어 계산 ─────────────────────────────────────────────
  // 마지막 BET/RAISE/OPEN/ALL-IN 이후 아직 응답 안 한 사람들이 액션해야 함
  const getNextToAct = () => computeNextToAct(currentHand, currentStreet);

  // 라운드 완료 여부 (모두 응답했으면 다음 스트리트로 가도 됨)
  const isRoundComplete = () => {
    return getNextToAct() === null;
  };

  // ── 스트리트 진행 ─────────────────────────────────────────────────────────
  const nextStreet = () => {
    // 액션 가능한 사람이 1명 이하면 (모두 올인 or 1명만 살아남음)
    // → 남은 스트리트 건너뛰고 위너 선택
    const actionable = getActionablePlayers();
    if (actionable.length <= 1) {
      // 리버까지 모든 빈 스트리트 통과
      setCurrentStreet(3);
      setShowWinnerPicker(true);
      return;
    }
    if (currentStreet < 3) {
      setCurrentStreet(s => s + 1);
    } else {
      setShowWinnerPicker(true);
    }
  };

  // ── 액션 가용성 체크 (UI 버튼과 단축키 공용) ─────────────────────────────
  const isActionDisabled = (actionId, player) => {
    if (!currentHand || !player) return true;
    const streetActions = currentHand.streets[currentStreetName];
    const someoneOpened = streetActions.some(a => a.action === "open" || a.action === "raise" || a.action === "allin");
    const someoneBet = streetActions.some(a => a.action === "bet" || a.action === "raise" || a.action === "allin");
    const lastAggressive = [...streetActions].reverse()
      .find(a => a.action === "open" || a.action === "bet" || a.action === "raise" || a.action === "allin");

    const holeCards = currentHand.holeCards[player.id] || [null, null];
    const hasCards = holeCards[0] && holeCards[1];

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

      // 위너 선택 화면: 숫자로 토글, Enter로 확정
      if (showWinnerPicker && currentHand) {
        const alive = getAlivePlayers(3);
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
        const nextPlayer = getNextToAct();
        // 1~7 = 액션 (ACTIONS 순서: open bet raise call check fold allin)
        if (nextPlayer && e.key >= "1" && e.key <= "7") {
          const action = ACTIONS[parseInt(e.key, 10) - 1];
          if (action && !isActionDisabled(action.id, nextPlayer)) {
            logAction(nextPlayer.id, action.id);
          }
          return;
        }
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
          }
        : s
    ));
    setEditingSeat(null);
    setEditName("");
    setEditPosition("");
    setEditOut(false);
  };

  const currentStreetName = STREETS[currentStreet];
  const isHandActive = !!currentHand;

  // ════════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════════
  return (
    <div style={{
      minHeight: "100vh",
      background: "#020912",
      fontFamily: "'Courier New', monospace",
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
              borderRadius: 5, color: activeView === v ? "#000" : "#475569",
              fontSize: 10, fontWeight: 700, cursor: "pointer", letterSpacing: 1,
            }}>{v.toUpperCase()}</button>
          ))}
        </div>
      </div>

      {/* ══════════════════ TABLE VIEW ══════════════════ */}
      {activeView === "table" && (
        <div style={{ padding: "14px 16px" }}>

          {/* 원형 테이블 */}
          <div style={{ position: "relative", width: "100%", paddingBottom: "80%", marginBottom: 14 }}>
            <div style={{ position: "absolute", inset: 0 }}>
              <svg viewBox="0 0 100 80" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
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
                <ellipse cx="50" cy="50" rx="46" ry="36" fill="url(#rim)" />
                <ellipse cx="50" cy="50" rx="43" ry="33" fill="url(#felt)" stroke="#0d4a31" strokeWidth=".6" />
                <ellipse cx="50" cy="50" rx="39" ry="29.5" fill="none" stroke="#0a3d28" strokeWidth=".3" strokeDasharray=".8 1.2" />
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
                      {STREETS.map((_, i) => (
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
                const lastAction = currentHand
                  ? currentHand.streets[currentStreetName]?.find(a => a.seatId === seat.id)
                  : null;

                // 상태 계산
                let isFolded = false;
                let isAllIn = false;
                if (currentHand) {
                  for (let k = 0; k <= currentStreet; k++) {
                    const street = STREETS[k];
                    currentHand.streets[street].forEach(a => {
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
                      onClick={() => {
                        if (isHandActive) return;
                        setEditingSeat(seat.id);
                        setEditName(seat.name);
                        setEditPosition(seat.position || POSITION_ORDER[seat.id] || "");
                        setEditOut(!!seat.out);
                      }}
                      style={{
                        width: 46, height: 46, borderRadius: "50%",
                        background: actionColor
                          ? actionColor + "22"
                          : seat.active ? "#0a2e1e" : "#080c14",
                        border: `2px solid ${
                          seat.out ? "#7f1d2e"
                            : actionColor ? actionColor
                            : seat.active ? "#10b981" : "#1a2d3f"
                        }`,
                        color: seat.active ? "#e2e8f0" : "#2a4060",
                        cursor: isHandActive ? "default" : "pointer",
                        display: "flex", flexDirection: "column",
                        alignItems: "center", justifyContent: "center",
                        gap: 1,
                        opacity: seat.out ? .4 : 1,
                        boxShadow: actionColor ? `0 0 10px ${actionColor}55`
                          : seat.active && !seat.out ? "0 0 8px rgba(16,185,129,.2)" : "none",
                      }}
                    >
                      <span style={{ fontSize: 8, color: seat.out ? "#f87171" : seat.active ? "#10b981" : "#1e3a5f", letterSpacing: .5 }}>
                        {seat.out ? "OUT" : seat.position ? posLabel(seat.position) : (i + 1)}
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
              <div style={{ color: "#475569", fontSize: 9, marginBottom: 10, letterSpacing: 2 }}>
                SEAT {editingSeat + 1}
              </div>
              <input
                value={editName}
                onChange={e => setEditName(e.target.value)}
                placeholder="이름 직접 입력..."
                autoFocus
                style={{
                  width: "100%", background: "#030e1e",
                  border: "1px solid #1a2d45", borderRadius: 8,
                  padding: "8px 12px", color: "#e2e8f0",
                  fontSize: 13, outline: "none", boxSizing: "border-box",
                  fontFamily: "inherit",
                }}
              />

              {/* 포지션 선택 */}
              <div style={{
                color: "#475569", fontSize: 9, marginTop: 12, marginBottom: 6, letterSpacing: 2,
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
                  borderRadius: 8, color: "#475569",
                  fontSize: 11, cursor: "pointer",
                }}>비우기</button>
                <button onClick={() => setEditingSeat(null)} style={{
                  padding: "9px 14px",
                  background: "transparent", border: "1px solid #1a2d45",
                  borderRadius: 8, color: "#475569",
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
                color: "#475569", fontSize: 10, marginBottom: 12, textAlign: "center",
              }}>여러 명 선택 시 SPLIT(찹) 처리</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {getAlivePlayers(3).map(seat => {
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
                          border: `2px solid ${isSel ? "#10b981" : "#475569"}`,
                          background: isSel ? "#10b981" : "transparent",
                          color: "#000", fontSize: 12, fontWeight: 900,
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>{isSel ? "✓" : ""}</span>
                        <span style={{
                          background: "#0f172a", border: "1px solid #1e293b",
                          fontSize: 10, color: "#10b981", padding: "1px 6px", borderRadius: 4,
                        }}>{posLabel(seat.position)}</span>
                        <span style={{ fontSize: 14, fontWeight: 700 }}>{seat.name}</span>
                        {cardsToText(currentHand.holeCards[seat.id]) && (
                          <span style={{
                            color: "#fbbf24", fontSize: 13, fontWeight: 900,
                            fontFamily: "'Georgia',serif",
                          }}>{cardsToText(currentHand.holeCards[seat.id])}</span>
                        )}
                      </div>
                      <span style={{ color: isSel ? "#10b981" : "#374151", fontSize: 16 }}>🏆</span>
                    </button>
                  );
                })}
              </div>

              {/* 확정 버튼 */}
              <button
                onClick={() => {
                  const winnerSeats = getAlivePlayers(3).filter(s => selectedWinners.includes(s.id));
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

              <button onClick={() => { discardHand(); setSelectedWinners([]); }} style={{
                marginTop: 8, width: "100%", padding: "8px",
                background: "transparent", border: "1px dashed #1a2d45",
                borderRadius: 8, color: "#374151",
                fontSize: 11, cursor: "pointer",
              }}>✕ 위너 없이 종료</button>
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
                {STREETS.map((s, i) => (
                  <div key={s} style={{
                    padding: "4px 11px",
                    background: i === currentStreet
                      ? "#f59e0b" : i < currentStreet ? "#0a2e1e" : "#070f1c",
                    border: `1px solid ${
                      i === currentStreet ? "#f59e0b"
                        : i < currentStreet ? "#10b981" : "#1a2d45"
                    }`,
                    borderRadius: 6,
                    color: i === currentStreet ? "#000"
                      : i < currentStreet ? "#10b981" : "#2a4060",
                    fontSize: 10, fontWeight: 700, letterSpacing: 1,
                  }}>{STREET_SHORT[s]}</div>
                ))}
                <div style={{ flex: 1 }} />
                <button onClick={undoLastAction} disabled={currentHand.streets[currentStreetName].length === 0} style={{
                  padding: "4px 10px",
                  background: "transparent", border: "1px solid #1a2d45",
                  borderRadius: 6, color: "#475569",
                  fontSize: 10, cursor: "pointer",
                  opacity: currentHand.streets[currentStreetName].length === 0 ? .3 : 1,
                }}>↶</button>
                <button onClick={discardHand} style={{
                  padding: "4px 10px",
                  background: "transparent", border: "1px solid #2d1a1a",
                  borderRadius: 6, color: "#4a2020",
                  fontSize: 10, cursor: "pointer",
                }}>✕</button>
              </div>

              {/* 액션 로그 (현재 스트리트) */}
              {currentHand.streets[currentStreetName].length > 0 && (
                <div style={{
                  background: "#020a14",
                  border: "1px solid #0f1f35",
                  borderRadius: 8, padding: "8px 10px",
                  marginBottom: 12,
                  display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center",
                  fontSize: 11,
                }}>
                  {(() => {
                    const rawEntries = currentHand.streets[currentStreetName];
                    const isPreflop = currentStreet === 0;
                    const isHeadsUp = currentHand.seats.length === 2;

                    let entries, showAllFold = false;
                    if (isPreflop) {
                      const r = processPreflopEntries(rawEntries, isHeadsUp);
                      entries = r.entries;
                      showAllFold = r.showAllFold;
                    } else {
                      entries = rawEntries;
                    }

                    const seenSeats = new Set();
                    const items = entries.map((e, i) => {
                      const cardsText = cardsToText(currentHand.holeCards?.[e.seatId]);
                      const isFirstForPlayer = !seenSeats.has(e.seatId);
                      seenSeats.add(e.seatId);
                      const label = getActionLabel(entries, i);
                      const isNBet = label && label.endsWith("-BET");
                      return (
                        <span key={i} style={{ whiteSpace: "nowrap" }}>
                          {isPreflop && isFirstForPlayer && (
                            <>
                              <span style={{ color: "#10b981", fontWeight: 700 }}>{posLabel(e.position)}</span>{" "}
                              <span style={{ color: "#e2e8f0", fontWeight: 700 }}>{e.playerName}</span>{" "}
                            </>
                          )}
                          {cardsText ? (
                            <span style={{ color: "#fbbf24", fontWeight: 900, fontFamily: "'Georgia',serif" }}>
                              {cardsText}
                            </span>
                          ) : (
                            <span style={{ color: "#94a3b8" }}>{e.playerName}</span>
                          )}
                          {" "}
                          {isNBet ? (
                            <span style={{
                              background: "#ef4444" + "22",
                              color: "#ef4444",
                              border: "1px solid #ef444455",
                              fontSize: 9, fontWeight: 900,
                              padding: "1px 6px", borderRadius: 4,
                              letterSpacing: 1, fontFamily: "'Courier New',monospace",
                            }}>{label}</span>
                          ) : (
                            <ActionBadge actionId={e.action} size="sm" />
                          )}
                          {i < entries.length - 1 && (
                            <span style={{ color: "#1e3a5f", margin: "0 4px" }}>/</span>
                          )}
                        </span>
                      );
                    });

                    if (showAllFold) {
                      items.push(
                        <span key="all-fold" style={{
                          background: "#475569" + "22",
                          color: "#94a3b8",
                          border: "1px solid #47556955",
                          fontSize: 9, fontWeight: 900,
                          padding: "1px 6px", borderRadius: 4,
                          letterSpacing: 1, fontFamily: "'Courier New',monospace",
                        }}>ALL-FOLD</span>
                      );
                    }
                    return items;
                  })()}
                </div>
              )}

              {/* 현재 액션할 사람 (단일 카드) */}
              {(() => {
                const nextPlayer = getNextToAct();

                if (!nextPlayer) {
                  return (
                    <div style={{
                      background: "#0a2e1e",
                      border: "1px dashed #10b981",
                      borderRadius: 10, padding: "20px 12px",
                      textAlign: "center",
                      color: "#10b981", fontSize: 12, letterSpacing: 2,
                    }}>
                      ✓ 라운드 완료 — 다음 스트리트로
                    </div>
                  );
                }

                const holeCards = currentHand.holeCards[nextPlayer.id] || [null, null];
                const hasCardsForNext = !!(holeCards[0] && holeCards[1]);

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
                          fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
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
                          style={{
                            display: "flex", gap: 3,
                            background: "transparent", border: "none", padding: 0,
                            cursor: "pointer", marginLeft: "auto",
                          }}
                        >
                          {[0, 1].map(slot => (
                            <div key={slot} style={{
                              width: 30, height: 40,
                              background: holeCards[slot] ? "transparent" : "#020a14",
                              border: holeCards[slot] ? "none" : "1.5px dashed #fbbf24",
                              borderRadius: 5,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              color: "#fbbf24", fontSize: 14,
                              animation: !holeCards[slot] ? "cardPulse 1.2s infinite" : "none",
                            }}>
                              {holeCards[slot] ? <CardChip card={holeCards[slot]} size="md" /> : "?"}
                            </div>
                          ))}
                        </button>
                      )}
                      {currentStreet === 0 && !hasCardsForNext && (
                        <span style={{
                          fontSize: 9, color: "#fbbf24",
                          background: "#fbbf24" + "22",
                          border: "1px solid #fbbf24",
                          padding: "2px 7px", borderRadius: 4,
                          letterSpacing: 1, fontWeight: 700,
                          width: "100%",
                          textAlign: "center", marginTop: 6,
                        }}>← 카드 선택 후 액션 (폴드는 가능)</span>
                      )}
                      {currentStreet > 0 && cardsToText(holeCards) && (
                        <span style={{
                          marginLeft: "auto",
                          color: "#fbbf24", fontSize: 16, fontWeight: 900,
                          fontFamily: "'Georgia',serif",
                        }}>{cardsToText(holeCards)}</span>
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
                                letterSpacing: 1, fontFamily: "inherit",
                              }}
                            >{posLabel(p)}</button>
                          );
                        })}
                      </div>
                    )}

                    {/* 액션 버튼 */}
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                      {ACTIONS.map((action, actionIdx) => {
                        // 단축키와 동일한 가용성 로직 공용 사용
                        const disabled = isActionDisabled(action.id, nextPlayer);

                        return (
                          <button
                            key={action.id}
                            onClick={() => { if (!disabled) { setPosEditOpen(false); logAction(nextPlayer.id, action.id); } }}
                            disabled={disabled}
                            style={{
                              flex: "1 1 auto", minWidth: 70,
                              padding: "11px 12px",
                              background: disabled ? "#070f1c" : action.color + "22",
                              border: `1.5px solid ${disabled ? "#1a2d45" : action.color}`,
                              borderRadius: 8,
                              color: disabled ? "#1a2d45" : action.color,
                              fontSize: 12, fontWeight: 900,
                              cursor: disabled ? "not-allowed" : "pointer",
                              letterSpacing: 1,
                              opacity: disabled ? .4 : 1,
                              transition: "all .1s",
                              position: "relative",
                            }}
                          >
                            <span style={{
                              position: "absolute", top: 2, left: 5,
                              fontSize: 8, opacity: .5, fontWeight: 700,
                            }}>{actionIdx + 1}</span>
                            {action.label}
                          </button>
                        );
                      })}
                    </div>
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
                <span style={{ color: "#475569", fontSize: 9, letterSpacing: 2 }}>
                  ALIVE
                </span>
                {getActionablePlayers().map(p => {
                  const hc = currentHand.holeCards[p.id];
                  return (
                    <span key={p.id} style={{
                      display: "inline-flex", alignItems: "center", gap: 4,
                      fontSize: 11,
                    }}>
                      <span style={{ color: "#10b981", fontSize: 9 }}>{posLabel(p.position)}</span>
                      <span style={{ color: "#94a3b8", fontWeight: 700 }}>{p.name}</span>
                      {cardsToText(hc) && (
                        <span style={{ color: "#fbbf24", fontFamily: "'Georgia',serif", fontWeight: 900 }}>
                          {cardsToText(hc)}
                        </span>
                      )}
                    </span>
                  );
                })}
              </div>

              {/* 다음 버튼 */}
              {(() => {
                const actionableCount = getActionablePlayers().length;
                const goToShowdown = actionableCount <= 1;
                const isGold = currentStreet === 3 || goToShowdown;
                return (
                  <button
                    onClick={nextStreet}
                    disabled={!isRoundComplete()}
                    style={{
                      width: "100%", marginTop: 14, padding: "13px",
                      background: !isRoundComplete() ? "#070f1c"
                        : isGold
                          ? "linear-gradient(135deg, #f59e0b, #b45309)"
                          : "linear-gradient(135deg, #1a3a8f, #0f2060)",
                      border: !isRoundComplete() ? "1px solid #1a2d45" : "none",
                      borderRadius: 10,
                      color: !isRoundComplete() ? "#1a2d45" : "#fff",
                      fontSize: 13, fontWeight: 900,
                      cursor: !isRoundComplete() ? "not-allowed" : "pointer",
                      letterSpacing: 2,
                      boxShadow: isGold && isRoundComplete()
                        ? "0 0 20px rgba(245,158,11,.4)" : "none",
                      opacity: !isRoundComplete() ? .5 : 1,
                    }}
                  >
                    {goToShowdown
                      ? "🏆 SHOWDOWN → WINNER 선택"
                      : currentStreet < 3
                        ? `→ ${STREET_SHORT[STREETS[currentStreet + 1]]} 로 이동`
                        : "🏆 WINNER 선택"}
                  </button>
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
                color: playingSeats.length >= 2 ? "#000" : "#2a4060",
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
            <span style={{ color: "#475569", fontSize: 10, letterSpacing: 3 }}>
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
                      fontFamily: "'Courier New',monospace",
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
                      fontFamily: "'Courier New',monospace",
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
        initialCards={currentHand?.holeCards[cardPickerFor?.seatId] || [null, null]}
      />

      {/* 핸드 종료 리캡 모달 */}
      <RecapModal
        hand={recapHand}
        onClose={() => setRecapHand(null)}
      />

      <style>{`
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

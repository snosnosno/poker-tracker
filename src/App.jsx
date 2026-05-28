import React, { useState, useEffect } from "react";

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
// PREFLOP: UTG → UTG+1 → MP → MP+1 → HJ → CO → BTN → SB → BB
// POSTFLOP: SB → BB → UTG → ... → BTN (SB부터 시작)
const POSITION_ORDER = ["UTG", "UTG+1", "MP", "MP+1", "HJ", "CO", "BTN", "SB", "BB"];

// 프리플랍 액션 순서 = POSITION_ORDER 그대로 (UTG가 첫번째)
// 포스트플랍 액션 순서 = SB → BB → UTG → ... → BTN
const POSTFLOP_ORDER = ["SB", "BB", "UTG", "UTG+1", "MP", "MP+1", "HJ", "CO", "BTN"];

// 카드
const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
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
function handToText(hand) {
  const lines = [];

  STREETS.forEach(street => {
    const rawEntries = hand.streets[street] || [];
    const isPreflop = street === "PREFLOP";

    // 첫 액션이 폴드인 사람은 숨김 (그 사람의 이후 액션도 없으므로 자동)
    // 단, 이미 다른 액션 후 폴드한 사람은 표시
    let entries;
    let hiddenFirstFolds = 0;
    if (isPreflop) {
      const actedSeats = new Set();
      entries = [];
      rawEntries.forEach(e => {
        if (e.action === "fold" && !actedSeats.has(e.seatId)) {
          hiddenFirstFolds++; // 첫 액션 폴드 → 숨김
        } else {
          actedSeats.add(e.seatId);
          entries.push(e);
        }
      });
    } else {
      entries = rawEntries;
    }

    // 프리플랍에서 표시되는 액션이 0개이고 숨겨진 폴드만 있으면 ALL-FOLD
    const showAllFold = isPreflop && entries.length === 0 && hiddenFirstFolds > 0;

    const parts = [];
    const seenSeats = new Set();
    entries.forEach((e, i) => {
      const cardsText = cardsToText(hand.holeCards?.[e.seatId]);
      const label = getActionLabel(entries, i);
      const isFirstForPlayer = !seenSeats.has(e.seatId);
      seenSeats.add(e.seatId);

      let prefix = "";
      if (isPreflop && isFirstForPlayer) {
        prefix = `${e.position} ${e.playerName} `;
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

// 포지션 로테이션 (활성 시트 기준 1칸 shift)
function rotatePositions(seats) {
  const actives = seats.filter(s => s.active && s.name);
  if (actives.length < 2) return seats;
  const ids = actives.map(s => s.id);
  const posArr = actives.map(s => s.position);
  // 마지막 포지션을 첫번째로 (BTN→CO, SB→BTN, BB→SB 방향)
  const rotated = [posArr[posArr.length - 1], ...posArr.slice(0, -1)];
  return seats.map(s => {
    const idx = ids.indexOf(s.id);
    return idx === -1 ? s : { ...s, position: rotated[idx] };
  });
}

// 활성 시트 N명에 맞는 포지션 할당 (BTN, SB, BB는 항상 포함)
function assignPositions(activeCount) {
  // 9명 표준 순서에서 필요한 만큼 선택
  // 항상 포함: BTN, SB, BB
  // N명일 때 사용할 포지션 (액션 순서)
  const presets = {
    2: ["BTN/SB", "BB"], // 헤즈업
    3: ["BTN", "SB", "BB"],
    4: ["CO", "BTN", "SB", "BB"],
    5: ["HJ", "CO", "BTN", "SB", "BB"],
    6: ["UTG", "HJ", "CO", "BTN", "SB", "BB"],
    7: ["UTG", "MP", "HJ", "CO", "BTN", "SB", "BB"],
    8: ["UTG", "UTG+1", "MP", "HJ", "CO", "BTN", "SB", "BB"],
    9: ["UTG", "UTG+1", "MP", "MP+1", "HJ", "CO", "BTN", "SB", "BB"],
  };
  return presets[activeCount] || presets[9];
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
  const w = size === "sm" ? 22 : 32;
  const h = size === "sm" ? 30 : 44;
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
// 카드 선택 모달
// ══════════════════════════════════════════════════════════════════════════════
function CardPickerModal({ open, onClose, onSelectBoth, usedCards = [], initialCards = [null, null] }) {
  const [picks, setPicks] = useState([null, null]);

  // open될 때 초기값 세팅
  useEffect(() => {
    if (open) setPicks([initialCards[0] || null, initialCards[1] || null]);
  }, [open]);

  if (!open) return null;

  const togglePick = (card) => {
    setPicks(prev => {
      // 이미 선택된 카드면 해제
      if (prev[0] === card) return [null, prev[1]];
      if (prev[1] === card) return [prev[0], null];
      // 빈 슬롯에 추가
      if (prev[0] === null) return [card, prev[1]];
      if (prev[1] === null) return [prev[0], card];
      // 둘 다 차있으면 두번째를 교체
      return [prev[0], card];
    });
  };

  const confirm = () => {
    onSelectBoth(picks);
    setPicks([null, null]);
  };

  const clearAll = () => setPicks([null, null]);

  const isPicked = (card) => picks[0] === card || picks[1] === card;
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
        borderRadius: 14, padding: 16,
        maxWidth: 380, width: "100%",
        maxHeight: "90vh", overflow: "auto",
      }}>
        {/* 상단: 선택된 카드 미리보기 */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginBottom: 14,
        }}>
          <div style={{ color: "#10b981", fontSize: 11, letterSpacing: 2 }}>
            홀카드 선택 (2장)
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {[0, 1].map(i => (
              <div key={i} style={{
                width: 36, height: 48,
                background: picks[i] ? "#fafafa" : "transparent",
                border: `2px dashed ${picks[i] ? "transparent" : "#1a2d45"}`,
                borderRadius: 5,
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                color: !picks[i] ? "#1a2d45"
                  : picks[i][1] === "h" ? "#dc2626"
                  : picks[i][1] === "d" ? "#2563eb"
                  : picks[i][1] === "c" ? "#16a34a" : "#0f172a",
                fontFamily: "'Georgia',serif",
                fontWeight: 900,
                lineHeight: 1,
                gap: 1,
              }}>
                {picks[i] ? (
                  <>
                    <span style={{ fontSize: 15 }}>{picks[i][0]}</span>
                    <span style={{ fontSize: 14 }}>
                      {SUITS.find(s => s.id === picks[i][1])?.label}
                    </span>
                  </>
                ) : (
                  <span style={{ fontSize: 18 }}>?</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 카드 그리드 */}
        {SUITS.map(suit => (
          <div key={suit.id} style={{ marginBottom: 10 }}>
            <div style={{
              fontSize: 18, color: suit.color, marginBottom: 4,
            }}>{suit.label}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {RANKS.map(rank => {
                const card = rank + suit.id;
                const used = usedCards.includes(card) && !isPicked(card);
                const picked = isPicked(card);
                return (
                  <button
                    key={card}
                    onClick={() => !used && togglePick(card)}
                    disabled={used}
                    style={{
                      width: 28, height: 36,
                      background: picked
                        ? "#10b981"
                        : used ? "#0a1628" : "#fafafa",
                      border: `2px solid ${
                        picked ? "#fbbf24" : used ? "#1a2d45" : "transparent"
                      }`,
                      borderRadius: 4,
                      color: picked ? "#000"
                        : used ? "#1a2d45"
                        : suit.color === "#f87171" ? "#dc2626"
                        : suit.color === "#fbbf24" ? "#2563eb"
                        : suit.color === "#86efac" ? "#16a34a" : "#0f172a",
                      fontWeight: 900, fontSize: 12,
                      fontFamily: "'Georgia', serif",
                      cursor: used ? "not-allowed" : "pointer",
                      opacity: used ? .3 : 1,
                      transform: picked ? "scale(1.1)" : "scale(1)",
                      transition: "all .1s",
                    }}
                  >{rank}</button>
                );
              })}
            </div>
          </div>
        ))}

        {/* 하단 버튼 */}
        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          <button onClick={confirm} disabled={!canConfirm} style={{
            flex: 1, padding: "10px",
            background: canConfirm ? "#10b981" : "#0a1628",
            border: "none", borderRadius: 8,
            color: canConfirm ? "#000" : "#1a2d45",
            fontSize: 12, fontWeight: 900,
            cursor: canConfirm ? "pointer" : "not-allowed",
            letterSpacing: 1,
          }}>✓ 확인</button>
          <button onClick={clearAll} style={{
            padding: "10px 14px",
            background: "#0a1628", border: "1px solid #1a2d45",
            borderRadius: 8, color: "#475569",
            fontSize: 11, cursor: "pointer",
          }}>비우기</button>
          <button onClick={onClose} style={{
            padding: "10px 14px",
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
    const text = handToText(hand);
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

            // 첫 액션이 폴드인 사람 숨김
            let entries;
            let hiddenFirstFolds = 0;
            if (isPreflop) {
              const actedSeats = new Set();
              entries = [];
              rawEntries.forEach(e => {
                if (e.action === "fold" && !actedSeats.has(e.seatId)) {
                  hiddenFirstFolds++;
                } else {
                  actedSeats.add(e.seatId);
                  entries.push(e);
                }
              });
            } else {
              entries = rawEntries;
            }

            const showAllFold = isPreflop && entries.length === 0 && hiddenFirstFolds > 0;

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
                            <span style={{ color: "#10b981", fontSize: 11, fontWeight: 700 }}>{e.position}</span>
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
// 메인 앱
// ══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [seats, setSeats] = useState(initSeats());
  const [hands, setHands] = useState([]);
  const [currentHand, setCurrentHand] = useState(null);
  const [currentStreet, setCurrentStreet] = useState(0);
  const [editingSeat, setEditingSeat] = useState(null);
  const [editName, setEditName] = useState("");
  const [editPosition, setEditPosition] = useState("");
  const [activeView, setActiveView] = useState("table");
  const [showWinnerPicker, setShowWinnerPicker] = useState(false);
  const [cardPickerFor, setCardPickerFor] = useState(null); // { seatId }

  const activeSeats = seats.filter(s => s.active && s.name);

  // ── 핸드 시작 ─────────────────────────────────────────────────────────────
  const startHand = () => {
    if (activeSeats.length < 2) return;
    // 활성 시트에 포지션 자동 할당
    const positions = assignPositions(activeSeats.length);
    const updatedSeats = seats.map(s => {
      if (!s.active || !s.name) return s;
      const idx = activeSeats.findIndex(a => a.id === s.id);
      return { ...s, position: positions[idx] };
    });
    setSeats(updatedSeats);

    const handSeats = activeSeats.map((s, i) => ({
      id: s.id,
      name: s.name,
      position: positions[i],
    }));

    setCurrentHand({
      id: Date.now(),
      number: hands.length + 1,
      seats: handSeats,
      streets: { PREFLOP: [], FLOP: [], TURN: [], RIVER: [] },
      holeCards: {}, // { seatId: [card1, card2] }
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
      if (actionId === "fold") {
        const foldedIds = new Set();
        for (let i = 0; i <= currentStreet; i++) {
          updated.streets[STREETS[i]].forEach(a => {
            if (a.action === "fold") foldedIds.add(a.seatId);
          });
        }
        const alive = updated.seats.filter(s => !foldedIds.has(s.id));
        if (alive.length === 1) {
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
            setSeats(s => rotatePositions(s));
            setCurrentHand(null);
            setCurrentStreet(0);
            setShowWinnerPicker(false);
          }, 400);
        }
      }

      return updated;
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
  const setHoleCards = (seatId, cards) => {
    setCurrentHand(prev => ({
      ...prev,
      holeCards: { ...prev.holeCards, [seatId]: cards },
    }));
    setCardPickerFor(null);
  };

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
  const getActionablePlayers = () => {
    if (!currentHand) return [];

    const foldedIds = new Set();
    const allInIds = new Set();
    // 현재 스트리트 이전까지의 폴드/올인
    for (let i = 0; i < currentStreet; i++) {
      const street = STREETS[i];
      currentHand.streets[street].forEach(a => {
        if (a.action === "fold") foldedIds.add(a.seatId);
        if (a.action === "allin") allInIds.add(a.seatId);
      });
    }
    // 현재 스트리트에서 폴드/올인한 사람도 더 이상 액션 불가
    currentHand.streets[STREETS[currentStreet]].forEach(a => {
      if (a.action === "fold") foldedIds.add(a.seatId);
      if (a.action === "allin") allInIds.add(a.seatId);
    });
    return currentHand.seats.filter(s => !foldedIds.has(s.id) && !allInIds.has(s.id));
  };

  // 액션 순서로 정렬
  const sortedActionable = () => {
    const players = getActionablePlayers();
    const order = currentStreet === 0 ? POSITION_ORDER : POSTFLOP_ORDER;
    return [...players].sort((a, b) => {
      const ai = order.indexOf(a.position);
      const bi = order.indexOf(b.position);
      const aIdx = ai === -1 ? order.indexOf("BTN") : ai;
      const bIdx = bi === -1 ? order.indexOf("BTN") : bi;
      return aIdx - bIdx;
    });
  };

  // ── 다음 액션할 플레이어 계산 ─────────────────────────────────────────────
  // 마지막 BET/RAISE/OPEN/ALL-IN 이후 아직 응답 안 한 사람들이 액션해야 함
  const getNextToAct = () => {
    if (!currentHand) return null;
    const street = STREETS[currentStreet];
    const streetActions = currentHand.streets[street];
    const actionable = sortedActionable();

    // 마지막 베팅성 액션 (OPEN/BET/RAISE/ALL-IN) 위치 찾기
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

    // 이 라운드(마지막 베팅 이후)에서 이미 액션한 사람들
    const respondedSeatIds = new Set();
    if (lastAggressorIdx >= 0) {
      respondedSeatIds.add(lastAggressorSeatId);
      for (let i = lastAggressorIdx + 1; i < streetActions.length; i++) {
        respondedSeatIds.add(streetActions[i].seatId);
      }
    } else {
      streetActions.forEach(a => respondedSeatIds.add(a.seatId));
    }

    if (lastAggressorIdx >= 0) {
      const aggressorPos = streetActions[lastAggressorIdx].position;
      const order = currentStreet === 0 ? POSITION_ORDER : POSTFLOP_ORDER;
      const aggrOrderIdx = order.indexOf(aggressorPos);

      for (let offset = 1; offset <= order.length; offset++) {
        const targetPos = order[(aggrOrderIdx + offset) % order.length];
        const player = actionable.find(p => p.position === targetPos);
        if (player && !respondedSeatIds.has(player.id)) {
          return player;
        }
      }
    } else {
      for (const p of actionable) {
        if (!respondedSeatIds.has(p.id)) return p;
      }
    }
    return null;
  };

  // 라운드 완료 여부 (모두 응답했으면 다음 스트리트로 가도 됨)
  const isRoundComplete = () => {
    return getNextToAct() === null;
  };

  // ── 스트리트 진행 ─────────────────────────────────────────────────────────
  const nextStreet = () => {
    if (currentStreet < 3) {
      setCurrentStreet(s => s + 1);
    } else {
      setShowWinnerPicker(true);
    }
  };

  // ── 위너 선택 → 핸드 종료 → 포지션 로테이션 ──────────────────────────────
  const selectWinner = (winnerSeat) => {
    const winnerCards = cardsToText(currentHand.holeCards[winnerSeat.id]);
    const finalHand = {
      ...currentHand,
      winnerName: winnerSeat.name,
      winnerCards,
      winnerSeatId: winnerSeat.id,
    };
    setHands(prev => [finalHand, ...prev]);
    setSeats(prev => rotatePositions(prev));
    setCurrentHand(null);
    setCurrentStreet(0);
    setShowWinnerPicker(false);
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
          }
        : s
    ));
    setEditingSeat(null);
    setEditName("");
    setEditPosition("");
  };

  const currentStreetName = STREETS[currentStreet];
  const isHandActive = !!currentHand;

  // 사용된 카드 목록 (전체)
  const usedCards = currentHand
    ? Object.values(currentHand.holeCards).flat().filter(Boolean)
    : [];

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
                    {activeSeats.length > 0 ? `${activeSeats.length} PLAYERS` : "EMPTY TABLE"}
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
                      }}
                      style={{
                        width: 46, height: 46, borderRadius: "50%",
                        background: actionColor
                          ? actionColor + "22"
                          : seat.active ? "#0a2e1e" : "#080c14",
                        border: `2px solid ${
                          actionColor ? actionColor
                            : seat.active ? "#10b981" : "#1a2d3f"
                        }`,
                        color: seat.active ? "#e2e8f0" : "#2a4060",
                        cursor: isHandActive ? "default" : "pointer",
                        display: "flex", flexDirection: "column",
                        alignItems: "center", justifyContent: "center",
                        gap: 1,
                        boxShadow: actionColor ? `0 0 10px ${actionColor}55`
                          : seat.active ? "0 0 8px rgba(16,185,129,.2)" : "none",
                      }}
                    >
                      <span style={{ fontSize: 8, color: seat.active ? "#10b981" : "#1e3a5f", letterSpacing: .5 }}>
                        {seat.position || (i + 1)}
                      </span>
                      <span style={{ fontSize: seat.name ? 9 : 14, fontWeight: seat.name ? 700 : 400 }}>
                        {seat.name ? seat.name.slice(0, 5) : "+"}
                      </span>
                    </button>
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
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                {Array.from({ length: 9 }, (_, i) => `P${i + 1}`).map(n => (
                  <button key={n} onClick={() => setEditName(n)} style={{
                    padding: "5px 10px",
                    background: editName === n ? "#10b981" : "#0a1628",
                    border: `1px solid ${editName === n ? "#10b981" : "#1a2d45"}`,
                    borderRadius: 6, color: editName === n ? "#000" : "#475569",
                    fontSize: 11, fontWeight: 700, cursor: "pointer",
                  }}>{n}</button>
                ))}
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

              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button onClick={saveSeatName} style={{
                  flex: 1, padding: "9px",
                  background: "#10b981", border: "none",
                  borderRadius: 8, color: "#000",
                  fontSize: 12, fontWeight: 900, cursor: "pointer",
                }}>✓ 확인</button>
                <button onClick={() => {
                  setSeats(prev => prev.map(s =>
                    s.id === editingSeat ? { ...s, name: "", active: false } : s
                  ));
                  setEditingSeat(null);
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
                letterSpacing: 2, marginBottom: 14, textAlign: "center",
              }}>🏆 WINNER 선택</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {/* 살아있는 사람만 표시 */}
                {getAlivePlayers(3).map(seat => (
                  <button
                    key={seat.id}
                    onClick={() => selectWinner(seat)}
                    style={{
                      padding: "12px 16px",
                      background: "#0a1628",
                      border: "1px solid #1a2d45",
                      borderRadius: 10,
                      color: "#e2e8f0",
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{
                        background: "#0f172a", border: "1px solid #1e293b",
                        fontSize: 10, color: "#10b981", padding: "1px 6px", borderRadius: 4,
                      }}>{seat.position}</span>
                      <span style={{ fontSize: 14, fontWeight: 700 }}>{seat.name}</span>
                      {cardsToText(currentHand.holeCards[seat.id]) && (
                        <span style={{
                          color: "#fbbf24", fontSize: 13, fontWeight: 900,
                          fontFamily: "'Georgia',serif",
                        }}>{cardsToText(currentHand.holeCards[seat.id])}</span>
                      )}
                    </div>
                    <span style={{ color: "#f59e0b", fontSize: 16 }}>🏆</span>
                  </button>
                ))}
              </div>
              <button onClick={discardHand} style={{
                marginTop: 10, width: "100%", padding: "8px",
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

                    // 첫 액션 폴드 숨김
                    let entries;
                    let hiddenFirstFolds = 0;
                    if (isPreflop) {
                      const actedSeats = new Set();
                      entries = [];
                      rawEntries.forEach(e => {
                        if (e.action === "fold" && !actedSeats.has(e.seatId)) {
                          hiddenFirstFolds++;
                        } else {
                          actedSeats.add(e.seatId);
                          entries.push(e);
                        }
                      });
                    } else {
                      entries = rawEntries;
                    }
                    const showAllFold = isPreflop && entries.length === 0 && hiddenFirstFolds > 0;

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
                              <span style={{ color: "#10b981", fontWeight: 700 }}>{e.position}</span>{" "}
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
                const streetActions = currentHand.streets[currentStreetName];
                const someoneOpened = streetActions.some(a => a.action === "open" || a.action === "raise" || a.action === "allin");
                const someoneBet = streetActions.some(a => a.action === "bet" || a.action === "raise" || a.action === "allin");
                const lastAggressive = [...streetActions].reverse()
                  .find(a => a.action === "open" || a.action === "bet" || a.action === "raise" || a.action === "allin");

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
                      <span style={{
                        background: "#020a14", border: "1px solid #10b981",
                        fontSize: 11, color: "#10b981",
                        padding: "2px 8px", borderRadius: 4, letterSpacing: 1, fontWeight: 700,
                      }}>{nextPlayer.position}</span>
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

                    {/* 액션 버튼 */}
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                      {ACTIONS.map(action => {
                        let disabled = false;

                        // 프리플랍에서 카드 없으면 FOLD만 가능
                        const holeCards = currentHand.holeCards[nextPlayer.id] || [null, null];
                        const hasCards = holeCards[0] && holeCards[1];
                        if (currentStreet === 0 && !hasCards && action.id !== "fold") {
                          disabled = true;
                        }

                        if (action.id === "open") {
                          if (currentStreet !== 0) disabled = true;
                          if (someoneOpened) disabled = true;
                        }
                        if (action.id === "bet") {
                          if (currentStreet === 0) disabled = true;
                          if (someoneBet) disabled = true;
                        }
                        if (action.id === "raise") {
                          if (currentStreet === 0 && !someoneOpened) disabled = true;
                          if (currentStreet > 0 && !someoneBet) disabled = true;
                        }
                        if (action.id === "check") {
                          if (someoneOpened || someoneBet) disabled = true;
                        }
                        if (action.id === "call") {
                          if (!someoneOpened && !someoneBet) disabled = true;
                          // 본인이 마지막 베팅자면 콜 불가
                          if (lastAggressive?.seatId === nextPlayer.id) disabled = true;
                        }

                        return (
                          <button
                            key={action.id}
                            onClick={() => !disabled && logAction(nextPlayer.id, action.id)}
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
                            }}
                          >{action.label}</button>
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
                      <span style={{ color: "#10b981", fontSize: 9 }}>{p.position}</span>
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
              <button
                onClick={nextStreet}
                disabled={!isRoundComplete()}
                style={{
                  width: "100%", marginTop: 14, padding: "13px",
                  background: !isRoundComplete() ? "#070f1c"
                    : currentStreet < 3
                      ? "linear-gradient(135deg, #1a3a8f, #0f2060)"
                      : "linear-gradient(135deg, #f59e0b, #b45309)",
                  border: !isRoundComplete() ? "1px solid #1a2d45" : "none",
                  borderRadius: 10,
                  color: !isRoundComplete() ? "#1a2d45" : "#fff",
                  fontSize: 13, fontWeight: 900,
                  cursor: !isRoundComplete() ? "not-allowed" : "pointer",
                  letterSpacing: 2,
                  boxShadow: currentStreet === 3 && isRoundComplete()
                    ? "0 0 20px rgba(245,158,11,.4)" : "none",
                  opacity: !isRoundComplete() ? .5 : 1,
                }}
              >
                {currentStreet < 3
                  ? `→ ${STREET_SHORT[STREETS[currentStreet + 1]]} 로 이동`
                  : "🏆 WINNER 선택"}
              </button>
            </div>
          )}

          {/* NEW HAND */}
          {!isHandActive && (
            <button
              onClick={startHand}
              disabled={activeSeats.length < 2}
              style={{
                width: "100%", padding: "14px",
                background: activeSeats.length >= 2
                  ? "linear-gradient(135deg, #10b981, #059669)"
                  : "#070f1c",
                border: `1px solid ${activeSeats.length >= 2 ? "#10b981" : "#1a2d45"}`,
                borderRadius: 12,
                color: activeSeats.length >= 2 ? "#000" : "#2a4060",
                fontSize: 14, fontWeight: 900,
                cursor: activeSeats.length >= 2 ? "pointer" : "not-allowed",
                letterSpacing: 3,
              }}
            >
              {activeSeats.length >= 2
                ? `▶ NEW HAND  (${activeSeats.length}명)`
                : "시트를 설정하세요 (최소 2명)"}
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
                <button
                  onClick={() => {
                    const all = hands.slice().reverse().map(handToText).join("\n\n");
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
        onClose={() => setCardPickerFor(null)}
        onSelectBoth={cards => setHoleCards(cardPickerFor.seatId, cards)}
        usedCards={usedCards.filter(c =>
          // 본인이 들고 있는 카드는 다른 카드 선택에 영향 안 주게
          !(currentHand?.holeCards[cardPickerFor?.seatId] || []).includes(c)
        )}
        initialCards={currentHand?.holeCards[cardPickerFor?.seatId] || [null, null]}
      />

      <style>{`
        @keyframes cardPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(251, 191, 36, .7); }
          50% { box-shadow: 0 0 0 6px rgba(251, 191, 36, 0); }
        }
      `}</style>
    </div>
  );
}

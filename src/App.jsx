import { useState, useEffect, useRef } from "react";
import { loadConversations, saveConversation, deleteConversation } from "./supabaseClient";

const TOPICS = {
  "PP – Production Planning": [
    "Production Orders",
    "Production Versions",
    "Bill of Materials",
    "Routings & Work Centers",
    "MRP & Planning",
    "Demand Management",
    "Capacity Planning",
    "Goods Issue / Confirmation",
  ],
  "PM – Plant Maintenance": [
    "Maintenance Orders",
    "Maintenance Plans",
    "Functional Locations",
    "Equipment Master",
    "Notifications",
    "Refurbishment Orders",
    "Person Responsible",
  ],
  "MM – Logistics": [
    "Purchase Orders",
    "Goods Receipt",
    "Stock Transfer",
    "Subcontracting",
    "Inventory Management",
    "Batch Management",
    "MRP Areas",
  ],
  "Fiori / UX": [
    "Fiori Apps Overview",
    "Launchpad Config",
    "App Authorizations",
    "Custom Tiles",
    "Fiori vs GUI",
  ],
  "S/4HANA General": [
    "Table Lookups",
    "BAdIs & User Exits",
    "SPRO Configuration",
    "Error Messages",
    "Z-Programs",
    "Migration Topics",
  ],
};

const ModuleColors = {
  "PP – Production Planning": { bg: "#1a2a1a", accent: "#4ade80", dot: "#22c55e" },
  "PM – Plant Maintenance":   { bg: "#1a1a2a", accent: "#818cf8", dot: "#6366f1" },
  "MM – Logistics":           { bg: "#2a1a1a", accent: "#fb923c", dot: "#f97316" },
  "Fiori / UX":               { bg: "#1a2228", accent: "#38bdf8", dot: "#0ea5e9" },
  "S/4HANA General":          { bg: "#28201a", accent: "#fbbf24", dot: "#f59e0b" },
};

function getStarters(topic) {
  const map = {
    "Production Orders":     ["What statuses block a prod order?", "How does TECO affect MRP?", "Difference between PP01 and CO01?"],
    "Production Versions":   ["When is a prod version mandatory?", "How does MRP select a prod version?", "Can one material have multiple active versions?"],
    "Bill of Materials":     ["BOM usage in MRP vs production?", "How to handle phantom assemblies?", "Alternative BOM selection in routing?"],
    "Routings & Work Centers":["Difference between PP01 and CA01?", "How is lead time calculated in routing?", "What drives capacity load?"],
    "MRP & Planning":        ["Why is MRP not creating planned orders?", "How does safety stock affect MRP?", "Difference between MRP types VB and PD?"],
    "Maintenance Orders":    ["PM02 vs PM01 order type difference?", "How is settlement done for PM orders?", "What triggers TECO in PM?"],
    "Maintenance Plans":     ["How does call horizon work?", "Single vs strategy maintenance plan?", "How to link measuring points?"],
    "Purchase Orders":       ["ME21N key fields explained", "What blocks GR on a PO?", "Tolerance limits for GR/IR?"],
    "Goods Receipt":         ["MIGO vs MIGO_GR difference?", "Movement type 101 vs 501?", "How to reverse a GR?"],
    "Fiori Apps Overview":   ["Best apps for production supervisor?", "Request maintenance vs report malfunction?", "Which apps replace SAP GUI?"],
    "Error Messages":        ["How to find message class and number?", "How to make error a warning?", "Where to debug user exit for messages?"],
    "BAdIs & User Exits":    ["Difference between BAdI and user exit?", "How to find right BAdI for PM orders?", "WORKORDER_UPDATE use cases?"],
  };
  return map[topic] || ["What are the key config steps?", "Common issues and fixes?", "Important tables for this topic?"];
}

function TypingIndicator() {
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center", padding: "10px 14px" }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          width: 7, height: 7, borderRadius: "50%", background: "#fbbf24",
          animation: "bounce 1.2s infinite",
          animationDelay: `${i * 0.2}s`, opacity: 0.7
        }} />
      ))}
    </div>
  );
}

function Message({ msg }) {
  const isUser = msg.role === "user";
  return (
    <div style={{
      display: "flex", justifyContent: isUser ? "flex-end" : "flex-start",
      marginBottom: 16, gap: 10, alignItems: "flex-start",
    }}>
      {!isUser && (
        <div style={{
          width: 30, height: 30, borderRadius: "50%",
          background: "linear-gradient(135deg, #f59e0b, #d97706)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 13, fontWeight: 700, color: "#000", flexShrink: 0, marginTop: 2
        }}>S</div>
      )}
      <div style={{
        maxWidth: "72%",
        background: isUser ? "linear-gradient(135deg, #1e3a5f, #1a3050)" : "#1c1c1c",
        border: isUser ? "1px solid #2563eb44" : "1px solid #2a2a2a",
        borderRadius: isUser ? "18px 4px 18px 18px" : "4px 18px 18px 18px",
        padding: "11px 15px",
        color: isUser ? "#e2e8f0" : "#d4d4d4",
        fontSize: 14, lineHeight: 1.65,
        whiteSpace: "pre-wrap", wordBreak: "break-word",
        fontFamily: "'IBM Plex Mono', monospace",
      }}>
        {msg.content}
      </div>
      {isUser && (
        <div style={{
          width: 30, height: 30, borderRadius: "50%",
          background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 13, fontWeight: 700, color: "#fff", flexShrink: 0, marginTop: 2
        }}>A</div>
      )}
    </div>
  );
}

export default function SAPBrain() {
  const [activeModule, setActiveModule]         = useState(null);
  const [activeTopic, setActiveTopic]           = useState(null);
  const [conversations, setConversations]       = useState({});
  const [input, setInput]                       = useState("");
  const [loading, setLoading]                   = useState(false);
  const [dbLoading, setDbLoading]               = useState(true);
  const [sidebarOpen, setSidebarOpen]           = useState(true);
  const [expandedModules, setExpandedModules]   = useState({ "PP – Production Planning": true });
  const [customTopicInput, setCustomTopicInput] = useState("");
  const [showCustomInput, setShowCustomInput]   = useState(null);
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  const topicKey = activeModule && activeTopic ? `${activeModule}__${activeTopic}` : null;
  const messages = topicKey ? (conversations[topicKey] || []) : [];

  // Load from Supabase on mount
  useEffect(() => {
    loadConversations().then(data => {
      setConversations(data);
      setDbLoading(false);
    });
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);
  useEffect(() => { if (activeTopic) inputRef.current?.focus(); }, [activeTopic]);

  const toggleModule = (mod) => setExpandedModules(prev => ({ ...prev, [mod]: !prev[mod] }));

  const selectTopic = (mod, topic) => {
    setActiveModule(mod);
    setActiveTopic(topic);
    setExpandedModules(prev => ({ ...prev, [mod]: true }));
  };

  const sendMessage = async () => {
    if (!input.trim() || !topicKey || loading) return;
    const userMsg = { role: "user", content: input.trim() };
    const updatedMsgs = [...messages, userMsg];
    setConversations(prev => ({ ...prev, [topicKey]: updatedMsgs }));
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: updatedMsgs,
          module: activeModule,
          topic: activeTopic,
        }),
      });

      const data = await response.json();
      const reply = data.reply || "No response received.";
      const finalMsgs = [...updatedMsgs, { role: "assistant", content: reply }];
      setConversations(prev => ({ ...prev, [topicKey]: finalMsgs }));
      await saveConversation(topicKey, finalMsgs);
    } catch (e) {
      const errMsgs = [...updatedMsgs, { role: "assistant", content: "Error reaching AI. Please try again." }];
      setConversations(prev => ({ ...prev, [topicKey]: errMsgs }));
    }
    setLoading(false);
  };

  const clearTopic = async () => {
    if (!topicKey) return;
    setConversations(prev => { const u = { ...prev }; delete u[topicKey]; return u; });
    await deleteConversation(topicKey);
  };

  const addCustomTopic = (mod) => {
    if (!customTopicInput.trim()) return;
    selectTopic(mod, customTopicInput.trim());
    setCustomTopicInput("");
    setShowCustomInput(null);
  };

  const accentColor = activeModule ? ModuleColors[activeModule]?.accent : "#fbbf24";

  return (
    <div style={{
      display: "flex", height: "100vh", width: "100%",
      background: "#0a0a0a", fontFamily: "'IBM Plex Mono', monospace",
      color: "#e2e8f0", overflow: "hidden",
    }}>
      <style>{`
        @keyframes bounce { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-6px)} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin { to{transform:rotate(360deg)} }
        ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-track{background:#111}
        ::-webkit-scrollbar-thumb{background:#333;border-radius:2px}
        .topic-item:hover{background:#1e1e1e !important; cursor:pointer;}
        .send-btn:hover{opacity:0.85;transform:scale(0.97)}
        .clear-btn:hover{color:#ef4444 !important}
        textarea:focus{outline:none;}
      `}</style>

      {/* Sidebar */}
      <div style={{
        width: sidebarOpen ? 265 : 0, minWidth: sidebarOpen ? 265 : 0,
        background: "#0f0f0f", borderRight: "1px solid #1e1e1e",
        display: "flex", flexDirection: "column", overflow: "hidden",
        transition: "all 0.25s ease",
      }}>
        {/* Logo */}
        <div style={{
          padding: "18px 16px 14px", borderBottom: "1px solid #1e1e1e",
          display: "flex", alignItems: "center", gap: 10
        }}>
          <div style={{
            width: 34, height: 34,
            background: "linear-gradient(135deg, #f59e0b, #92400e)",
            borderRadius: 7, display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#000"
          }}>S4</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#fbbf24", letterSpacing: 1 }}>SAP BRAIN</div>
            <div style={{ fontSize: 10, color: "#444", letterSpacing: 0.5 }}>personal knowledge base</div>
          </div>
        </div>

        {/* Module list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "10px 0" }}>
          {dbLoading ? (
            <div style={{ padding: 20, color: "#333", fontSize: 11, textAlign: "center" }}>
              <div style={{ width: 16, height: 16, border: "2px solid #333", borderTopColor: "#fbbf24", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 8px" }} />
              loading your library...
            </div>
          ) : (
            Object.entries(TOPICS).map(([mod, topics]) => {
              const colors = ModuleColors[mod];
              const isExpanded = expandedModules[mod];
              return (
                <div key={mod} style={{ marginBottom: 2 }}>
                  <div
                    onClick={() => toggleModule(mod)}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "8px 16px", cursor: "pointer",
                      color: isExpanded ? colors.accent : "#555",
                      fontSize: 10, fontWeight: 600, letterSpacing: 1,
                      textTransform: "uppercase", transition: "color 0.2s", userSelect: "none",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <div style={{
                        width: 6, height: 6, borderRadius: "50%",
                        background: isExpanded ? colors.dot : "#2a2a2a",
                        transition: "background 0.2s"
                      }} />
                      {mod.split("–")[0].trim()}
                    </div>
                    <span style={{ fontSize: 9, opacity: 0.4 }}>{isExpanded ? "▲" : "▼"}</span>
                  </div>

                  {isExpanded && (
                    <div>
                      {topics.map(topic => {
                        const key = `${mod}__${topic}`;
                        const hasConvo = (conversations[key] || []).length > 0;
                        const isActive = activeModule === mod && activeTopic === topic;
                        return (
                          <div
                            key={topic}
                            className="topic-item"
                            onClick={() => selectTopic(mod, topic)}
                            style={{
                              padding: "7px 16px 7px 28px", fontSize: 12,
                              color: isActive ? colors.accent : hasConvo ? "#999" : "#444",
                              background: isActive ? colors.bg : "transparent",
                              borderLeft: isActive ? `2px solid ${colors.dot}` : "2px solid transparent",
                              display: "flex", alignItems: "center", gap: 7,
                              transition: "all 0.15s",
                            }}
                          >
                            {hasConvo && !isActive && (
                              <div style={{ width: 4, height: 4, borderRadius: "50%", background: colors.dot, flexShrink: 0 }} />
                            )}
                            {topic}
                          </div>
                        );
                      })}

                      {showCustomInput === mod ? (
                        <div style={{ padding: "6px 16px 6px 28px", display: "flex", gap: 6 }}>
                          <input
                            autoFocus value={customTopicInput}
                            onChange={e => setCustomTopicInput(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === "Enter") addCustomTopic(mod);
                              if (e.key === "Escape") setShowCustomInput(null);
                            }}
                            placeholder="topic name..."
                            style={{
                              flex: 1, background: "#1a1a1a", border: "1px solid #333",
                              borderRadius: 4, padding: "4px 8px", color: "#ccc",
                              fontSize: 11, fontFamily: "inherit", outline: "none"
                            }}
                          />
                          <button onClick={() => addCustomTopic(mod)} style={{
                            background: colors.dot, border: "none", borderRadius: 4,
                            color: "#000", cursor: "pointer", fontSize: 10,
                            padding: "2px 8px", fontWeight: 700
                          }}>+</button>
                        </div>
                      ) : (
                        <div
                          onClick={e => { e.stopPropagation(); setShowCustomInput(mod); }}
                          className="topic-item"
                          style={{ padding: "5px 16px 8px 28px", fontSize: 11, color: "#2a2a2a", display: "flex", alignItems: "center", gap: 5 }}
                        >+ custom topic</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div style={{ padding: "12px 16px", borderTop: "1px solid #1a1a1a", fontSize: 10, color: "#2a2a2a" }}>
          ASK-WANI · GDPR SAFE · SUPABASE
        </div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Header */}
        <div style={{
          padding: "14px 20px", borderBottom: "1px solid #1a1a1a",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "#0c0c0c",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              style={{
                background: "none", border: "1px solid #222", borderRadius: 4,
                color: "#555", cursor: "pointer", padding: "4px 9px", fontSize: 13
              }}
            >☰</button>
            {activeTopic ? (
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: accentColor }}>{activeTopic}</div>
                <div style={{ fontSize: 10, color: "#3a3a3a", marginTop: 1 }}>{activeModule}</div>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: "#2a2a2a" }}>Select a topic to begin</div>
            )}
          </div>
          {activeTopic && messages.length > 0 && (
            <button
              className="clear-btn"
              onClick={clearTopic}
              style={{
                background: "none", border: "1px solid #1e1e1e", borderRadius: 4,
                color: "#333", cursor: "pointer", padding: "4px 10px",
                fontSize: 11, fontFamily: "inherit", transition: "color 0.2s"
              }}
            >clear thread</button>
          )}
        </div>

        {/* Chat */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px 20px" }}>
          {!activeTopic ? (
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", height: "100%", gap: 14, opacity: 0.3
            }}>
              <div style={{ fontSize: 36 }}>⬡</div>
              <div style={{ fontSize: 12, color: "#555", textAlign: "center", lineHeight: 2 }}>
                Select a topic from the sidebar<br />to start your SAP knowledge session
              </div>
            </div>
          ) : messages.length === 0 ? (
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", height: "100%", gap: 14,
              animation: "fadeIn 0.4s ease"
            }}>
              <div style={{
                width: 50, height: 50, borderRadius: 12,
                background: ModuleColors[activeModule]?.bg,
                border: `1px solid ${ModuleColors[activeModule]?.dot}33`,
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24
              }}>
                {activeModule.includes("PP") ? "⚙" : activeModule.includes("PM") ? "🔧" : activeModule.includes("MM") ? "📦" : activeModule.includes("Fiori") ? "◻" : "◈"}
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: accentColor }}>{activeTopic}</div>
              <div style={{ fontSize: 12, color: "#3a3a3a", textAlign: "center", maxWidth: 320, lineHeight: 1.8 }}>
                Ask anything. Technical, config-level answers — always.
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6, justifyContent: "center", maxWidth: 420 }}>
                {getStarters(activeTopic).map((s, i) => (
                  <div
                    key={i} onClick={() => setInput(s)}
                    className="topic-item"
                    style={{
                      padding: "6px 13px", background: "#111",
                      border: `1px solid ${ModuleColors[activeModule]?.dot}22`,
                      borderRadius: 20, fontSize: 11, color: "#555", transition: "all 0.15s",
                    }}
                  >{s}</div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ maxWidth: 760, margin: "0 auto", animation: "fadeIn 0.3s ease" }}>
              {messages.map((msg, i) => <Message key={i} msg={msg} />)}
              {loading && (
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 16 }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: "50%",
                    background: "linear-gradient(135deg, #f59e0b, #d97706)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 13, fontWeight: 700, color: "#000", flexShrink: 0
                  }}>S</div>
                  <div style={{ background: "#1c1c1c", border: "1px solid #2a2a2a", borderRadius: "4px 18px 18px 18px" }}>
                    <TypingIndicator />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Input */}
        {activeTopic && (
          <div style={{ padding: "14px 20px", borderTop: "1px solid #1a1a1a", background: "#0c0c0c" }}>
            <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", gap: 10 }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
                }}
                placeholder={`Ask about ${activeTopic}... (Enter to send, Shift+Enter for newline)`}
                rows={1}
                style={{
                  flex: 1, background: "#141414",
                  border: `1px solid ${input.trim() ? ModuleColors[activeModule]?.dot + "55" : "#1e1e1e"}`,
                  borderRadius: 10, padding: "11px 14px",
                  color: "#e2e8f0", fontSize: 13,
                  fontFamily: "'IBM Plex Mono', monospace",
                  resize: "none", lineHeight: 1.5,
                  transition: "border-color 0.2s", maxHeight: 120, overflowY: "auto"
                }}
              />
              <button
                className="send-btn"
                onClick={sendMessage}
                disabled={!input.trim() || loading}
                style={{
                  background: loading || !input.trim()
                    ? "#141414"
                    : `linear-gradient(135deg, ${ModuleColors[activeModule]?.dot}, ${ModuleColors[activeModule]?.dot}99)`,
                  border: "none", borderRadius: 10,
                  color: loading || !input.trim() ? "#2a2a2a" : "#000",
                  cursor: loading || !input.trim() ? "not-allowed" : "pointer",
                  padding: "0 18px", fontSize: 18,
                  transition: "all 0.2s", fontWeight: 700, minWidth: 46
                }}
              >→</button>
            </div>
            <div style={{ maxWidth: 760, margin: "5px auto 0", fontSize: 10, color: "#222", textAlign: "right" }}>
              Standard SAP answers — always verify system-specific behaviour
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import React, { useState, useRef, useEffect } from "react";
import { MessageSquare, Send, X, Sparkles, BarChart3, TrendingUp, Users, ShoppingCart, Lightbulb } from "lucide-react";
import { api } from "../../api/client.js";

type Message = {
  role: "user" | "assistant";
  content: string;
};

const suggestions = [
  { icon: <BarChart3 size={14} />, text: "Podsumuj dane sprzedażowe" },
  { icon: <TrendingUp size={14} />, text: "Które kampanie mają najlepszy ROAS?" },
  { icon: <Users size={14} />, text: "Analiza segmentów klientów" },
  { icon: <ShoppingCart size={14} />, text: "Trendy w zamówieniach" },
  { icon: <Lightbulb size={14} />, text: "Sugestie optymalizacji" },
];

export function AiPanel() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Cześć! Jestem Asystentem AI DataOrganizer. Zadaj mi pytanie o swoje dane sprzedażowe, marketingowe lub ruch na stronie." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [context, setContext] = useState<string[]>(["Strona: DataOrganizer — dashboard e-commerce", "Funkcje: analiza sprzedaży, marketing, ruch, klienci, produkty"]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: Message = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await api.post<{ reply: string }>("/api/sales/ai/query", {
        query: text,
        context: context.join("\n"),
        history: messages.slice(-6).map((m) => `${m.role}: ${m.content}`).join("\n"),
      });
      setMessages((prev) => [...prev, { role: "assistant", content: res.reply }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Przepraszam, wystąpił błąd podczas przetwarzania zapytania. Spróbuj ponownie później." }]);
    }
    setLoading(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", bottom: 24, right: 24,
          width: 56, height: 56, borderRadius: "50%",
          background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
          color: "#fff", border: "none",
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", boxShadow: "0 4px 20px rgba(99,102,241,0.4)",
          zIndex: 999,
        }}
      >
        <MessageSquare size={24} />
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed", bottom: 0, right: 0, top: 0,
        width: 400, background: "#fff",
        borderLeft: "1px solid #e2e8f0",
        display: "flex", flexDirection: "column",
        zIndex: 1000, boxShadow: "-4px 0 24px rgba(0,0,0,0.08)",
      }}
    >
      {/* Header */}
      <div style={{
        padding: "16px 20px",
        borderBottom: "1px solid #e2e8f0",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
        color: "#fff",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Sparkles size={20} />
          <span style={{ fontWeight: 600, fontSize: 15 }}>Asystent AI</span>
        </div>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", opacity: 0.8 }}>
          <X size={18} />
        </button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflow: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              maxWidth: "85%",
              padding: "10px 14px",
              borderRadius: 12,
              fontSize: 13,
              lineHeight: 1.5,
              alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
              background: msg.role === "user" ? "#6366f1" : "#f1f5f9",
              color: msg.role === "user" ? "#fff" : "#1e293b",
            }}
          >
            {msg.content}
          </div>
        ))}
        {loading && (
          <div style={{ alignSelf: "flex-start", padding: "10px 14px", background: "#f1f5f9", borderRadius: 12, fontSize: 13, color: "#94a3b8" }}>
            Myślę...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Suggestions */}
      {messages.length <= 2 && (
        <div style={{ padding: "0 16px 8px", display: "flex", flexWrap: "wrap", gap: 6 }}>
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => sendMessage(s.text)}
              disabled={loading}
              style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: "6px 10px", fontSize: 11,
                background: "#f1f5f9", border: "1px solid #e2e8f0",
                borderRadius: 20, cursor: "pointer",
                color: "#475569",
              }}
            >
              {s.icon} {s.text}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={{ padding: "12px 16px", borderTop: "1px solid #e2e8f0" }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage(input)}
            placeholder="Zapytaj o dane..."
            style={{
              flex: 1, padding: "10px 14px",
              border: "1px solid #d1d5db", borderRadius: 8,
              fontSize: 13, outline: "none",
            }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={loading || !input.trim()}
            style={{
              padding: "10px 14px",
              background: "#6366f1", color: "#fff",
              border: "none", borderRadius: 8,
              cursor: "pointer", opacity: loading || !input.trim() ? 0.5 : 1,
            }}
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

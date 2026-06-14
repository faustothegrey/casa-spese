"use client";

// Chat con un agente LLM (Claude / Codex / Antigravity) per analizzare gli investimenti.
// Il backend gira in locale via agentapi sull'ABBONAMENTO (terminale interattivo), non sulle API.
import { useCallback, useEffect, useRef, useState } from "react";

type Backend = "claude" | "codex" | "antigravity";

const BACKENDS: { id: Backend; label: string; icon: string }[] = [
  { id: "claude", label: "Claude", icon: "🟣" },
  { id: "codex", label: "Codex", icon: "🟢" },
  { id: "antigravity", label: "Antigravity", icon: "🔵" },
];

interface ChatMessage {
  id: number;
  role: "user" | "agent";
  content: string;
  time?: string;
}

export default function ConsulentePage() {
  const [backend, setBackend] = useState<Backend>("claude");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<string>("off");
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Polling della conversazione per il backend selezionato.
  const poll = useCallback(async (b: Backend) => {
    try {
      const r = await fetch(`/api/consulente/messages?backend=${b}`);
      const d = await r.json();
      if (Array.isArray(d.messages)) setMessages(d.messages);
      setStatus(typeof d.status === "string" ? d.status : "unknown");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    setMessages([]);
    setStatus("off");
    poll(backend);
    const t = setInterval(() => poll(backend), 1500);
    return () => clearInterval(t);
  }, [backend, poll]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    setInput("");
    // Bolla utente ottimistica (il polling poi la sostituisce con quella reale).
    setMessages((m) => [...m, { id: -Date.now(), role: "user", content: text }]);
    try {
      const r = await fetch("/api/consulente/message", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ backend, content: text }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Errore invio");
      poll(backend);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore invio");
    } finally {
      setSending(false);
    }
  };

  const reset = async () => {
    await fetch("/api/consulente/reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ backend }),
    });
    setMessages([]);
    setStatus("off");
  };

  const busy = sending || status === "running" || status === "starting";

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="px-4 md:px-8 pt-4 md:pt-8 pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Consulente investimenti</h1>
            <p className="text-sm text-gray-500">
              chat con un agente LLM in locale · sull&apos;abbonamento, non sulle API
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-white border border-gray-200 rounded-lg p-1 shadow-3xs">
              {BACKENDS.map((b) => (
                <button
                  key={b.id}
                  onClick={() => setBackend(b.id)}
                  className={`text-sm font-medium rounded-md px-3 py-1.5 transition-all cursor-pointer ${
                    backend === b.id
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <span className="mr-1">{b.icon}</span>
                  {b.label}
                </button>
              ))}
            </div>
            <button
              onClick={reset}
              className="text-sm font-medium bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-600 hover:bg-gray-50 hover:border-gray-300 active:scale-[0.98] transition-all cursor-pointer shadow-3xs"
              title="Termina la conversazione e riparti pulito"
            >
              ↺ Reset
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-1">
          stato: <span className="font-mono">{status}</span>
        </p>
      </div>

      {/* Messaggi */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 md:px-8 pb-4">
        <div className="max-w-3xl mx-auto flex flex-col gap-3">
          {messages.length === 0 && (
            <div className="text-center text-gray-400 text-sm mt-16">
              Fai una domanda sui tuoi investimenti — il primo messaggio carica automaticamente
              il tuo patrimonio e le note del Vault come contesto.
            </div>
          )}
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`rounded-2xl px-4 py-2.5 max-w-[85%] whitespace-pre-wrap text-sm leading-relaxed shadow-3xs ${
                  m.role === "user"
                    ? "bg-blue-600 text-white rounded-br-md"
                    : "bg-white border border-gray-100 text-gray-800 rounded-bl-md"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-md px-4 py-2.5 bg-white border border-gray-100 text-gray-400 text-sm shadow-3xs">
                {status === "starting" ? "avvio dell'agente…" : "sta scrivendo…"}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 bg-white px-4 md:px-8 py-3">
        <div className="max-w-3xl mx-auto">
          {error && <p className="text-xs text-rose-600 mb-2">{error}</p>}
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={1}
              placeholder={`Chiedi a ${BACKENDS.find((b) => b.id === backend)?.label}…`}
              className="flex-1 resize-none rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-hidden focus:border-gray-300 focus:shadow-3xs transition-all max-h-40"
            />
            <button
              onClick={send}
              disabled={busy || !input.trim()}
              className="text-sm font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl px-5 py-2.5 hover:from-blue-700 hover:to-indigo-700 active:scale-[0.98] transition-all disabled:opacity-40 disabled:pointer-events-none shadow-sm cursor-pointer"
            >
              Invia
            </button>
          </div>
          <p className="text-[11px] text-gray-400 mt-1.5">
            Invio per inviare · Shift+Invio per andare a capo. I dati restano in locale e vengono
            inviati solo al provider del backend scelto, sul tuo abbonamento.
          </p>
        </div>
      </div>
    </div>
  );
}

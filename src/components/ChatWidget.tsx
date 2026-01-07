import { useState, useRef, useEffect, useMemo } from "react";
import { ChatClient, ApiError } from "../api/ChatClient";

type Props = {
    apiUrl: string;
    configCode: string;
    /** Optional initial AI message (rendered once on mount) */
    initialMessage?: string;
    /** Optional initial followups associated with initialMessage */
    initialFollowups?: string[];
};

export function ChatWidget({ apiUrl, configCode, initialMessage, initialFollowups }: Props) {
    const [messages, setMessages] = useState<
        { role: "user" | "ai"; text: string; intro?: boolean }[]
    >([]);
    const [followups, setFollowups] = useState<string[]>([]);

    const [scopeId, setScopeId] = useState<string | undefined>();
    const client = useMemo(() => new ChatClient(apiUrl), [apiUrl]);
    const messagesRef = useRef<HTMLDivElement | null>(null);
    const [userNearBottom, setUserNearBottom] = useState(true);
    const [isTyping, setIsTyping] = useState(false);
    const [rateLimitMessage, setRateLimitMessage] = useState<string | null>(null);
    const didInitialScrollRef = useRef(false);

    const send = async (text: string) => {
        setMessages((m) => [...m, { role: "user", text }]);

        setIsTyping(true);
        try {
            const res = await client.send({
                message: text,
                configCode,
                scopeId,
            });

            setScopeId(res.scopeId);
            setMessages((m) => [...m, { role: "ai", text: res.reply }]);
            setFollowups(res.followups ?? []);
            setTimeout(() => requestAnimationFrame(() => scrollToBottom(true)), 0);
        } catch (err: unknown) {
            if (err instanceof ApiError) {
                if (err.status === 429) {
                    setRateLimitMessage(err.body || err.message || "Rate limit exceeded for this configuration.");
                } else {
                    setRateLimitMessage(err.body || err.message || `Server error (${err.status})`);
                }
            } else if (err instanceof Error) {
                setRateLimitMessage(err.message || "Chat request failed.");
            } else {
                setRateLimitMessage(String(err) || "Chat request failed.");
            }
        } finally {
            setIsTyping(false);
        }
    };

    const scrollToBottom = (smooth = true) => {
        const el = messagesRef.current;
        if (!el) return;
        try {
            const inner = el.firstElementChild as HTMLElement | null;
            const last = inner?.lastElementChild as HTMLElement | null;
            if (last && typeof last.scrollIntoView === "function") {
                last.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "end" });
                return;
            }
        } catch {
            // fall back to scrolling container
        }

        try {
            el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
        } catch {
            el.scrollTop = el.scrollHeight;
        }
    };

    useEffect(() => {
        if (userNearBottom) scrollToBottom(true);
    }, [messages, userNearBottom]);

    useEffect(() => {
        if (didInitialScrollRef.current) return;
        if (messages.length === 0) return;
        const id = setTimeout(() => {
            scrollToBottom(false);
            didInitialScrollRef.current = true;
        }, 0);
        return () => clearTimeout(id);
    }, [messages]);

    const handleScroll = () => {
        const el = messagesRef.current;
        if (!el) return;
        const threshold = 100;
        const isNear = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
        setUserNearBottom(isNear);
    };

    const handleFollowupClick = (text: string) => {
        setFollowups([]);
        void send(text);
    };

    // mount: show optional initial message and initial followups
    useEffect(() => {
        let mounted = true;

        const apply = (msg?: string, fups?: string[]) => {
            if (!mounted) return;
            if (msg) {
                setMessages((m) => {
                    if (m.length === 0) return [{ role: "ai", text: msg, intro: true }];
                    return m;
                });
            }
            if (fups) setFollowups(fups);
        };

        if (initialMessage) {
            apply(initialMessage, initialFollowups ?? []);
        } else {
            // fetch defaults from server for this config
            (async () => {
                try {
                    const cfg = await client.getConfig(configCode);
                    apply(cfg.initialMessage, cfg.followups ?? []);
                } catch {
                    // ignore errors — widget can operate without intro
                }
            })();
        }

        return () => {
            mounted = false;
        };
    }, [client, configCode, initialMessage, initialFollowups]);

    useEffect(() => {
        const id = setTimeout(() => scrollToBottom(false), 0);
        return () => clearTimeout(id);
    }, []);

    // Simple formatter: escapes HTML then converts **bold**, paragraphs, and basic lists
    const escapeHtml = (unsafe: string) =>
        unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");

    const formatMessageToHtml = (text: string) => {
        if (!text) return "";
        // Normalize line endings
        const raw = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
        const blocks = raw.split(/\n\n+/);
        const out: string[] = [];

        for (const block of blocks) {
            // detect pattern like: "1. Heading: - item - item" (single-line numbered section with dash-separated items)
            const numberedWithDashes = block.match(/^\s*(\d+\.\s*[^:]+):\s*(.+)$/s);
            if (numberedWithDashes) {
                const rawHeading = numberedWithDashes[1].trim();
                const rest = numberedWithDashes[2].trim();
                // preserve numeric prefix (e.g. "1. ") but strip surrounding ** from the heading text
                const prefixMatch = rawHeading.match(/^(\d+\.\s*)/);
                const numericPrefix = prefixMatch ? prefixMatch[1] : "";
                const headingText = rawHeading.replace(/^(\d+\.\s*)/, "");
                const strippedHeading = headingText.replace(/^\*\*(.*)\*\*$/, "$1");
                const items = rest
                    .split(/\s*-\s+/)
                    .map((s) => s.trim())
                    .filter(Boolean)
                    .map((it) => `<li>${escapeHtml(it).replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")}</li>`)
                    .join("");
                out.push(`<p><strong>${escapeHtml(numericPrefix + strippedHeading)}</strong></p>`);
                out.push(`<ul>${items}</ul>`);
                continue;
            }

            const lines = block.split(/\n/).map((l) => l.trim());
            // list detection: all lines start with '-' or digit + '.'
            const isUnordered = lines.every((l) => l.startsWith("- "));
            const isOrdered = lines.every((l) => /^\d+\.\s+/.test(l));
            if (isUnordered) {
                const items = lines
                    .map((l) => {
                        const content = escapeHtml(l.replace(/^-\s+/, ""));
                        return `<li>${content.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")}</li>`;
                    })
                    .join("");
                out.push(`<ul>${items}</ul>`);
                continue;
            }
            if (isOrdered) {
                const items = lines
                    .map((l) => {
                        const content = escapeHtml(l.replace(/^\d+\.\s+/, ""));
                        return `<li>${content.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")}</li>`;
                    })
                    .join("");
                out.push(`<ol>${items}</ol>`);
                continue;
            }

            // otherwise paragraph with bold handling
            const paragraph = escapeHtml(block).replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
            // preserve single newlines as <br>
            out.push(`<p>${paragraph.replace(/\n/g, "<br>")}</p>`);
        }

        return out.join("");
    };

    return (
        <div className="velior-ai-chat h-full w-full flex flex-col p-3 bg-transparent text-neutral-900 dark:text-neutral-100">
            {/* Messages */}
            <div
                ref={messagesRef}
                onScroll={handleScroll}
                className="
    flex-1 overflow-y-auto
    flex flex-col gap-4 mb-3 min-h-0
    pr-3
  "
            >

                <div className="flex flex-col mt-auto gap-4">

                    {messages.map((m, i) => (
                        <div
                            key={i}
                            className={[
                                "px-4 py-2 rounded-2xl max-w-[80%] break-words text-sm leading-relaxed",
                                m.role === "user"
                                    ? "ml-auto bg-blue-600 text-white"
                                    : "mr-auto bg-neutral-200 dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100",
                            ].join(" ")}
                        >
                            {m.role === "ai" ? (
                                <div
                                    className="prose prose-sm dark:prose-invert max-w-none"
                                    dangerouslySetInnerHTML={{ __html: formatMessageToHtml(m.text) }}
                                />
                            ) : (
                                <div>{m.text}</div>
                            )}
                        </div>
                    ))}

                    {/* Typing indicator */}
                    {isTyping && (
                        <div className="mr-auto px-4 py-2 rounded-2xl bg-neutral-200 dark:bg-neutral-800">
                            <TypingIndicator />
                        </div>
                    )}

                    {/* Follow-ups */}
                    {followups.length > 0 && !isTyping && (
                        <div className="mr-auto">
                            <div className="flex flex-wrap gap-2">
                                {followups.map((f, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => handleFollowupClick(f)}
                                        className="
                    text-xs px-3 py-1.5 rounded-full
                    border border-neutral-300 dark:border-neutral-700
                    bg-white dark:bg-neutral-900
                    text-neutral-700 dark:text-neutral-300
                    hover:bg-neutral-100 dark:hover:bg-neutral-800
                    transition
                  "
                                    >
                                        {f}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                </div>
            </div>

            {/* Rate limit / error */}
            {rateLimitMessage && (
                <div className="mb-3 px-3 py-2 rounded-lg bg-red-600 text-white flex items-start justify-between gap-3">
                    <div className="text-sm">{rateLimitMessage}</div>
                    <button
                        className="text-white/90 text-sm underline"
                        onClick={() => setRateLimitMessage(null)}
                    >
                        Dismiss
                    </button>
                </div>
            )}

            {/* Input */}
            <div className="flex-none">
                <input
                    className="
          w-full px-4 py-2 rounded-full text-sm
          border border-neutral-300 dark:border-neutral-700
          bg-white dark:bg-neutral-900
          text-neutral-900 dark:text-neutral-100
          placeholder-neutral-400
          focus:outline-none focus:ring-2 focus:ring-blue-500
        "
                    placeholder="Napište svou zprávu…"
                    disabled={isTyping || !!rateLimitMessage}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && e.currentTarget.value && !isTyping) {
                            send(e.currentTarget.value);
                            e.currentTarget.value = "";
                        }
                    }}
                />
            </div>
        </div>
    );

}
function TypingIndicator() {
    return (
        <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-neutral-500 animate-bounce [animation-delay:-0.3s]" />
            <span className="w-2 h-2 rounded-full bg-neutral-500 animate-bounce [animation-delay:-0.15s]" />
            <span className="w-2 h-2 rounded-full bg-neutral-500 animate-bounce" />
        </div>
    );
}


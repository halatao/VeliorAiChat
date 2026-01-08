import { createRoot } from "react-dom/client";
import { ChatWidget } from "./components/ChatWidget";
import "./index.css";

type InitOptions = {
    elementId: string;
    apiUrl: string;
    configCode: string;
    chatType?: "embed" | "popup";
};

declare global {
    interface Window {
        VeliorAiChat: {
            init: (opts: InitOptions) => void;
        };
    }
}

// Track mounted hosts to avoid double-mounting
const mountedHosts = new WeakSet<HTMLElement>();

/* ================================
   POPUP MOUNT
================================ */
function createPopupMount(apiUrl: string, configCode: string) {
    /* --- Popup panel --- */
    const panel = document.createElement("div");
    Object.assign(panel.style, {
        position: "fixed",
        right: "20px",
        bottom: "20px",
        width: "360px",
        height: "520px",
        maxWidth: "calc(100vw - 32px)",
        maxHeight: "calc(100vh - 120px)",
        borderRadius: "16px",
        overflow: "hidden",
        display: "none",
        zIndex: "2147483000",
    } as CSSStyleDeclaration);

    panel.className = `
    velior-ai-popup
    bg-white dark:bg-neutral-900
    border border-neutral-200 dark:border-neutral-800
    shadow-2xl
  `;

    // Respect system dark mode by default
    if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
        panel.classList.add("dark");
    }

    /* --- Header --- */
    const header = document.createElement("div");
    header.className = `
    h-12 px-4 flex items-center justify-end
    bg-neutral-50 dark:bg-neutral-900
    border-b border-neutral-200 dark:border-neutral-800
  `;

    const closeBtn = document.createElement("button");
    closeBtn.innerText = "✕";
    closeBtn.className = `
  w-9 h-9
  flex items-center justify-center
  rounded-full
  text-neutral-500
  hover:text-neutral-900
  hover:bg-neutral-200
  dark:text-neutral-400
  dark:hover:text-white
  dark:hover:bg-neutral-800
  transition
`;

    header.appendChild(closeBtn);

    /* --- React host --- */
    const host = document.createElement("div");
    host.style.height = "calc(100% - 48px)";

    panel.appendChild(header);
    panel.appendChild(host);
    document.body.appendChild(panel);

    /* --- Launcher button --- */
    const button = document.createElement("button");
    button.setAttribute("aria-label", "Open chat");
    Object.assign(button.style, {
        position: "fixed",
        right: "20px",
        bottom: "20px",
        width: "56px",
        height: "56px",
        borderRadius: "999px",
        border: "none",
        cursor: "pointer",
        zIndex: "2147483001",
    } as CSSStyleDeclaration);

    button.className = `
    bg-blue-600 hover:bg-blue-700
    text-white shadow-xl
    flex items-center justify-center
  `;

    button.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
      class="w-5 h-5 fill-current">
      <path d="M12 3C7 3 3 6.58 3 11c0 2.05.88 3.92 2.33 5.35L5 21l4.7-1.26C11.05 20 11.52 20 12 20c5 0 9-3.58 9-8s-4-9-9-9z"/>
    </svg>
  `;
    document.body.appendChild(button);

    /* --- Mount React --- */
    tryInjectCssForBundle();
    const root = createRoot(host);
    root.render(<ChatWidget apiUrl={apiUrl} configCode={configCode} />);

    /* --- Open / close logic --- */
    let opened = false;
    const openPanel = () => {
        panel.style.display = "block";
        button.style.display = "none";
        opened = true;
    };
    const closePanel = () => {
        panel.style.display = "none";
        button.style.display = "flex";
        opened = false;
    };

    button.addEventListener("click", () => !opened && openPanel());
    closeBtn.addEventListener("click", closePanel);
}

/* ================================
   PUBLIC API
================================ */
window.VeliorAiChat = {
    init({ elementId, apiUrl, configCode, chatType = "embed" }: InitOptions) {
        if (chatType === "popup") {
            try {
                createPopupMount(apiUrl, configCode);
            } catch (e) {
                console.error("VeliorAiChat popup init failed", e);
            }
            return;
        }

        const el = document.getElementById(elementId);
        if (!el) {
            console.error("VeliorAiChat: element not found");
            return;
        }

        if (mountedHosts.has(el)) return;
        mountedHosts.add(el);

        tryInjectCssForBundle();
        createRoot(el).render(
            <ChatWidget apiUrl={apiUrl} configCode={configCode} />
        );
    },
};

/* ================================
   AUTO INIT
================================ */
function autoInitFromDom() {
    try {
        const host =
            document.getElementById("velior-ai-chat") ||
            document.querySelector(".velior-ai-chat");

        if (!host) return;
        if (mountedHosts.has(host as HTMLElement)) return;

        const apiUrl =
            (host as HTMLElement).getAttribute("data-api-url");

        if (!apiUrl) {
            console.error("VeliorAiChat: data-api-url is required");
            return;
        }

        const configCode =
            (host as HTMLElement).getAttribute("data-config-code");

        if (!configCode) {
            console.error("VeliorAiChat: data-config-code is required");
            return;
        }

        const chatType =
            ((host as HTMLElement).getAttribute("data-chat-type") as
                | "embed"
                | "popup") || "embed";

        mountedHosts.add(host as HTMLElement);
        tryInjectCssForBundle();

        if (chatType === "popup") {
            createPopupMount(apiUrl, configCode);
        } else {
            createRoot(host as HTMLElement).render(
                <ChatWidget apiUrl={apiUrl} configCode={configCode} />
            );
        }
    } catch (e) {
        console.error("VeliorAiChat auto-init failed", e);
    }
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoInitFromDom);
} else {
    autoInitFromDom();
}

/* ================================
   CSS INJECTION
================================ */
function tryInjectCssForBundle() {
    try {
        if (document.querySelector("link[data-velior-css]")) return;

        const current = document.currentScript as HTMLScriptElement | null;
        let scriptSrc = current?.src ?? null;

        if (!scriptSrc) {
            const scripts = Array.from(document.getElementsByTagName("script"));
            const candidate = scripts.find((s) =>
                /velior-ai-chat(\.iife|)\.js$/.test(s.src)
            );
            scriptSrc = candidate?.src ?? null;
        }

        if (!scriptSrc) return;

        const url = new URL(scriptSrc, location.href);
        const base = url.pathname.substring(0, url.pathname.lastIndexOf("/"));
        url.pathname = base.endsWith("/dist")
            ? `${base}/velior-ai-chat.css`
            : `${base}/dist/velior-ai-chat.css`;

        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = url.toString();
        link.setAttribute("data-velior-css", "1");
        link.onerror = () => link.remove();

        document.head.appendChild(link);
    } catch {
        /* ignore */
    }
}

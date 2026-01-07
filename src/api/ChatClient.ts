export interface ChatRequest {
  message: string;
  configCode: string;
  scopeId?: string;
}

export interface ChatResponse {
  reply: string;
  scopeId: string;
  followups?: string[];
}

export class ChatClient {
  private apiUrl: string;

  constructor(apiUrl: string) {
    this.apiUrl = apiUrl;
  }

  async getConfig(configCode: string): Promise<{ initialMessage?: string; followups?: string[] }> {
    const code = encodeURIComponent(configCode || "DEFAULT");
    const res = await fetch(`${this.apiUrl}/api/ai/chat/config/${code}`);
    if (!res.ok) {
      // return empty defaults on error
      return {};
    }
    return res.json().catch(() => ({}));
  }

  async send(req: ChatRequest): Promise<ChatResponse> {
    const res = await fetch(`${this.apiUrl}/api/ai/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });

    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      const message = bodyText || res.statusText || "Chat request failed";
      throw new ApiError(message, res.status, bodyText);
    }

    return res.json();
  }
}

export class ApiError extends Error {
  status: number;
  body: string;
  constructor(message: string, status: number, body: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

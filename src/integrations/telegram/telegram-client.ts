export interface TelegramClientOptions {
  /** `https://api.telegram.org`, or the mock in tests. */
  baseUrl: string;
  botToken: string;
  chatId: string;
  timeoutMs: number;
  /** Injectable for tests. */
  fetch?: (request: Request) => Promise<Response>;
}

export class TelegramClient {
  private readonly fetch: (request: Request) => Promise<Response>;

  constructor(private readonly options: TelegramClientOptions) {
    this.fetch = options.fetch ?? (request => fetch(request));
  }

  /** Sends an HTML-formatted message to the configured chat. Throws when Telegram refuses it. */
  async sendHtml(text: string): Promise<void> {
    const { baseUrl, botToken, chatId, timeoutMs } = this.options;
    const response = await this.fetch(new Request(`${baseUrl}/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
      signal: AbortSignal.timeout(timeoutMs),
    }));
    if (!response.ok) throw new Error(`Telegram sendMessage failed with ${response.status}: ${await response.text()}`);
  }
}

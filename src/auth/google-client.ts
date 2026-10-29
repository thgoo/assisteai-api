import { z } from 'zod';

const googleUserSchema = z.object({
  sub: z.string().min(1),
  email: z.email(),
  name: z.string().min(1),
  picture: z.url().optional(),
});

export type GoogleUser = z.infer<typeof googleUserSchema>;

export interface GoogleClientOptions {
  /** `https://www.googleapis.com`, or the mock in tests. */
  baseUrl: string;
  timeoutMs: number;
}

export class GoogleClient {
  constructor(private readonly options: GoogleClientOptions) {}

  /**
   * The profile behind an OAuth access token (the frontend gets one from Google Sign-In), or `undefined` when Google
   * rejects the token. Network failures and Google errors throw.
   */
  async userInfo(accessToken: string): Promise<GoogleUser | undefined> {
    const response = await fetch(`${this.options.baseUrl}/oauth2/v3/userinfo`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(this.options.timeoutMs),
    });
    if (response.status >= 400 && response.status < 500) return undefined;
    if (!response.ok) throw new Error(`Google userinfo failed with ${response.status}`);

    return googleUserSchema.parse(await response.json());
  }
}

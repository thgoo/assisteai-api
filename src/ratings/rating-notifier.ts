import type { RatingKey } from '~/domain/ratings';
import type { TelegramClient } from '~/integrations/telegram/telegram-client';
import type { Logger } from '~/logger';

export interface NewRating {
  movie: { id: number; slug: string; originalTitle: string; year: number | null; description: string };
  rating: RatingKey;
  comment: string | null;
  userName: string;
}

export interface RatingNotifier {
  /** Fire-and-forget: never throws, never delays the caller. */
  notify(rating: NewRating): void;
}

/** The labels the Telegram channel reads (the frontend has its own copy for the site). */
const LABELS: Record<RatingKey, string> = {
  STAY_AWAY: 'Fique Longe',
  VERY_BAD: 'Muito Ruim',
  BAD: 'Ruinzinho',
  COOL: 'Legal',
  GOOD: 'Bom',
  VERY_GOOD: 'Muito Bom',
  UNMISSABLE: 'Imperdível',
};

const EXCERPT_LENGTH = 180;

/** Posts each new rating to the Telegram channel. Failures are logged and otherwise ignored. */
export class TelegramRatingNotifier implements RatingNotifier {
  constructor(
    private readonly telegram: TelegramClient,
    private readonly frontendUrl: string,
    private readonly logger: Logger,
  ) {}

  notify(rating: NewRating): void {
    this.telegram.sendHtml(ratingMessage(rating, this.frontendUrl)).catch((error: unknown) => {
      this.logger.warn('Telegram notification failed', { movieId: rating.movie.id, error });
    });
  }
}

/** For environments without a Telegram bot (development, tests that don't care). */
export class NoopRatingNotifier implements RatingNotifier {
  notify(): void {
    // Nothing to notify.
  }
}

export function ratingMessage({ movie, rating, comment, userName }: NewRating, frontendUrl: string): string {
  const link = `${frontendUrl}/movies/${movie.id}-${movie.slug}`;
  const title = movie.year === null ? movie.originalTitle : `${movie.originalTitle} (${movie.year})`;
  const excerpt = comment ?? excerptOf(movie.description);
  return [
    `<a href="${escapeHtml(link)}">${escapeHtml(title)}</a>`,
    ...(excerpt === '' ? [] : [`<i>${escapeHtml(excerpt)}</i>`]),
    `<b>${LABELS[rating]}</b> - ${escapeHtml(userName)}`,
  ].join('\n\n');
}

function excerptOf(description: string): string {
  if (description.length <= EXCERPT_LENGTH) return description;
  return `${description.slice(0, EXCERPT_LENGTH).replace(/[\s.,;:\-/\\]+$/, '')}...`;
}

/** Telegram's HTML mode only needs these escaped. */
function escapeHtml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

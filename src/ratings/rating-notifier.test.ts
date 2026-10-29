import { describe, expect, mock, test } from 'bun:test';
import type { NewRating } from './rating-notifier';
import type { TelegramClient } from '~/integrations/telegram/telegram-client';
import type { Logger } from '~/logger';
import { ratingMessage, TelegramRatingNotifier } from './rating-notifier';

const FRONT = 'https://assisteai.com.br';

const rating: NewRating = {
  movie: { id: 1, slug: 'the-matrix', originalTitle: 'The Matrix', year: 1999, description: 'Um hacker descobre…' },
  rating: 'UNMISSABLE',
  comment: 'Clássico.',
  userName: 'Ana Souza',
};

describe('ratingMessage', () => {
  test('title link, comment and label', () => {
    expect(ratingMessage(rating, FRONT)).toBe(
      '<a href="https://assisteai.com.br/movies/1-the-matrix">The Matrix (1999)</a>\n\n'
      + '<i>Clássico.</i>\n\n<b>Imperdível</b> - Ana Souza',
    );
  });

  test('escapes everything user- or TMDb-provided', () => {
    const message = ratingMessage({
      ...rating,
      movie: { ...rating.movie, originalTitle: 'Tom & Jerry <3' },
      comment: '<b>"bold"</b>',
      userName: 'A & B',
    }, FRONT);

    expect(message).toContain('Tom &amp; Jerry &lt;3');
    expect(message).toContain('<i>&lt;b&gt;&quot;bold&quot;&lt;/b&gt;</i>');
    expect(message).toContain('- A &amp; B');
  });

  test('without a comment: the description, cut to 180 characters', () => {
    const description = `${'a'.repeat(178)}, and more`;
    const message = ratingMessage({ ...rating, comment: null, movie: { ...rating.movie, description } }, FRONT);

    expect(message).toContain(`<i>${'a'.repeat(178)}...</i>`);
  });

  test('without a year or any text', () => {
    const message = ratingMessage({
      ...rating, comment: null, movie: { ...rating.movie, year: null, description: '' },
    }, FRONT);

    expect(message).toBe('<a href="https://assisteai.com.br/movies/1-the-matrix">The Matrix</a>\n\n'
      + '<b>Imperdível</b> - Ana Souza');
  });
});

describe('TelegramRatingNotifier', () => {
  test('a Telegram failure is logged, never thrown', async () => {
    const warn = mock();
    const logger = { debug: mock(), info: mock(), warn, error: mock(), child: () => logger } as Logger;
    const telegram = { sendHtml: () => Promise.reject(new Error('down')) } as unknown as TelegramClient;

    new TelegramRatingNotifier(telegram, FRONT, logger).notify(rating);
    await Bun.sleep(0);

    expect(warn).toHaveBeenCalledWith('Telegram notification failed', { movieId: 1, error: new Error('down') });
  });
});

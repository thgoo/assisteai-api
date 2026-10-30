-- Genres are TMDb's en-US names, as new titles store them. Older titles were stored with the pt-BR names: rename those
-- (keeping each title's order and dropping a duplicate the rename creates). "Estrangeiro" was TMDb's retired "Foreign".
UPDATE movies
SET genres = (
  SELECT array_agg(name ORDER BY first_position)
  FROM (
    SELECT coalesce(english.name, genre) AS name, min(position) AS first_position
    FROM unnest(movies.genres) WITH ORDINALITY AS listed(genre, position)
    LEFT JOIN (VALUES
      ('Ação', 'Action'),
      ('Ação & Aventura', 'Action & Adventure'),
      ('Animação', 'Animation'),
      ('Aventura', 'Adventure'),
      ('Cinema TV', 'TV Movie'),
      ('Comédia', 'Comedy'),
      ('Documentário', 'Documentary'),
      ('Estrangeiro', 'Foreign'),
      ('Família', 'Family'),
      ('Fantasia', 'Fantasy'),
      ('Faroeste', 'Western'),
      ('Ficção científica', 'Science Fiction'),
      ('Guerra', 'War'),
      ('História', 'History'),
      ('Mistério', 'Mystery'),
      ('Música', 'Music'),
      ('Sci-Fi & Fantasia', 'Sci-Fi & Fantasy'),
      ('Terror', 'Horror')
    ) AS english(portuguese, name) ON english.portuguese = listed.genre
    GROUP BY 1
  ) AS renamed
)
WHERE genres && ARRAY[
  'Ação', 'Ação & Aventura', 'Animação', 'Aventura', 'Cinema TV', 'Comédia', 'Documentário', 'Estrangeiro', 'Família',
  'Fantasia', 'Faroeste', 'Ficção científica', 'Guerra', 'História', 'Mistério', 'Música', 'Sci-Fi & Fantasia', 'Terror'
];

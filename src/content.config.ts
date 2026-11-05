import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const blog = defineCollection({
  loader: glob({ base: './src/content/blog', pattern: '**/*.{md,mdx}' }),
  schema: ({ image }) =>
    z
      .object({
        title: z.string(),
        lang: z
          .string()
          .refine((value) => {
            try {
              return Intl.getCanonicalLocales(value).length === 1;
            } catch {
              return false;
            }
          }, 'lang must be a valid BCP 47 language tag')
          .default('en'),
        description: z.string().max(160),
        pubDate: z.coerce.date(),
        updatedDate: z.coerce.date().optional(),
        heroImage: image().optional(),
        heroAlt: z.string().optional(),
        tags: z.array(z.string()).default([]),
        draft: z.boolean().default(false),
      })
      .refine((d) => !d.heroImage || d.heroAlt, {
        message: 'heroAlt is required when heroImage is set',
        path: ['heroAlt'],
      }),
});

export const collections = { blog };

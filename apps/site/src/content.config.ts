import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';

const legalCollection = defineCollection({
  schema: z.object({
    title: z.string(),
    updated: z.string(),
  }),
});

export const collections = {
  legal: legalCollection,
};

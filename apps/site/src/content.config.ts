import { defineCollection, z } from 'astro:content';

const legalCollection = defineCollection({
  schema: z.object({
    title: z.string(),
    updated: z.string(),
  }),
});

export const collections = {
  legal: legalCollection,
};

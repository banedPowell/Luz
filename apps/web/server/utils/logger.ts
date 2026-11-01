import { consola } from 'consola';

// Nuxt and Nitro log through consola too, so Luz lines share their format on stdout
export const logger = consola.withTag('luz');

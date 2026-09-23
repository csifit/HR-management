import { z } from "zod";
export const mailConfigSchema = z.object({
  host: z.string().regex(/^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$/i),
  port: z.coerce.number().refine((v) => v === 465 || v === 587),
  user: z.email(),
  password: z.string().min(1),
  from: z.email(),
});

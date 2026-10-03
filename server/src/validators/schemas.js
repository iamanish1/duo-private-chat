import { z } from 'zod';

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const clientId = z.string().regex(/^[\w-]{8,64}$/, 'Invalid client id');
const optionalObjectId = z.preprocess((v) => (v === '' ? undefined : v), objectId.optional());
const emoji = z
  .string()
  .max(16)
  .regex(/^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Component}|‍|️)+$/u, 'Invalid emoji');
const optionalNumber = (max) => z.preprocess((v) => (v === '' || v == null ? undefined : v), z.coerce.number().positive().max(max).optional());
const optionalDate = z.preprocess((v) => (v === '' ? undefined : v), z.coerce.date().optional());

export const loginBody = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email('Enter a valid email address')),
  password: z.string().min(1, 'Enter your password').max(200),
});

export const idParams = z.object({ id: objectId });

export const listMessagesQuery = z
  .object({
    before: optionalObjectId,
    after: optionalObjectId,
    limit: z.coerce.number().int().min(1).max(50).optional(),
  })
  .refine((q) => !(q.before && q.after), 'Use either before or after');

export const sendMessageBody = z.object({
  text: z.string().max(4000, 'Messages can be up to 4000 characters'),
  clientId: clientId.optional(),
  replyTo: optionalObjectId,
});

export const reactionBody = z.object({ emoji: emoji.nullable() });

export const searchQuery = z.object({
  q: z.string().trim().max(100).optional(),
  type: z.enum(['text', 'image', 'video', 'audio', 'media']).optional(),
  from: optionalDate,
  to: optionalDate,
  before: optionalObjectId,
});

export const mediaListQuery = z.object({
  type: z.enum(['image', 'video']).optional(),
  before: optionalObjectId,
});

// Multipart text fields arrive as strings.
export const uploadBody = z.object({
  clientId: clientId.optional(),
  text: z.string().max(1000, 'Captions can be up to 1000 characters').optional().default(''),
  replyTo: optionalObjectId,
  width: optionalNumber(20000),
  height: optionalNumber(20000),
  duration: optionalNumber(24 * 60 * 60),
  kind: z.enum(['voice']).optional(),
  // Multipart field holding a JSON array of waveform peaks.
  waveform: z.preprocess((v) => {
    if (typeof v !== 'string' || !v) return undefined;
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
  }, z.array(z.number().int().min(0).max(100)).max(120).optional()),
});

export const pushSubscribeBody = z.object({
  endpoint: z.url({ protocol: /^https$/ }).max(1000),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(16).max(200),
    auth: z.string().min(8).max(100),
  }),
});

export const pushUnsubscribeBody = z.object({ endpoint: z.string().max(1000) });

export const updateProfileBody = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  settings: z.object({ notificationPreview: z.enum(['full', 'sender', 'hidden']).optional() }).optional(),
});

export const callsQuery = z.object({ before: optionalObjectId });

// ---- Socket payloads -------------------------------------------------------
export const socketSchemas = {
  'message:send': sendMessageBody.extend({ clientId }),
  'message:delivered': z.object({ ids: z.array(objectId).min(1).max(200) }),
  'message:read': z.object({ upTo: objectId }),
  'message:react': z.object({ id: objectId, emoji: emoji.nullable() }),
  'message:delete': z.object({ id: objectId }),
  'presence:visibility': z.object({ visible: z.boolean() }),
  'call:accept': z.object({ callId: objectId }),
  'call:reject': z.object({ callId: objectId }),
  'call:end': z.object({ callId: objectId }),
  'call:rejoin': z.object({ callId: objectId }),
  'webrtc:offer': z.object({
    callId: objectId,
    description: z.object({ type: z.literal('offer'), sdp: z.string().max(100_000) }),
  }),
  'webrtc:answer': z.object({
    callId: objectId,
    description: z.object({ type: z.literal('answer'), sdp: z.string().max(100_000) }),
  }),
  'webrtc:ice-candidate': z.object({
    callId: objectId,
    candidate: z.object({
      candidate: z.string().max(2000),
      sdpMid: z.string().max(64).nullable().optional(),
      sdpMLineIndex: z.number().int().min(0).max(64).nullable().optional(),
      usernameFragment: z.string().max(256).nullable().optional(),
    }),
  }),
  'webrtc:restart': z.object({ callId: objectId }),
};

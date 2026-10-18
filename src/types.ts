import { z } from 'zod';

/**
 * 剧本（Script）= 视频的「数据层」。
 * 只描述「讲什么」和「怎么画」，不包含任何渲染逻辑，
 * 因此同一份剧本可以被 TTS 脚本、Remotion 组件、字幕工具共同消费。
 */

// ---------- 通用 ----------

/** 场景内进度触发点：0 = 场景开始，1 = 场景结束 */
const AtSchema = z.number().min(0).max(1);

/** 语义色，由 theme.ts 映射到具体颜色 */
export const ToneSchema = z.enum(['primary', 'success', 'warning', 'muted']);
export type Tone = z.infer<typeof ToneSchema>;

/** 场景之间如何切换 */
export const TransitionSchema = z.enum(['fade', 'slide-left', 'slide-up', 'cut']);
export type Transition = z.infer<typeof TransitionSchema>;

/** 代码语言；新增语言时同步扩展这里即可 */
export const CodeLanguageSchema = z.enum([
  'typescript',
  'javascript',
  'python',
  'java',
  'cpp',
  'go',
  'rust',
  'sql',
]);
export type CodeLanguage = z.infer<typeof CodeLanguageSchema>;

/** 数组下标区间，闭区间 [from, to] */
export const IndexRangeSchema = z
  .object({
    from: z.number().int().min(0),
    to: z.number().int().min(0),
  })
  .refine((r) => r.to >= r.from, { message: 'to 必须大于等于 from' });

// ---------- 各类视觉 ----------

/** 片头 / 片尾 / 章节页 */
export const TitleVisualSchema = z.object({
  type: z.literal('title'),
  eyebrow: z.string().optional(),
  title: z.string().min(1),
  subtitle: z.string().optional(),
  tags: z.array(z.string()).default([]),
  accent: ToneSchema.default('primary'),
});

/** 要点列表；每条要点按自己的 at 依次出现 */
export const BulletsVisualSchema = z.object({
  type: z.literal('bullets'),
  heading: z.string().optional(),
  items: z
    .array(
      z.object({
        text: z.string().min(1),
        at: AtSchema.default(0),
        emphasis: z.boolean().default(false),
        tone: ToneSchema.optional(),
      }),
    )
    .min(1),
});

/** 代码讲解页；行号从 1 开始 */
export const CodeVisualSchema = z.object({
  type: z.literal('code'),
  filename: z.string().optional(),
  language: CodeLanguageSchema.default('typescript'),
  code: z.string().min(1),
  /** 常驻高亮，可同时存在多段 */
  highlights: z
    .array(
      z.object({
        lines: z.array(z.number().int().positive()).min(1),
        tone: ToneSchema.default('primary'),
        note: z.string().optional(),
      }),
    )
    .default([]),
  /** 随场景播放的高亮时间轴；同一时刻只有「最近触发」的一组生效 */
  focus: z
    .array(
      z.object({
        at: AtSchema,
        lines: z.array(z.number().int().positive()).min(1),
        tone: ToneSchema.default('primary'),
        note: z.string().optional(),
      }),
    )
    .default([]),
});

/** 数组动画页 */
export const PointerSchema = z.object({
  /** 指针标识，用于在 moves 中引用 */
  id: z.string().min(1),
  index: z.number().int().min(0),
  label: z.string().optional(),
  tone: ToneSchema.default('primary'),
});

export const ArrayMoveSchema = z.object({
  at: AtSchema,
  /** 指向 PointerSchema.id */
  pointer: z.string().min(1),
  to: z.number().int().min(0),
  /** 移动动画时长（秒） */
  duration: z.number().positive().default(0.4),
});

export const ArrayVisualSchema = z.object({
  type: z.literal('array'),
  values: z.array(z.union([z.number(), z.string()])).min(1),
  showIndices: z.boolean().default(true),
  caption: z.string().optional(),
  /** 高亮区间；at 控制何时亮起 */
  highlights: z
    .array(
      IndexRangeSchema.and(
        z.object({
          tone: ToneSchema.default('primary'),
          at: AtSchema.default(0),
        }),
      ),
    )
    .default([]),
  pointers: z.array(PointerSchema).default([]),
  /** 指针移动时间轴 */
  moves: z.array(ArrayMoveSchema).default([]),
});

/** 哈希表演示页 */
export const HashTableVisualSchema = z.object({
  type: z.literal('hash-table'),
  title: z.string().default('哈希表'),
  /** 当前步骤的文字说明，例如「i = 0 · x = 2 · need = 7」 */
  caption: z.string().optional(),
  entries: z
    .array(
      z.object({
        key: z.string().min(1),
        value: z.string(),
        tone: ToneSchema.default('muted'),
        /** 该行何时出现 */
        at: AtSchema.default(0),
      }),
    )
    .default([]),
  /** 被命中的 key，渲染时高亮 */
  highlightKeys: z.array(z.string()).default([]),
});

/** 复杂度总结页 */
export const ComplexityVisualSchema = z.object({
  type: z.literal('complexity'),
  heading: z.string().default('复杂度'),
  rows: z
    .array(
      z.object({
        label: z.string().min(1),
        value: z.string().min(1),
        note: z.string().optional(),
        emphasis: z.boolean().default(false),
      }),
    )
    .min(1),
});

/** 所有视觉类型的联合；新增视觉时在这里挂载 */
export const VisualSchema = z.discriminatedUnion('type', [
  TitleVisualSchema,
  BulletsVisualSchema,
  CodeVisualSchema,
  ArrayVisualSchema,
  HashTableVisualSchema,
  ComplexityVisualSchema,
]);
export type Visual = z.infer<typeof VisualSchema>;
export type SceneType = Visual['type'];

// ---------- 场景与剧本 ----------

export const SceneSchema = z.object({
  /** 全局唯一，同时用作音频文件名，例如 "01-intro" */
  id: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, '场景 id 只能包含小写字母、数字和连字符'),
  /** 旁白文本，逐字送 TTS；建议一段一个语义单元 */
  narration: z.string().min(1),
  /** 本场景的视觉与动画指令 */
  visual: VisualSchema,
  transition: TransitionSchema.default('fade'),
  /** 语音播完后的静默留白（秒），用于呼吸感 */
  holdSeconds: z.number().min(0).default(0.4),
});

export const ScriptSchema = z
  .array(SceneSchema)
  .min(1, '剧本至少需要一个场景')
  .refine(
    (scenes) => new Set(scenes.map((s) => s.id)).size === scenes.length,
    { message: '场景 id 必须唯一（否则音频文件会互相覆盖）' },
  );

export type Scene = z.infer<typeof SceneSchema>;
export type SceneInput = z.input<typeof SceneSchema>;
export type Script = z.infer<typeof ScriptSchema>;
export type ScriptInput = z.input<typeof ScriptSchema>;

/**
 * 定义剧本：负责校验并补齐默认值。
 * 内容作者只需关心「讲什么」和「怎么画」，默认值由 schema 统一提供。
 */
export const defineScript = (input: ScriptInput): Script =>
  ScriptSchema.parse(input);

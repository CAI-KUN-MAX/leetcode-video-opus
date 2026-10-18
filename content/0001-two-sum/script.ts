import { defineScript } from '../../src/types';

/**
 * LeetCode 1. 两数之和
 * 成片结构：片头 → 题目 → 示例 → 暴力法 → 双指针（含局限）→ 哈希表思路与演示 → 代码 → 复杂度 → 片尾
 */
export const script = defineScript([
  // ---------- 片头 ----------
  {
    id: 'intro',
    narration:
      '大家好，欢迎来到 LeetCode 题解系列。今天我们来看第一题，两数之和。这道题是很多人的第一道 LeetCode，也是面试里出现频率最高的题目之一。',
    visual: {
      type: 'title',
      eyebrow: 'LeetCode 1',
      title: '两数之和',
      subtitle: 'Two Sum',
      tags: ['数组', '哈希表', '简单'],
      accent: 'primary',
    },
    transition: 'fade',
  },

  // ---------- 题目描述 ----------
  {
    id: 'problem',
    narration:
      '先看题目。给定一个整数数组 nums 和一个目标值 target，请你找出数组中的两个数，让它们的和等于 target，然后返回这两个数的下标。题目保证每种输入只有一个答案，而且同一个元素不能重复使用。',
    visual: {
      type: 'bullets',
      heading: '题目',
      items: [
        { text: '给定整数数组 nums 与目标值 target', at: 0 },
        { text: '找出两个数，使它们的和等于 target', at: 0.15 },
        { text: '返回这两个数的下标', at: 0.45, emphasis: true },
        { text: '每种输入只对应一个答案', at: 0.7 },
        { text: '同一个元素不能重复使用', at: 0.85 },
      ],
    },
    transition: 'fade',
  },

  // ---------- 示例 ----------
  {
    id: 'example',
    narration:
      '看一个示例。数组是二、七、十一、十五，目标值是九。因为二加七等于九，所以答案是下标零和一。',
    visual: {
      type: 'array',
      values: [2, 7, 11, 15],
      showIndices: true,
      caption: 'target = 9 · nums[0] + nums[1] = 2 + 7 = 9',
      pointers: [
        { id: 'i', index: 0, label: 'i', tone: 'primary' },
        { id: 'j', index: 1, label: 'j', tone: 'primary' },
      ],
      highlights: [{ from: 0, to: 1, tone: 'success', at: 0.55 }],
    },
    transition: 'slide-left',
  },

  // ---------- 暴力法 ----------
  {
    id: 'brute-force',
    narration:
      '最直接的想法是暴力枚举。用两层循环检查每一对数，如果和等于 target 就返回。它的时间复杂度是 O(n²)，数组中有一万个数时，最坏情况下要检查接近一亿次，显然不够快。',
    visual: {
      type: 'code',
      filename: 'two-sum.ts',
      language: 'typescript',
      code: `function twoSum(nums: number[], target: number): number[] {
  for (let i = 0; i < nums.length; i++) {
    for (let j = i + 1; j < nums.length; j++) {
      if (nums[i] + nums[j] === target) {
        return [i, j];
      }
    }
  }
  return [];
}`,
      focus: [
        { at: 0, lines: [2, 3], tone: 'warning' },
        { at: 0.45, lines: [4, 5], tone: 'success' },
      ],
    },
    transition: 'fade',
  },

  // ---------- 双指针：思路 ----------
  {
    id: 'two-pointer-idea',
    narration:
      '在继续优化之前，先看一个直觉上更快的想法：双指针。因为示例数组恰好是升序的，我们可以让首尾两个指针向中间靠拢：两数之和太小，就移动左指针；和太大，就移动右指针。',
    visual: {
      type: 'array',
      values: [2, 7, 11, 15],
      showIndices: true,
      caption: 'L 指向首，R 指向尾，向中间收敛',
      pointers: [
        { id: 'L', index: 0, label: 'L', tone: 'primary' },
        { id: 'R', index: 3, label: 'R', tone: 'warning' },
      ],
    },
    transition: 'slide-left',
  },

  // ---------- 双指针：演示 ----------
  {
    id: 'two-pointer-demo',
    narration:
      '从两端开始，二加十五等于十七，比九大，右指针左移；二加十一等于十三，还是大，右指针再左移；二加七正好等于九，找到了。',
    visual: {
      type: 'array',
      values: [2, 7, 11, 15],
      showIndices: true,
      caption: '2 + 15 = 17 > 9 → R 左移 · 2 + 11 = 13 > 9 → R 左移 · 2 + 7 = 9',
      pointers: [
        { id: 'L', index: 0, label: 'L', tone: 'primary' },
        { id: 'R', index: 3, label: 'R', tone: 'warning' },
      ],
      moves: [
        { at: 0.2, pointer: 'R', to: 2, duration: 0.35 },
        { at: 0.5, pointer: 'R', to: 1, duration: 0.35 },
      ],
      highlights: [{ from: 0, to: 1, tone: 'success', at: 0.78 }],
    },
    transition: 'cut',
  },

  // ---------- 双指针的局限 ----------
  {
    id: 'two-pointer-caveat',
    narration:
      '双指针看起来很优雅，时间复杂度也是 O(n)。但它有一个前提：数组必须有序。题目给出的数组并不保证有序；就算先排序，元素原来的下标也会丢失，还得额外记录映射，反而更麻烦。所以这道题的正解是哈希表。',
    visual: {
      type: 'bullets',
      heading: '双指针的局限',
      items: [
        { text: '前提：数组必须有序', at: 0, tone: 'warning' },
        { text: '题目不保证数组有序', at: 0.2 },
        { text: '排序会打乱原始下标', at: 0.45 },
        { text: '需要额外记录下标映射', at: 0.65 },
        { text: '正解：哈希表', at: 0.85, emphasis: true, tone: 'success' },
      ],
    },
    transition: 'fade',
  },

  // ---------- 哈希表：核心思路 ----------
  {
    id: 'hash-idea',
    narration:
      '换一个角度想。与其检查每一对数字，不如对每个数 x，直接问：target 减 x 在不在数组里？只要查一个数是否存在只需要 O(1)，整体就只需要遍历一次。哈希表正好提供了这个能力。',
    visual: {
      type: 'bullets',
      heading: '核心思路',
      items: [
        { text: '对每个 x，寻找 target − x', at: 0 },
        { text: '哈希表查询是 O(1)', at: 0.25, emphasis: true },
        { text: '边遍历，边记录见过的数', at: 0.5 },
        { text: '只需一次遍历', at: 0.75, tone: 'success' },
      ],
    },
    transition: 'fade',
  },

  // ---------- 哈希表：手动演示 1 ----------
  {
    id: 'hash-walk-1',
    narration:
      '从左往右遍历。第一个数是二，需要的搭档是七。查一下哈希表，里面还是空的，七不存在，于是把二和它的下标零存进去。',
    visual: {
      type: 'hash-table',
      title: '哈希表 · 记录已见过的数',
      caption: 'i = 0 · x = 2 · need = 7 · 未命中 → 存入 2 → 0',
      entries: [{ key: '2', value: '0', tone: 'primary', at: 0.75 }],
    },
    transition: 'slide-up',
  },

  // ---------- 哈希表：手动演示 2 ----------
  {
    id: 'hash-walk-2',
    narration:
      '第二个数是七，需要的搭档是二。查表发现二已经出现过了，下标是零，所以答案就是零和一。',
    visual: {
      type: 'hash-table',
      title: '哈希表 · 记录已见过的数',
      caption: 'i = 1 · x = 7 · need = 2 · 命中 → 返回 [0, 1]',
      entries: [
        { key: '2', value: '0', tone: 'success', at: 0 },
        { key: '7', value: '1', tone: 'muted', at: 0.15 },
      ],
      highlightKeys: ['2'],
    },
    transition: 'cut',
  },

  // ---------- 代码实现 ----------
  {
    id: 'code-write',
    narration:
      '来看最终代码。我们用一个 map 记录出现过的数字和它的下标。遍历数组，对每个数先算出它需要的搭档；如果搭档已经在 map 里，说明之前见过，直接返回两个下标；否则把当前数字和下标存进 map，继续往后走。',
    visual: {
      type: 'code',
      filename: 'two-sum.ts',
      language: 'typescript',
      code: `function twoSum(nums: number[], target: number): number[] {
  const seen = new Map<number, number>();

  for (let i = 0; i < nums.length; i++) {
    const need = target - nums[i];

    if (seen.has(need)) {
      return [seen.get(need)!, i];
    }

    seen.set(nums[i], i);
  }

  return [];
}`,
      focus: [
        { at: 0, lines: [2] },
        { at: 0.22, lines: [4, 5] },
        { at: 0.45, lines: [7, 8], tone: 'success' },
        { at: 0.7, lines: [11], tone: 'warning' },
      ],
    },
    transition: 'fade',
  },

  // ---------- 用示例走一遍代码 ----------
  {
    id: 'code-trace',
    narration:
      '用刚才的例子手动跑一遍。i 等于零，数字是二，need 等于七，map 是空的，把二和下标零存进去。i 等于一，数字是七，need 等于二，map 里正好有，返回零和一。',
    visual: {
      type: 'code',
      filename: 'two-sum.ts',
      language: 'typescript',
      code: `function twoSum(nums: number[], target: number): number[] {
  const seen = new Map<number, number>();

  for (let i = 0; i < nums.length; i++) {
    const need = target - nums[i];

    if (seen.has(need)) {
      return [seen.get(need)!, i];
    }

    seen.set(nums[i], i);
  }

  return [];
}`,
      focus: [
        { at: 0, lines: [5] },
        { at: 0.2, lines: [7], tone: 'warning' },
        { at: 0.38, lines: [11] },
        { at: 0.55, lines: [5] },
        { at: 0.72, lines: [7, 8], tone: 'success' },
      ],
    },
    transition: 'cut',
  },

  // ---------- 复杂度 ----------
  {
    id: 'complexity',
    narration:
      '最后看复杂度。我们只把数组遍历一次，每次哈希表的插入和查询均摊都是 O(1)，所以总时间复杂度是 O(n)。额外的哈希表最多存 n 个元素，空间复杂度也是 O(n)。这是典型的用空间换时间。',
    visual: {
      type: 'complexity',
      heading: '复杂度分析',
      rows: [
        {
          label: '时间复杂度',
          value: 'O(n)',
          note: '一次遍历，每次哈希操作均摊 O(1)',
          emphasis: true,
        },
        {
          label: '空间复杂度',
          value: 'O(n)',
          note: '哈希表最多存放 n 个键值对',
        },
        {
          label: '对比：暴力法',
          value: 'O(n²)',
          note: '两层循环枚举所有数对',
        },
      ],
    },
    transition: 'slide-up',
  },

  // ---------- 片尾 ----------
  {
    id: 'outro',
    narration:
      '总结一下：一边遍历，一边把见过的数字记进哈希表，就能把两数之和变成一次查找。这就是哈希表最经典的用法。我们下一题见。',
    visual: {
      type: 'title',
      eyebrow: 'LeetCode 1 · 总结',
      title: '空间换时间',
      subtitle: '边遍历，边记录，一次查找',
      tags: ['O(n)', '哈希表'],
      accent: 'success',
    },
    transition: 'fade',
    holdSeconds: 1,
  },
]);

export default script;

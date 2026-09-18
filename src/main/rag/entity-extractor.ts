/**
 * 常用星穹铁道核心实体词表 (用于 RAG 切片实体打标)
 */
export const CORE_ENTITY_DICTIONARY: readonly string[] = [
  // 核心主角与星穹列车
  "流萤", "开拓者", "萨姆", "三月七", "丹恒", "姬子", "瓦尔特", "帕姆", "星穹列车", "无名客", "星核",
  // 星核猎手与格拉默
  "卡芙卡", "银狼", "刃", "艾利欧", "格拉默", "格拉默帝国", "格拉默铁骑", "火萤IV型", "AR-26710", "失熵症", "医疗舱", "反物质军团", "绝灭大君", "丰饶民", "繁育", "塔伊兹育罗斯",
  // 匹诺康尼
  "黄泉", "花火", "砂金", "知更鸟", "星期日", "黑天鹅", "加拉赫", "米沙", "钟表匠", "拉齐", "晖长石号", "黄金的时刻", "流梦礁", "筑梦边境", "稚子的梦", "白日梦酒店", "秘密基地", "橡木蛋糕卷", "苜蓿草", "家族", "同谐", "希佩", "秩序", "太一", "虚无", "IX", "欢愉", "阿哈",
  // 翁法罗斯
  "白厄", "阿格莱雅", "遐蝶", "风堇", "万敌", "那刻夏", "缇宝", "赛飞儿", "哀丽秘榭", "奥赫玛", "铁墓", "泰坦", "黄金裔", "逐火之旅", "死循环", "神权",
  // 空间站与黑塔
  "黑塔", "阮•梅", "螺丝咕姆", "斯蒂芬•劳埃德", "艾丝妲", "阿兰", "模拟宇宙", "差分宇宙",
  // 雅利洛-VI
  "布洛妮娅", "希儿", "可可利亚", "克拉拉", "史瓦罗", "娜塔莎", "桑博", "杰帕德", "希露瓦", "佩拉", "贝洛伯格", "地火",
  // 仙舟罗浮
  "景元", "符玄", "镜流", "飞霄", "白露", "停云", "驭空", "青雀", "彦卿", "藿藿", "寒鸦", "雪衣", "椒丘", "貊泽", "灵砂", "仙舟", "罗浮", "建木", "药王秘传", "巡猎", "岚", "存护", "克里珀", "智识", "博识尊"
];

/**
 * 从文本中快速提取包含的核心实体列表
 */
export function extractEntities(text: string): string[] {
  if (!text) return [];
  const found = new Set<string>();
  for (const entity of CORE_ENTITY_DICTIONARY) {
    if (text.includes(entity)) {
      found.add(entity);
    }
  }
  return Array.from(found);
}

/**
 * 粗略估算中文与英文混合文本的 Token 数
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  let tokens = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    // CJK characters count as ~0.7-1 token
    if (code > 0x7f) {
      tokens += 1;
    } else if (/\s/.test(text[i])) {
      tokens += 0.3;
    } else {
      tokens += 0.25;
    }
  }
  return Math.max(1, Math.ceil(tokens));
}

import elioUrl from "../tast/艾利欧.png";
import hertaUrl from "../tast/大黑塔.png";
import danhengUrl from "../tast/丹恒.png";
import himekoUrl from "../tast/姬子.png";
import kafkaUrl from "../tast/卡夫卡.png";
import pompomUrl from "../tast/帕姆.png";
import bladeUrl from "../tast/刃.png";
import marchUrl from "../tast/三月七.png";
import weltUrl from "../tast/瓦尔特.png";
import sundayUrl from "../tast/星期日.png";
import silverWolfUrl from "../tast/银狼.png";
import robinUrl from "../tast/知更鸟.png";

const portraitByAssetFileName: Readonly<Record<string, string>> = {
  "艾利欧.png": elioUrl,
  "大黑塔.png": hertaUrl,
  "丹恒.png": danhengUrl,
  "姬子.png": himekoUrl,
  "卡夫卡.png": kafkaUrl,
  "帕姆.png": pompomUrl,
  "刃.png": bladeUrl,
  "三月七.png": marchUrl,
  "瓦尔特.png": weltUrl,
  "星期日.png": sundayUrl,
  "银狼.png": silverWolfUrl,
  "知更鸟.png": robinUrl,
};

export function getCharacterPortraitByAssetFileName(assetFileName: string): string | null {
  return portraitByAssetFileName[assetFileName] ?? null;
}

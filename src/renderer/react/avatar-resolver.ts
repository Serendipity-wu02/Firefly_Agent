/**
 * @file avatar-resolver.ts
 * @description Extensible Avatar Resolver for Firefly-Agent Harness Chat.
 * Dynamically resolves the real Firefly avatar asset (src/renderer/head_portrait/firefly.png)
 * for assistant messages, while providing an extensible provider interface for future external integrations.
 */

const FIREFLY_DEFAULT_AVATAR_PATH = new URL("../head_portrait/firefly.png", import.meta.url).href;

export interface AvatarDescriptor {
  /** 头像展现形式: image | svg | text */
  readonly kind: "image" | "svg" | "text";
  /** 角色名称 */
  readonly name: string;
  /** 视觉描述/Alt */
  readonly alt: string;
  /** 真实图片资源 URL / 导入路径 */
  readonly src?: string;
  /** 主题前景色与徽章背景 */
  readonly themeColor?: string;
  readonly badgeBg?: string;
}

export interface IAvatarResolver {
  resolveAvatar(role: "assistant" | "user" | "system", metadata?: Record<string, unknown>): AvatarDescriptor;
}

/**
 * 默认流萤头像解析器 (Default Firefly Avatar Resolver)
 * 采用真实物理资产 src/renderer/head_portrait/firefly.png
 * 严格保持固定头像，不随瞬时情绪切换图片 (情绪由 Live2D 和 Voice 具身化承担)
 */
export class DefaultAvatarResolver implements IAvatarResolver {
  resolveAvatar(role: "assistant" | "user" | "system", metadata?: Record<string, unknown>): AvatarDescriptor {
    if (role === "assistant") {
      return {
        kind: "image",
        name: "流萤",
        alt: "流萤 (Firefly)",
        src: FIREFLY_DEFAULT_AVATAR_PATH,
        themeColor: "#7ee7c4",
      };
    }

    if (role === "system") {
      return {
        kind: "text",
        name: "系统",
        alt: "系统提示",
        themeColor: "#8e98ab",
        badgeBg: "#252a36",
      };
    }

    return {
      kind: "text",
      name: (metadata?.userName as string) || "开拓者",
      alt: "开拓者 (Trailblazer)",
      themeColor: "#ffffff",
      badgeBg: "linear-gradient(135deg, #4f80e1 0%, #294680 100%)",
    };
  }
}

export const globalAvatarResolver = new DefaultAvatarResolver();

/**
 * @file avatar-resolver.ts
 * @description Extensible Avatar Resolver for Firefly-Agent Harness Chat.
 * Provides a decoupled avatar resolution mechanism. Resolves the default Firefly avatar
 * with future extension hooks for external profile providers (e.g. WeChat, QQ, local custom).
 */

export interface AvatarDescriptor {
  /** 头像展现形式: svg | image | text */
  readonly kind: "svg" | "image" | "text";
  /** 角色名称 */
  readonly name: string;
  /** 视觉描述/Alt */
  readonly alt: string;
  /** 图片 URL (当 kind === "image" 时可用) */
  readonly src?: string;
  /** 主题前景色与背景色 */
  readonly themeColor?: string;
  readonly badgeBg?: string;
}

export interface IAvatarResolver {
  resolveAvatar(role: "assistant" | "user" | "system", metadata?: Record<string, unknown>): AvatarDescriptor;
}

/**
 * 默认流萤头像解析器 (Default Firefly Avatar Resolver)
 * 采用固定流萤专属配色 (#39c5bb / #2a8370 莹绿星辉) 与“萤”标识
 * 严格保持固定头像，不随瞬时情绪动态切换头像图片 (情绪由 Live2D 和 Voice 具身化承担)
 */
export class DefaultAvatarResolver implements IAvatarResolver {
  resolveAvatar(role: "assistant" | "user" | "system", metadata?: Record<string, unknown>): AvatarDescriptor {
    if (role === "assistant") {
      return {
        kind: "text",
        name: "流萤",
        alt: "流萤 (Firefly)",
        themeColor: "#ffffff",
        badgeBg: "linear-gradient(135deg, #3dbd98 0%, #1f5e4b 100%)",
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

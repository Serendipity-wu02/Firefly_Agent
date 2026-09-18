export interface ApplicationToolLike {
  readonly id: string;
}

export interface ApplicationToolRegistry<TTool extends ApplicationToolLike> {
  register(tool: TTool): void;
  unregister(toolId: string): boolean;
  get(toolId: string): TTool | undefined;
}

export interface ApplicationCapabilityBindingLike {
  readonly capabilityId: string;
  readonly toolId: string;
}

export interface CapabilityBindingRegistrar<TBinding extends ApplicationCapabilityBindingLike> {
  register(binding: TBinding): void;
}

export interface ApplicationToolRegistration {
  register(): void;
  restore(): void;
}

/**
 * Owns the reversible registration scope for tools constructed by the
 * application composition root. It does not create a second registry.
 */
export function createApplicationToolRegistration<TTool extends ApplicationToolLike>(
  registry: ApplicationToolRegistry<TTool>,
  tools: readonly TTool[],
): ApplicationToolRegistration {
  const previousTools = new Map<string, TTool | undefined>();
  let registered = false;

  const restore = (): void => {
    if (!registered && previousTools.size === 0) return;

    for (const [toolId, previousTool] of previousTools) {
      if (previousTool) registry.register(previousTool);
      else registry.unregister(toolId);
    }

    previousTools.clear();
    registered = false;
  };

  return {
    register(): void {
      if (registered) return;

      try {
        for (const tool of tools) {
          if (!previousTools.has(tool.id)) previousTools.set(tool.id, registry.get(tool.id));
          registry.register(tool);
        }
        registered = true;
      } catch (error: unknown) {
        restore();
        throw error;
      }
    },
    restore,
  };
}

/**
 * Registers tools before resolving capability bindings. A failed binding does
 * not leave the application-owned registrations in the shared registry.
 */
export function registerApplicationToolBindings<TBinding extends ApplicationCapabilityBindingLike>(
  registration: ApplicationToolRegistration,
  bindingResolver: CapabilityBindingRegistrar<TBinding>,
  bindings: readonly TBinding[],
): void {
  registration.register();
  try {
    for (const binding of bindings) bindingResolver.register(binding);
  } catch (error: unknown) {
    registration.restore();
    throw error;
  }
}

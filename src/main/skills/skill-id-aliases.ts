export const SKILL_ID_ALIASES: Readonly<Record<string, string>> = {
  "cyrene-diagram": "firefly-diagram",
  "cyrene-exam-paper": "firefly-exam-paper",
  "cyrene-learn-tutor": "firefly-learn-tutor",
  "cyrene-obsidian-workspace": "firefly-obsidian-workspace",
  "cyrene-original-voice": "firefly-original-voice",
  "cyrene-plan-mode": "firefly-plan-mode",
  "cyrene-plugin-dev": "firefly-plugin-dev",
  "cyrene-work-hygiene": "firefly-work-hygiene",
};

export function resolveSkillId(id: string): string {
  return Object.prototype.hasOwnProperty.call(SKILL_ID_ALIASES, id) ? SKILL_ID_ALIASES[id] : id;
}

export function resolveSkillSettings<Value>(settings: Record<string, Value>): Record<string, Value> {
  const resolved = { ...settings };
  for (const [legacy, current] of Object.entries(SKILL_ID_ALIASES)) {
    if (Object.prototype.hasOwnProperty.call(settings, legacy) && !Object.prototype.hasOwnProperty.call(settings, current)) {
      resolved[current] = settings[legacy];
    } else if (settings[legacy] && settings[current] && typeof settings[legacy] === "object" && typeof settings[current] === "object") {
      resolved[current] = { ...settings[legacy], ...settings[current] };
    }
  }
  return resolved;
}

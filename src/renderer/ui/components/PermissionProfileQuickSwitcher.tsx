/**
 * Compact Chat control for the canonical PermissionProfile setting.
 * It presents the existing canonical settings value and never persists
 * anything outside the typed settings bridge.
 */

import React, { useEffect, useRef, useState } from "react";
import {
  PERMISSION_PROFILE_OPTIONS,
  type PermissionProfile,
} from "../../../shared/permission-profile-types";
import { THEME_TOKENS } from "../theme/tokens";

export interface PermissionProfileQuickSwitcherProps {
  readonly profile: PermissionProfile;
  readonly onChange: (profile: PermissionProfile) => void | Promise<void>;
}

export const PermissionProfileQuickSwitcher: React.FC<PermissionProfileQuickSwitcherProps> = ({
  profile,
  onChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Partial<Record<PermissionProfile, HTMLButtonElement | null>>>({});
  const selectedOption = PERMISSION_PROFILE_OPTIONS.find((option) => option.value === profile);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) optionRefs.current[profile]?.focus();
  }, [isOpen, profile]);

  if (!selectedOption) return null;

  return (
    <div
      ref={rootRef}
      data-permission-profile-quick-switcher="true"
      style={{ position: "relative", display: "inline-flex" }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={`权限方案：${selectedOption.label}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        title="切换权限方案"
        onClick={() => setIsOpen((open) => !open)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
          minHeight: "26px",
          padding: "3px 8px",
          borderRadius: THEME_TOKENS.radii.full,
          border: `1px solid ${THEME_TOKENS.colors.border}`,
          background: THEME_TOKENS.colors.surface,
          color: THEME_TOKENS.colors.textSecondary,
          fontFamily: THEME_TOKENS.typography.fontFamily,
          fontSize: THEME_TOKENS.typography.fontSizes.caption,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        <span aria-hidden="true">🛡️</span>
        <span>{selectedOption.label}</span>
        <span aria-hidden="true">⌄</span>
      </button>

      {isOpen ? (
        <div
          role="menu"
          aria-label="权限方案"
          style={{
            position: "absolute",
            left: 0,
            bottom: "calc(100% + 8px)",
            zIndex: 30,
            minWidth: "128px",
            padding: "5px",
            display: "flex",
            flexDirection: "column",
            gap: "2px",
            borderRadius: THEME_TOKENS.radii.md,
            border: `1px solid ${THEME_TOKENS.colors.border}`,
            background: THEME_TOKENS.colors.surfaceElevated,
            boxShadow: THEME_TOKENS.shadows.md,
            backdropFilter: "blur(12px)",
          }}
        >
          {PERMISSION_PROFILE_OPTIONS.map((option) => {
            const isSelected = option.value === profile;
            return (
              <button
                key={option.value}
                ref={(element) => {
                  optionRefs.current[option.value] = element;
                }}
                type="button"
                role="menuitemradio"
                aria-checked={isSelected}
                onClick={() => {
                  setIsOpen(false);
                  void onChange(option.value);
                }}
                style={{
                  width: "100%",
                  padding: "6px 8px",
                  border: "none",
                  borderRadius: THEME_TOKENS.radii.sm,
                  background: isSelected ? THEME_TOKENS.colors.accentPill : "transparent",
                  color: isSelected ? THEME_TOKENS.colors.accent : THEME_TOKENS.colors.textPrimary,
                  fontFamily: THEME_TOKENS.typography.fontFamily,
                  fontSize: THEME_TOKENS.typography.fontSizes.label,
                  fontWeight: isSelected ? 700 : 500,
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                {isSelected ? "✓ " : ""}{option.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

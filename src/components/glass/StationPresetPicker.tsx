'use client';

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

export const STATION_PRESETS = [
  { label: 'BBC World Service', value: 'https://stream.live.vc.bbcmedia.co.uk/bbc_world_service_east_asia' },
  { label: 'Japan City Pop', value: 'https://play.streamafrica.net/japancitypop' },
  { label: 'Radio Paradise', value: 'http://stream.radioparadise.com/aac-128' },
] as const;

interface StationPresetPickerProps {
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
}

export default function StationPresetPicker({
  value,
  onChange,
  ariaLabel = 'Choose a station preset',
}: StationPresetPickerProps) {
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuPosition, setMenuPosition] = useState<{ left: number; top: number; width: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const selectedIndex = STATION_PRESETS.findIndex((preset) => preset.value === value);
  const selectedPreset = selectedIndex >= 0 ? STATION_PRESETS[selectedIndex] : null;

  const updateMenuPosition = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;

    const viewportPadding = 8;
    const menuGap = 6;
    const rect = button.getBoundingClientRect();
    const width = Math.min(rect.width, window.innerWidth - viewportPadding * 2);
    const menuHeight = menuRef.current?.offsetHeight ?? STATION_PRESETS.length * 40 + 14;
    const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
    const spaceAbove = rect.top - viewportPadding;
    const openAbove = spaceBelow < menuHeight + menuGap && spaceAbove > spaceBelow;
    const unclampedTop = openAbove
      ? rect.top - menuHeight - menuGap
      : rect.bottom + menuGap;

    setMenuPosition({
      left: Math.min(
        Math.max(viewportPadding, rect.left),
        window.innerWidth - viewportPadding - width,
      ),
      top: Math.min(
        Math.max(viewportPadding, unclampedTop),
        window.innerHeight - viewportPadding - menuHeight,
      ),
      width,
    });
  }, []);

  useEffect(() => {
    if (!open) return;

    const closeFromOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const closeFromEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };

    const reposition = () => updateMenuPosition();
    const focusFrame = requestAnimationFrame(() => {
      updateMenuPosition();
      optionRefs.current[activeIndex]?.focus();
    });

    document.addEventListener('pointerdown', closeFromOutside);
    document.addEventListener('keydown', closeFromEscape);
    document.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);

    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener('pointerdown', closeFromOutside);
      document.removeEventListener('keydown', closeFromEscape);
      document.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open, activeIndex, updateMenuPosition]);

  const openMenu = (index = selectedIndex >= 0 ? selectedIndex : 0) => {
    setActiveIndex(index);
    updateMenuPosition();
    setOpen(true);
  };

  const selectPreset = (index: number) => {
    onChange(STATION_PRESETS[index].value);
    setOpen(false);
    requestAnimationFrame(() => buttonRef.current?.focus());
  };

  const handleButtonKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    openMenu(event.key === 'ArrowUp' ? STATION_PRESETS.length - 1 : undefined);
  };

  const handleOptionKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex = index;

    if (event.key === 'ArrowDown') nextIndex = (index + 1) % STATION_PRESETS.length;
    else if (event.key === 'ArrowUp') nextIndex = (index - 1 + STATION_PRESETS.length) % STATION_PRESETS.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = STATION_PRESETS.length - 1;
    else if (event.key === 'Tab') {
      setOpen(false);
      return;
    } else return;

    event.preventDefault();
    setActiveIndex(nextIndex);
    optionRefs.current[nextIndex]?.focus();
  };

  return (
    <div className="g-preset" ref={rootRef}>
      <button
        ref={buttonRef}
        className="g-preset__trigger"
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => open ? setOpen(false) : openMenu()}
        onKeyDown={handleButtonKeyDown}
      >
        <span>{selectedPreset?.label ?? 'Choose station'}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>

      {open && menuPosition && createPortal(
        <div
          ref={menuRef}
          className="g-preset__menu"
          id={menuId}
          role="menu"
          aria-label="Station presets"
          style={menuPosition}
        >
          {STATION_PRESETS.map((preset, index) => (
            <button
              key={preset.value}
              ref={(node) => { optionRefs.current[index] = node; }}
              className="g-preset__option"
              type="button"
              role="menuitemradio"
              aria-checked={selectedIndex === index}
              onClick={() => selectPreset(index)}
              onKeyDown={(event) => handleOptionKeyDown(event, index)}
            >
              <span>{preset.label}</span>
              {selectedIndex === index && <Check size={15} aria-hidden="true" />}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}

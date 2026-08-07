'use client';

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

/* The amplifier hands the URL straight to ESP32-audioI2S's connecttohost()
   (see Main_amp/src/main.cpp), so a preset has to be a direct MP3 or AAC
   endpoint. Two things that look like streams but are not, and will fail
   silently on the board:
     - HLS playlists (.m3u8). The library has no HLS support at all.
     - Station pages and tokenised CDN links, which expire.
   Redirects are fine — the library follows them, and the Japan City Pop
   entry is a 302 to its current edge.

   Every URL here was checked for a 2xx and an audio/* content type. Keep
   bitrates at or below 128k: the board streams over Wi-Fi into a small
   buffer, and the higher-rate variants of these same stations stutter.

   `genre` is what the picker shows under the name. A homeowner choosing
   from fifteen station names they may not recognise needs to know what
   comes out of the speaker, not who runs the transmitter. */
export const STATION_PRESETS = [
  { group: 'News and talk', label: 'BBC World Service', genre: 'World news and talk', value: 'https://stream.live.vc.bbcmedia.co.uk/bbc_world_service_east_asia' },
  { group: 'News and talk', label: 'NPR', genre: 'US news and talk', value: 'https://npr-ice.streamguys1.com/live.mp3' },

  { group: 'Music', label: 'Radio Paradise', genre: 'Eclectic main mix', value: 'http://stream.radioparadise.com/aac-128' },
  { group: 'Music', label: 'Radio Paradise Mellow', genre: 'Quiet, acoustic', value: 'http://stream.radioparadise.com/mellow-128' },
  { group: 'Music', label: 'Radio Paradise Rock', genre: 'Guitar rock', value: 'http://stream.radioparadise.com/rock-128' },
  { group: 'Music', label: 'Radio Paradise Global', genre: 'Music from everywhere', value: 'http://stream.radioparadise.com/global-128' },
  { group: 'Music', label: 'KEXP', genre: 'Indie and new music', value: 'https://kexp.streamguys1.com/kexp128.mp3' },
  { group: 'Music', label: 'Japan City Pop', genre: 'Japanese city pop', value: 'https://play.streamafrica.net/japancitypop' },

  { group: 'Quiet enough to leave on', label: 'Groove Salad', genre: 'Downtempo, chilled beats', value: 'http://ice1.somafm.com/groovesalad-128-mp3' },
  { group: 'Quiet enough to leave on', label: 'Drone Zone', genre: 'Ambient, no beats', value: 'http://ice1.somafm.com/dronezone-128-mp3' },
  { group: 'Quiet enough to leave on', label: 'Lush', genre: 'Calm vocal electronica', value: 'http://ice1.somafm.com/lush-128-mp3' },
  { group: 'Quiet enough to leave on', label: 'Fluid', genre: 'Instrumental hip-hop', value: 'http://ice1.somafm.com/fluid-128-mp3' },

  { group: 'Jazz and classical', label: 'Secret Agent', genre: 'Lounge and spy jazz', value: 'http://ice1.somafm.com/secretagent-128-mp3' },
  { group: 'Jazz and classical', label: 'TSF Jazz', genre: 'Jazz, from Paris', value: 'https://tsfjazz.ice.infomaniak.ch/tsfjazz-high.mp3' },
  { group: 'Jazz and classical', label: 'WQXR', genre: 'Classical, from New York', value: 'https://stream.wqxr.org/wqxr' },
] as const;

/* The menu renders in groups but every keyboard path — arrows, Home/End,
   typeahead, the roving focus refs — still counts in one flat sequence. So
   the grouping carries the flat index with it rather than re-deriving it,
   which is what would drift the moment a station is added mid-list.
   Runs once at module load; the list is static. */
export const STATION_GROUPS = STATION_PRESETS.reduce<
  Array<{ group: string; items: Array<{ preset: (typeof STATION_PRESETS)[number]; index: number }> }>
>((groups, preset, index) => {
  const current = groups[groups.length - 1];
  if (current && current.group === preset.group) current.items.push({ preset, index });
  else groups.push({ group: preset.group, items: [{ preset, index }] });
  return groups;
}, []);

/* Flat index → its place in the grid, so Left/Right can step between columns
   without the handler re-deriving the grouping on every keypress. */
const STATION_COORDS = STATION_GROUPS.flatMap(({ items }, groupIndex) =>
  items.map((item, itemIndex) => ({ flat: item.index, groupIndex, itemIndex })),
).sort((a, b) => a.flat - b.flat);

/* The menu lays the groups out as columns rather than one running list. A
   single column of fifteen was taller than the viewport, so it covered the
   card that opened it and had to scroll to reach the last station; as four
   columns the whole set is visible at once and the tallest group — Music, at
   six — sets a height that needs no scrolling at all.

   Columns are sized in JS, not by auto-fit, because the panel is fixed-
   position: its width has to be known before it is placed, and the same
   number decides whether it opens above or below the trigger. */
const MENU_COLUMN_WIDTH = 208;
const MENU_COLUMN_GAP = 10;
const MENU_PADDING = 6;
/* Enough for six stations plus a group label. Only reached on a viewport too
   narrow for four columns, where the groups stack and the panel scrolls. */
const MENU_MAX_HEIGHT = 344;

function menuColumns(available: number): number {
  const usable = available - MENU_PADDING * 2 + MENU_COLUMN_GAP;
  const fit = Math.floor(usable / (MENU_COLUMN_WIDTH + MENU_COLUMN_GAP));
  return Math.min(STATION_GROUPS.length, Math.max(1, fit));
}

function menuWidth(columns: number, available: number): number {
  const natural =
    columns * MENU_COLUMN_WIDTH + (columns - 1) * MENU_COLUMN_GAP + MENU_PADDING * 2;
  return Math.min(natural, available);
}

/** What the broadcast card starts on. Keep it equal to one of the values
 *  above: a URL that is not in the list leaves the picker reading "Choose
 *  station" and stops the now-playing line from naming what is playing. */
export const DEFAULT_STATION_URL = 'http://stream.radioparadise.com/aac-128';

interface StationPresetPickerProps {
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  /** For surfaces that gate playback on the device being reachable — the hub
   *  disables the whole amplifier block when it is offline. */
  disabled?: boolean;
}

export default function StationPresetPicker({
  value,
  onChange,
  ariaLabel = 'Choose a station preset',
  disabled = false,
}: StationPresetPickerProps) {
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuPosition, setMenuPosition] = useState<
    { left: number; top: number; width: number; maxHeight: number; gridTemplateColumns: string } | null
  >(null);
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
    const available = window.innerWidth - viewportPadding * 2;
    const columns = menuColumns(available);
    const width = menuWidth(columns, available);
    const maxHeight = Math.min(MENU_MAX_HEIGHT, window.innerHeight - viewportPadding * 2);
    // At full width the panel is shorter than the cap, so measure once it
    // exists; the cap is only the ceiling and the first-open estimate.
    const menuHeight = Math.min(menuRef.current?.offsetHeight ?? maxHeight, maxHeight);
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
      maxHeight,
      gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
    });
  }, []);

  // The device can drop while the menu is open — a disabled button cannot be
  // clicked shut, so the panel would be left floating over a dead control.
  useEffect(() => {
    if (open && disabled) setOpen(false);
  }, [open, disabled]);

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

  /* Typeahead. Arrowing to WQXR is fourteen presses; "w" is one. Standard for
     a menu this long, and the only reason it needs no filter box. Matches are
     searched from the option after the current one and wrap, so pressing the
     same letter cycles the stations that share it. */
  const typeahead = useRef({ query: '', at: 0 });

  const findByTypeahead = (key: string, index: number): number => {
    const now = Date.now();
    // A pause ends the word. Within the window the letters accumulate, so
    // "ra" reaches Radio Paradise instead of stepping through every R.
    const query = now - typeahead.current.at < 600 ? typeahead.current.query + key : key;
    typeahead.current = { query, at: now };

    // A repeated single letter means "next one starting with this", not a
    // two-letter word — otherwise "ss" would match nothing.
    const repeated = query.length > 1 && query.split('').every((char) => char === query[0]);
    const needle = repeated ? query[0] : query;
    const from = query.length > 1 && !repeated ? index : index + 1;

    for (let step = 0; step < STATION_PRESETS.length; step += 1) {
      const candidate = (from + step) % STATION_PRESETS.length;
      if (STATION_PRESETS[candidate].label.toLowerCase().startsWith(needle)) return candidate;
    }
    return -1;
  };

  const handleOptionKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex = index;

    /* Down/Up walk the flat sequence, which is exactly reading order: the flat
       order is column-major, so falling off the bottom of one column continues
       at the top of the next. Left/Right step between columns at the same
       depth, clamped because the columns are uneven. */
    if (event.key === 'ArrowDown') nextIndex = (index + 1) % STATION_PRESETS.length;
    else if (event.key === 'ArrowUp') nextIndex = (index - 1 + STATION_PRESETS.length) % STATION_PRESETS.length;
    else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      const { groupIndex, itemIndex } = STATION_COORDS[index];
      const step = event.key === 'ArrowRight' ? 1 : -1;
      const nextGroup = STATION_GROUPS[
        (groupIndex + step + STATION_GROUPS.length) % STATION_GROUPS.length
      ];
      nextIndex = nextGroup.items[Math.min(itemIndex, nextGroup.items.length - 1)].index;
    }
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = STATION_PRESETS.length - 1;
    else if (event.key === 'Tab') {
      setOpen(false);
      return;
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey && event.key !== ' ') {
      const match = findByTypeahead(event.key.toLowerCase(), index);
      if (match < 0) return;
      nextIndex = match;
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
        disabled={disabled}
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
          {/* role="group" rather than a bare heading: a screen reader announces
              "Music, 6 items" on entering the section, so the grouping is not
              purely visual. The label itself is aria-hidden because the group's
              own name already carries it. */}
          {STATION_GROUPS.map(({ group, items }) => (
            <div className="g-preset__group" role="group" aria-label={group} key={group}>
              <p className="g-preset__group-label" aria-hidden="true">{group}</p>
              {items.map(({ preset, index }) => (
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
                  <span>
                    {preset.label}
                    <small>{preset.genre}</small>
                  </span>
                  {selectedIndex === index && <Check size={15} aria-hidden="true" />}
                </button>
              ))}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}

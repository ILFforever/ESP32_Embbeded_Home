/**
 * Where each device physically lives.
 *
 * The backend does not store a room or location — `GET /devices/status/all`
 * returns only `device_id`, `type`, `name`, `online` and `last_seen`
 * (see Backend/controllers/devices.js). So placement has to live here
 * until a `location` field exists on the device document.
 *
 * When the backend gains one, delete DEVICE_ROOMS and read
 * `device.location` instead — nothing else on the Plan page needs to change.
 *
 * A device with no entry here is not lost: the page lists it under
 * "Not placed yet" so it stays visible and obviously unassigned.
 */

export type RoomId = 'living' | 'kitchen' | 'garage' | 'bedroom' | 'hall';

export interface Room {
  id: RoomId;
  name: string;
  /** Room rectangle in the 660x440 plan viewBox. */
  rect: { x: number; y: number; w: number; h: number };
  /** Where the room label sits. */
  label: { x: number; y: number };
  /** Where this room's reading pin sits. */
  pin: { x: number; y: number };
  /** Which side the callout tag hangs off the pin. */
  tagSide: 'above' | 'right';
}

export const ROOMS: Room[] = [
  { id: 'living',  name: 'Living room', rect: { x:  22, y:  22, w: 336, h: 238 }, label: { x:  42, y:  48 }, pin: { x: 150, y: 150 }, tagSide: 'above' },
  { id: 'kitchen', name: 'Kitchen',     rect: { x: 358, y:  22, w: 280, h: 178 }, label: { x: 378, y:  48 }, pin: { x: 498, y: 128 }, tagSide: 'above' },
  { id: 'garage',  name: 'Garage',      rect: { x: 358, y: 200, w: 280, h: 218 }, label: { x: 378, y: 226 }, pin: { x: 498, y: 320 }, tagSide: 'above' },
  { id: 'bedroom', name: 'Bedroom',     rect: { x:  22, y: 260, w: 178, h: 158 }, label: { x:  42, y: 286 }, pin: { x:  36, y: 341 }, tagSide: 'right' },
  { id: 'hall',    name: 'Hall',        rect: { x: 200, y: 260, w: 158, h: 158 }, label: { x: 220, y: 286 }, pin: { x: 282, y: 404 }, tagSide: 'above' },
];

/** Outer wall, with both doorways left as real gaps rather than painted over. */
export const OUTER_WALL = 'M22 22 H638 V418 H312 M252 418 H22 V366 M22 316 V22';
export const INNER_WALLS = 'M358 22 V418 M22 260 H358 M200 260 V418 M358 200 H638';
/** Door swings, both opening inward. */
export const DOOR_SWINGS = [
  'M252 418 A34 34 0 0 1 312 418',
  'M22 316 A30 30 0 0 1 22 366',
];

/**
 * device_id -> room. Edit this to match your house.
 * Ids come from the backend; check the Devices card if you are unsure.
 */
export const DEVICE_ROOMS: Record<string, RoomId> = {
  hb_001: 'hall',      // hub display
  db_001: 'hall',      // doorbell, by the front door
  dl_001: 'hall',      // front door lock
  dl_002: 'bedroom',   // back door lock
  ss_001: 'living',
  ss_002: 'kitchen',
  ss_003: 'garage',
};

export function roomOf(deviceId: string): RoomId | null {
  return DEVICE_ROOMS[deviceId] ?? null;
}

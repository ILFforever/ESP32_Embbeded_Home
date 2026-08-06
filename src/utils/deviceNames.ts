import { ROOMS, DEVICE_ROOMS } from '@/utils/floorPlan';

/**
 * What to call a device in front of someone who lives here.
 *
 * The dashboard was printing `dl_001`, `hb_001`, `db_001` and "Sensor 1"
 * straight onto the home screen. Those are row keys. A resident has never
 * seen them and cannot act on them.
 *
 * The backend's `name` is used whenever it has one — that is a real name
 * someone typed. When it is blank, we build one from what we do know: the
 * kind of device, and the room it sits in (see floorPlan.ts, which exists
 * because the backend has no location field).
 *
 * The id is never hidden, only demoted: cards still show it as secondary
 * text, so anyone debugging can still find the board.
 */

const ROOM_NAMES = Object.fromEntries(ROOMS.map(room => [room.id, room.name])) as Record<string, string>;

/** "Living room" — or null when this device has no room assigned. */
export function roomName(deviceId: string): string | null {
  const room = DEVICE_ROOMS[deviceId];
  return room ? ROOM_NAMES[room] ?? null : null;
}

/** "Door lock", "Doorbell", "Hub", "Sensor" — from the id prefix or type. */
export function deviceKind(deviceId: string, type?: string): string {
  if (deviceId.startsWith('dl_')) return 'Door lock';
  if (deviceId.startsWith('db_')) return 'Doorbell';
  if (deviceId.startsWith('hb_')) return 'Hub';
  if (deviceId.startsWith('ss_')) return 'Sensor';

  switch ((type || '').toLowerCase()) {
    case 'doorbell': return 'Doorbell';
    case 'hub':
    case 'main_lcd': return 'Hub';
    case 'actuator': return 'Door lock';
    case 'sensor': return 'Sensor';
    default: return 'Device';
  }
}

interface Named {
  device_id: string;
  name?: string | null;
  type?: string;
}

/**
 * The label to put in front of a person: the backend name if there is one,
 * otherwise "Kitchen sensor" / "Hall door lock", otherwise "Sensor".
 */
export function deviceLabel(device: Named): string {
  const given = (device.name || '').trim();
  if (given && given !== device.device_id) return given;

  const kind = deviceKind(device.device_id, device.type);
  const room = roomName(device.device_id);
  // "Kitchen sensor", not "Kitchen Sensor" — it is one noun phrase.
  return room ? `${room} ${kind.toLowerCase()}` : kind;
}

/** Same, for the places that only carry an id (gas readings, lock states). */
export function labelForId(deviceId: string, fallbackName?: string | null): string {
  return deviceLabel({ device_id: deviceId, name: fallbackName });
}

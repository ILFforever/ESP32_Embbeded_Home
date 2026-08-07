/* A charge reading from a board that has been silent since March is not its
   charge — it is the last thing it told us, and a board often goes quiet
   *because* the battery ran out. The Devices table printed "100%" beside a
   ring that had already emptied itself for being offline, over a Last seen
   of Mar 23: three renderings of one fact, one of them wrong.

   Keep the value — a battery is slow-moving and the last figure is worth
   something — but say that it is history. The ring stays empty either way;
   only a current reading gets to fill it. */

export function batteryText(battery: number | undefined, online: boolean) {
  if (battery === undefined) return 'Unknown';
  return online ? `${battery}%` : `Last ${battery}%`;
}

export function batteryLabel(name: string, battery: number | undefined, online: boolean) {
  if (battery === undefined) return `${name} battery unknown`;
  return online
    ? `${name} battery ${battery} percent`
    : `${name} last reported ${battery} percent battery`;
}

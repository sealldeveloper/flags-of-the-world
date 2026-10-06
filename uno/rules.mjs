// Independent lobby switches. Keep the original stack2 wire key for the expanded stacking rule.
export const RULES = [
  {key:'jumpIn', label:'Jump-ins', mark:'↯', help:'Play an identical colour and number out of turn. No jumping during penalties or drawn-card decisions.'},
  {key:'sevenZero', label:'7–0', mark:'7↔0', help:'A 7 swaps hands with a player you choose. A 0 rotates everyone’s hands in the play direction.'},
  {key:'drawUntilPlayable', label:'Draw till playable', mark:'… →', help:'Draw until you find a playable card, or the deck runs out. Stops at the first match.'},
  {key:'forcePlay', label:'Force play', mark:'▶', help:'A playable drawn card must be played. Normal cards play automatically; wilds and 7s still ask for a choice.'},
  {key:'stack2', label:'Stacking', mark:'+2 +4', help:'Stack +2 on +2, or +4 on +4. No mixing. The next player pays the accumulated penalty or stacks again.'},
];
export const DEFAULT_RULES = Object.freeze(Object.fromEntries(RULES.map(({key})=>[key,false])));
export function validateRules(input) {
  if (RULES.some(({key})=>typeof input?.[key] !== 'boolean')) throw new Error('Every rule must be on or off');
  return Object.fromEntries(RULES.map(({key})=>[key,input[key]]));
}

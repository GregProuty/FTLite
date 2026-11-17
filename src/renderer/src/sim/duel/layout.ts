import hound from '../ship/hound.json';
import { parseShip } from '../ship/schema';
/** The duel ship (Art-iv spec section 3): the Hound, for single player and the online duel alike. */
export const DUEL_LAYOUT = parseShip(hound);

// UI round Part 3 §3.4: the shared amber filter (id crt-amber): desaturate, then map luminance onto the CRT ramp. Element
// ids are global in the DOM, so render this once where it is shown (the contact window; Task 6 reuses the id).
import { amberTables } from '../../render/amberFilter';

export function AmberFilter() {
  const t = amberTables();
  return (
    <svg width={0} height={0} style={{ position: 'absolute' }} aria-hidden="true" data-ui-amber-filter="">
      <defs>
        <filter id="crt-amber" colorInterpolationFilters="sRGB">
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncR type="table" tableValues={t.r} />
            <feFuncG type="table" tableValues={t.g} />
            <feFuncB type="table" tableValues={t.b} />
          </feComponentTransfer>
        </filter>
      </defs>
    </svg>
  );
}

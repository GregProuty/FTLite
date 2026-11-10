Cozy Space Interiors — top-down sci-fi interior tileset (16 px)

Floors, a rounded steel room frame, front walls and an animated sliding door
to build the inside of a space station. Made to match the Cozy Space Station
props and the Walking Crew characters.

TILESET  tileset/1x|2x|4x/cozy-space-interiors-tileset.png  (16 px grid, 10 x 7 tiles at 1x)

  row 1   floors: steel, steel plain, steel bolts, steel vent, grate,
          carpet blue, carpet beige, lab
  row 2   floors: hazard stripes, light panel, hatch, empty space;
          then the 4 inner frame corners (nw, ne, sw, se) for L-shaped rooms
  rows 3-5  room frame, 9-slice: nw, n, ne / w, center, e / sw, s, se
  rows 6-7  front walls, 16 x 32 (two tiles tall): wall, window, window with
          planet, screen, vent, pipes, light, sign, door closed, door open

The frame tiles are transparent inside and outside: put them on a layer above
the floor. Front walls go in the first row inside the top frame.

LOOSE TILES  tiles/1x|2x|4x/   every tile as its own PNG (same names as above)
             door-4f.png       sliding door, 4 frames (closed -> open), 16 x 32 each

EXAMPLES     examples/          two example rooms built only from this tileset

TILED        tiled/             ready for the Tiled map editor (mapeditor.org):
             cozy-space-interiors.tsx   the tileset; frame and wall tiles have a
                                        "solid" property, every tile has a "name"
             example-room.tmx, example-lab.tmx   the two example rooms as maps with
                                        floor, frame and walls layers

Scale with nearest-neighbor to keep pixels crisp.

More from the Cozy Space set (aquumgifts.itch.io): Cozy Space Station (props),
Walking Crew (characters), Cozy Space Backdrops (planets), Cozy Space Ships.

License: CC-BY 4.0, see LICENSE.txt. Credit: "Cozy Space Interiors" by Bramble & Byte.
Every Cozy Space pack in one download: https://aquumgifts.itch.io/cozy-space-complete

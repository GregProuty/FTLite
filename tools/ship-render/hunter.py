"""The Hunter: an original top-down ship for the enemy window (UI round spec section 3.4).

Headless:
  "C:/Program Files/Blender Foundation/Blender 5.3/blender.exe" --background --factory-startup --disable-autoexec \
      --python tools/ship-render/hunter.py -- tools/ship-render/hunter.json [--out <absolute dir>] [--samples 64]
(--out defaults to the repo's public/assets/art/ships; Blender resolves a relative --out against its own folder.)

The hull is the scout outline from src/renderer/src/render/tactical/hullModel.ts (an original design), read from that file
so the picture always sits under the window's room outlines. It is extruded into an armoured hull with a raised deck, a
spine, three room hatches lit at their seams, twin engine bells aft, a weapon pod at the nose and seeded greebles along
the flanks. Materials are neutral greys: the window maps luminance onto the CRT amber ramp. One ship unit is one Blender
metre; f is +X, s is -Y, so the top-down orthographic camera puts +f right and +s down, as the window draws it.
Writes <out>/hunter.png (transparent background).
"""
import json
import math
import os
import random
import re
import sys

import bpy
import bmesh
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
HULL_TS = os.path.join(REPO, "src", "renderer", "src", "render", "tactical", "hullModel.ts")


def read_scout():
    """The SCOUT block's outline and rooms as lists of (f, s) pairs."""
    src = open(HULL_TS, encoding="utf-8").read()
    block = src[src.index("const SCOUT: Hull"):]
    block = block[:block.index("};")]
    nums = lambda txt: [float(x) for x in re.findall(r"-?\d+(?:\.\d+)?", txt)]
    pairs = lambda v: [(v[i], v[i + 1]) for i in range(0, len(v) - 1, 2)]
    outline = pairs(nums(block[block.index("outline:"):block.index("rooms:")]))
    rooms_txt = block[block.index("rooms:"):]
    rooms = [pairs(nums(m)) for m in re.findall(r"\[([^\[\]]+)\]", rooms_txt)]
    return outline, rooms


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    cfg_path, out, samples = argv[0], os.path.join(REPO, "public", "assets", "art", "ships"), None
    i = 1
    while i < len(argv):
        if argv[i] == "--out": out = argv[i + 1]; i += 2
        elif argv[i] == "--samples": samples = int(argv[i + 1]); i += 2
        else: raise SystemExit("unknown argument " + argv[i])
    cfg = json.load(open(cfg_path, encoding="utf-8"))
    if samples: cfg["samples"] = samples
    return cfg, out


def clear():
    for coll in (bpy.data.objects, bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras, bpy.data.worlds, bpy.data.curves):
        for b in list(coll): coll.remove(b)


def mat(name, grey, rough=0.55, metal=0.6, emit=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (grey, grey, grey, 1)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if emit > 0:
        bsdf.inputs["Emission Color"].default_value = (1, 1, 1, 1)
        bsdf.inputs["Emission Strength"].default_value = emit
    return m


def link(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj


def prism(name, poly, z0, z1, material, bevel=0.0):
    """A polygon (f, s) extruded from z0 to z1 (s mapped to -Y)."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    verts = [bm.verts.new((f, -s, z0)) for f, s in poly]
    face = bm.faces.new(verts)
    bmesh.ops.recalc_face_normals(bm, faces=[face])
    if face.normal.z > 0: face.normal_flip()   # the bottom faces down, so the extrusion's top faces up
    ext = bmesh.ops.extrude_face_region(bm, geom=[face])
    top = [v for v in ext["geom"] if isinstance(v, bmesh.types.BMVert)]
    for v in top: v.co.z = z1
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    obj = link(bpy.data.objects.new(name, me))
    obj.data.materials.append(material)
    if bevel > 0:
        mod = obj.modifiers.new("bevel", "BEVEL"); mod.width = bevel; mod.segments = 2; mod.limit_method = "ANGLE"
    return obj


def scaled(poly, k, about=None):
    cf = sum(p[0] for p in poly) / len(poly) if about is None else about[0]
    cs = sum(p[1] for p in poly) / len(poly) if about is None else about[1]
    return [(cf + (f - cf) * k, cs + (s - cs) * k) for f, s in poly]


def box(name, f, s, z, sf, ss, sz, material, rot=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(f, -s, z), rotation=(0, 0, rot))
    o = bpy.context.active_object; o.name = name; o.scale = (sf, ss, sz)
    o.data.materials.append(material)
    return o


def cyl(name, f, s, z, r, depth, material, axis="f", verts=24):
    rot = (0, math.pi / 2, 0) if axis == "f" else (0, 0, 0)
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=(f, -s, z), rotation=rot)
    o = bpy.context.active_object; o.name = name
    o.data.materials.append(material)
    return o


def point_in(poly, f, s):
    inside = False
    for i in range(len(poly)):
        (f1, s1), (f2, s2) = poly[i], poly[i - 1]
        if (s1 > s) != (s2 > s) and f < (f2 - f1) * (s - s1) / (s2 - s1) + f1: inside = not inside
    return inside


def build(outline, rooms, seed):
    rnd = random.Random(seed)
    armour = mat("armour", 0.3, rough=0.45, metal=0.75)
    deck = mat("deck", 0.46, rough=0.4, metal=0.6)
    dark = mat("dark", 0.12, rough=0.7, metal=0.3)
    trim = mat("trim", 0.75, rough=0.35, metal=0.8)
    glow = mat("glow", 1.0, rough=1.0, metal=0.0, emit=2.2)
    prism("hull", outline, 0.0, 0.10, armour, bevel=0.02)
    prism("deck", scaled(outline, 0.86, about=(0.05, 0.0)), 0.10, 0.16, deck, bevel=0.015)
    # the spine from the engines to the bridge, over the room line
    box("spine", -0.05, 0.0, 0.19, 1.5, 0.05, 0.05, trim)
    # the room hatches: a dark recess with a lit seam, each just inside its polygon
    for k, poly in enumerate(rooms):
        prism(f"room{k}.seam", scaled(poly, 0.94), 0.16, 0.175, glow)
        prism(f"room{k}", scaled(poly, 0.86), 0.16, 0.185, dark if k != 1 else deck, bevel=0.008)
    # the shield emitter: a disc over the middle room
    cf = sum(p[0] for p in rooms[1]) / len(rooms[1])
    cyl("emitter", cf, 0.0, 0.22, 0.12, 0.05, trim, axis="z", verts=32)
    cyl("emitter.core", cf, 0.0, 0.25, 0.06, 0.03, glow, axis="z", verts=32)
    # the weapon pod and twin barrels at the nose
    box("pod", 0.95, 0.0, 0.18, 0.28, 0.16, 0.1, armour)
    for s in (-0.045, 0.045):
        cyl(f"barrel{s}", 1.18, s, 0.2, 0.022, 0.32, trim, axis="f", verts=12)
    # twin engine bells aft, each with a lit nozzle
    for s in (-0.3, 0.3):
        cyl(f"nacelle{s}", -0.78, s, 0.12, 0.1, 0.5, armour, axis="f")
        cyl(f"bell{s}", -1.07, s, 0.12, 0.085, 0.12, dark, axis="f")
        cyl(f"nozzle{s}", -1.13, s, 0.12, 0.06, 0.02, glow, axis="f")
    # the fins: thin plates on the scout's swept tail
    for s in (-1, 1):
        prism(f"fin{s}", [(-0.62, 0.22 * s), (-0.98, 0.5 * s), (-1.1, 0.49 * s), (-0.95, 0.2 * s)], 0.1, 0.14, trim, bevel=0.005)
    # greebles: small plates and vents along the flanks, kept inside the hull and off the rooms
    placed = 0
    while placed < 46:
        f, s = rnd.uniform(-0.9, 1.0), rnd.uniform(-0.55, 0.55)
        if not point_in(scaled(outline, 0.84, about=(0.05, 0.0)), f, s): continue
        if any(point_in(scaled(p, 1.12), f, s) for p in rooms): continue
        w, d = rnd.uniform(0.03, 0.09), rnd.uniform(0.02, 0.05)
        box(f"greeble{placed}", f, s, 0.17, w, d, rnd.uniform(0.01, 0.035), rnd.choice([trim, dark, armour]))
        placed += 1


def scene_setup(cfg, out):
    sc = bpy.context.scene
    fr = cfg["frame"]
    wu, hu = fr["f1"] - fr["f0"], fr["s1"] - fr["s0"]
    sc.render.resolution_x = round(wu * cfg["pxPerUnit"]); sc.render.resolution_y = round(hu * cfg["pxPerUnit"])
    sc.render.resolution_percentage = 100
    cam_data = bpy.data.cameras.new("cam"); cam_data.type = "ORTHO"; cam_data.ortho_scale = max(wu, hu)
    cam = link(bpy.data.objects.new("cam", cam_data))
    cam.location = ((fr["f0"] + fr["f1"]) / 2, -(fr["s0"] + fr["s1"]) / 2, 5.0)
    sc.camera = cam
    key = bpy.data.lights.new("key", "SUN"); key.energy = 5.0; key.angle = math.radians(6)
    k = link(bpy.data.objects.new("key", key)); k.rotation_euler = (math.radians(52), math.radians(-30), math.radians(-35))
    fill = bpy.data.lights.new("fill", "SUN"); fill.energy = 0.8
    fl = link(bpy.data.objects.new("fill", fill)); fl.rotation_euler = (math.radians(-50), math.radians(30), math.radians(140))
    world = bpy.data.worlds.new("w"); sc.world = world; world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (0.25, 0.25, 0.25, 1); bg.inputs["Strength"].default_value = 0.3
    try: sc.render.engine = "CYCLES"
    except TypeError: pass
    sc.cycles.samples = cfg["samples"]; sc.cycles.seed = cfg["seed"]
    try: sc.cycles.use_denoising = True
    except AttributeError: pass
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = "PNG"; sc.render.image_settings.color_mode = "RGBA"
    try: sc.view_settings.view_transform = "Standard"
    except TypeError: pass
    os.makedirs(out, exist_ok=True)
    sc.render.filepath = os.path.join(out, "hunter.png")


def main():
    cfg, out = parse_args()
    clear()
    outline, rooms = read_scout()
    assert len(rooms) == 3, rooms
    build(outline, rooms, cfg["seed"])
    scene_setup(cfg, out)
    bpy.ops.render.render(write_still=True)
    print("wrote", bpy.context.scene.render.filepath, bpy.context.scene.render.resolution_x, bpy.context.scene.render.resolution_y)


main()

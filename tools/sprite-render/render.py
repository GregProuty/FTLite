"""Crew3D sprite renderer (spec docs/superpowers/specs/2026-11-20-crew3d-prerendered-sprites-design.md, section 1).

Headless:
  blender --background --factory-startup --disable-autoexec --python tools/sprite-render/render.py -- \
      tools/sprite-render/lookdev.json [--only crewA,boarder] [--out public/assets/art/crew3d] \
      [--meta src/renderer/src/render/crew3d.generated.json] [--preview dir]

For each character in the config it builds the figure (figure.py), poses every frame of every animation (anims.py) in
8 directions, renders it (Cycles) and a team-colour mask (EEVEE, unlit), runs the pixel pass (post.py) and writes
<char>.png, <char>.mask.png and the layout JSON the game reads. Nothing is loaded from disk except the config.
"""
import json
import math
import os
import sys
import tempfile

import bpy
import numpy as np
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import anims  # noqa: E402
import figure  # noqa: E402
import post  # noqa: E402


def setup_scene(cfg):
    """An empty scene with the look's camera, lights, world and render settings. Returns (scene, turntable)."""
    for coll in (bpy.data.objects, bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras, bpy.data.worlds):
        for block in list(coll):   # start clean without touching preferences or add-ons
            coll.remove(block)
    sc = bpy.context.scene
    turntable = bpy.data.objects.new("Turntable", None)
    sc.collection.objects.link(turntable)

    cd = bpy.data.cameras.new("SpriteCam")
    cd.type = "ORTHO"
    cd.ortho_scale = cfg["orthoScale"]
    cd.clip_end = 100
    cam = bpy.data.objects.new("SpriteCam", cd)
    sc.collection.objects.link(cam)
    sc.camera = cam
    aim_camera(sc, cfg, cfg["focusZ"])

    target = Vector(cfg["lightTarget"])
    for l in cfg["lights"]:
        ld = bpy.data.lights.new(l["name"], "AREA")
        ld.energy, ld.size, ld.color = l["energy"], l["size"], l["color"]
        o = bpy.data.objects.new(l["name"], ld)
        sc.collection.objects.link(o)
        o.location = l["location"]
        o.rotation_euler = (target - o.location).to_track_quat("-Z", "Y").to_euler()

    w = bpy.data.worlds.new("World")
    sc.world = w
    w.use_nodes = True
    nt = w.node_tree
    bg = next(n for n in nt.nodes if n.type == "BACKGROUND")
    tc, sep, ramp = nt.nodes.new("ShaderNodeTexCoord"), nt.nodes.new("ShaderNodeSeparateXYZ"), nt.nodes.new("ShaderNodeValToRGB")
    nt.links.new(tc.outputs["Generated"], sep.inputs[0])
    nt.links.new(sep.outputs["Z"], ramp.inputs["Fac"])
    wc = cfg["world"]
    e = ramp.color_ramp.elements
    e[0].position, e[0].color = wc["lowAt"], (*wc["low"], 1.0)
    e[1].position, e[1].color = wc["highAt"], (*wc["high"], 1.0)
    nt.links.new(ramp.outputs["Color"], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = wc["strength"]

    r = sc.render
    r.resolution_x = r.resolution_y = cfg["frame"] * cfg["supersample"]
    r.resolution_percentage = 100
    r.film_transparent = True
    r.image_settings.file_format = "PNG"
    r.image_settings.color_mode = "RGBA"
    r.image_settings.color_depth = "8"
    sc.view_settings.view_transform = cfg["render"]["viewTransform"]
    sc.view_settings.look = cfg["render"]["look"]
    return sc, turntable


def aim_camera(sc, cfg, focus_z):
    """Point the camera at height focus_z over the origin. The tilt is measured from the horizon."""
    rx = math.radians(90 - cfg["tilt"])
    sc.camera.rotation_euler = (rx, 0.0, 0.0)
    sc.camera.location = Vector((0.0, 0.0, focus_z)) - Vector((0.0, math.sin(rx), -math.cos(rx))) * 10


def use_cycles(sc, cfg):
    sc.render.engine = "CYCLES"
    sc.cycles.samples = cfg["render"]["samples"]
    sc.cycles.seed = cfg["render"]["seed"]
    sc.cycles.use_denoising = cfg["render"].get("denoise", True)
    sc.cycles.device = "CPU"
    if cfg["render"]["device"] == "GPU":
        prefs = bpy.context.preferences.addons["cycles"].preferences
        for kind in ("OPTIX", "CUDA", "HIP", "ONEAPI", "METAL"):
            try:
                prefs.compute_device_type = kind
            except TypeError:
                continue
            prefs.get_devices()
            gpus = [dv for dv in prefs.devices if dv.type == kind]
            if gpus:
                for dv in prefs.devices:
                    dv.use = dv.type == kind
                sc.cycles.device = "GPU"
                break


def use_mask_engine(sc, cfg):
    sc.render.engine = "BLENDER_EEVEE"
    sc.eevee.taa_render_samples = cfg["render"]["maskSamples"]


def origin_row(cfg, focus_z):
    """The frame row (px, from the top) where the figure's ground origin lands: the anchor the game draws at."""
    below_centre = focus_z * math.cos(math.radians(cfg["tilt"]))   # metres below the frame centre
    return cfg["frame"] / 2 + below_centre / cfg["orthoScale"] * cfg["frame"]


def _shot(sc, tmp):
    sc.render.filepath = tmp
    bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(tmp, check_existing=False)
    w, h = img.size
    a = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(a)
    bpy.data.images.remove(img)
    return a.reshape(h, w, 4)[::-1]   # Blender rows run bottom-up; ours run top-down


def frame_list(cfg, spec):
    """(animation, direction name, angle, frame index, phase, animation entry) for every cell of a character's sheet,
    in sheet order."""
    out = []
    for a in cfg["animationSets"][spec["animations"]]:
        for name, angle in cfg["directions"]:
            for i in range(a["frames"]):
                out.append((a["name"], name, angle, i, i / a["frames"], a))
    return out


def render_character(cfg, name, log=print, pick=None):
    """Renders one character. Returns (beauty, mask, shadows): beauty and mask are lists of float arrays (frame x
    frame x 4, rows top-down), mask is None for a character with no team colour, shadows says per frame whether the
    pixel pass adds the sheared shadow. pick: an optional filter on (animation, direction, frame), for previews."""
    spec = cfg["characters"][name]
    sc, turntable = setup_scene(cfg)
    mats = figure.build_materials(spec["palette"], cfg)
    fig = figure.build_figure(spec, mats, turntable)
    cells = [c for c in frame_list(cfg, spec) if pick is None or pick(c[0], c[1], c[3])]
    tmp = os.path.join(tempfile.gettempdir(), f"crew3d-{os.getpid()}.png")
    f, ss = cfg["frame"], cfg["supersample"]

    def run(label):
        frames = []
        for k, (anim, _dir, angle, _i, t, entry) in enumerate(cells):
            figure.apply(fig, anims.pose(fig.d, anim, t), anim)
            aim_camera(sc, cfg, entry.get("focusZ", cfg["focusZ"]))
            turntable.rotation_euler = (0.0, 0.0, math.radians(angle))
            frames.append(post.downsample(_shot(sc, tmp), f, ss))
            if k % 32 == 0:
                log(f"{name} {label} {k}/{len(cells)}")
        return frames

    use_cycles(sc, cfg)
    beauty = run("beauty")
    mask = None
    if spec["mask"]:
        white, black = figure.flat_material("crew3d.maskOn", 1.0), figure.flat_material("crew3d.maskOff", 0.0)
        for _seg, ob, accent, _shows in fig.parts:
            ob.data.materials[0] = white if accent else black
        use_mask_engine(sc, cfg)
        mask = run("mask")
    if os.path.exists(tmp):
        os.remove(tmp)
    return beauty, mask, [c[5].get("shadow", True) for c in cells]


def save_png(path, rgba8):
    """rgba8: uint8 (h, w, 4), rows top-down."""
    h, w = rgba8.shape[:2]
    img = bpy.data.images.new("crew3d.out", w, h, alpha=True)
    img.alpha_mode = "STRAIGHT"
    img.pixels.foreach_set((rgba8[::-1].astype(np.float32) / 255.0).ravel())
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)


def build(cfg, out_dir, meta_path, only=None, log=print):
    os.makedirs(out_dir, exist_ok=True)
    meta = {"frame": cfg["frame"], "columns": cfg["sheet"]["columns"], "directions": [d[0] for d in cfg["directions"]], "characters": {}}
    if only and os.path.exists(meta_path):   # a partial run keeps the other characters' entries
        with open(meta_path, encoding="utf8") as fh:
            meta["characters"] = json.load(fh).get("characters", {})
    for name, spec in cfg["characters"].items():
        if only and name not in only:
            continue
        beauty, mask, shadows = render_character(cfg, name, log)
        sets = cfg["animationSets"][spec["animations"]]
        sheet, mask_sheet, head_row = post.finish(beauty, mask, cfg, sets[0]["frames"] * len(cfg["directions"]), shadows)
        save_png(os.path.join(out_dir, f"{name}.png"), sheet)
        if mask_sheet is not None:
            save_png(os.path.join(out_dir, f"{name}.mask.png"), mask_sheet)
        start, entries = 0, []
        for a in cfg["animationSets"][spec["animations"]]:
            entries.append({"name": a["name"], "frames": a["frames"], "fps": a["fps"], "loop": a["loop"], "start": start,
                            "originRow": round(origin_row(cfg, a.get("focusZ", cfg["focusZ"])), 2)})
            start += a["frames"] * len(cfg["directions"])
        meta["characters"][name] = {"mask": bool(spec["mask"]), "headRow": head_row, "cells": start, "animations": entries}
        log(f"wrote {name}: {start} frames, sheet {sheet.shape[1]}x{sheet.shape[0]}")
    with open(meta_path, "w", encoding="utf8", newline="\n") as fh:
        json.dump(meta, fh, indent=2)
        fh.write("\n")


def preview(cfg, name, out_dir, cells, dirs, log=print):
    """A quick contact sheet: the chosen frames ("walk:0,walk:2") in the chosen directions, through the full pixel
    pass. One row per direction. Writes <name>-preview.png and, with a mask, <name>-preview.mask.png."""
    want = {(a, int(i)) for a, i in (c.split(":") for c in cells.split(","))}
    keep = set(dirs.split(","))
    pick = lambda a, d, i: (a, i) in want and d in keep   # noqa: E731
    beauty, mask, shadows = render_character(cfg, name, log, pick)
    listed = [c for c in frame_list(cfg, cfg["characters"][name]) if pick(c[0], c[1], c[3])]
    order = sorted(range(len(listed)), key=lambda k: [d[0] for d in cfg["directions"]].index(listed[k][1]))   # stable: rows by direction
    beauty = [beauty[k] for k in order]
    mask = [mask[k] for k in order] if mask is not None else None
    shadows = [shadows[k] for k in order]
    sheet, mask_sheet, _head = post.finish(beauty, mask, {**cfg, "sheet": {"columns": len(want)}}, len(beauty), shadows)
    os.makedirs(out_dir, exist_ok=True)
    save_png(os.path.join(out_dir, f"{name}-preview.png"), sheet)
    if mask_sheet is not None:
        save_png(os.path.join(out_dir, f"{name}-preview.mask.png"), mask_sheet)


def main(argv):
    args = argv[argv.index("--") + 1:] if "--" in argv else []
    if not args:
        raise SystemExit("usage: blender --background --python render.py -- <lookdev.json> [--only a,b] [--out dir] [--meta file]")
    with open(args[0], encoding="utf8") as fh:
        cfg = json.load(fh)
    opt = {args[i]: args[i + 1] for i in range(1, len(args) - 1, 2)}
    repo = os.path.dirname(os.path.dirname(HERE))
    if "--preview" in opt:
        for name in opt.get("--only", ",".join(cfg["characters"])).split(","):
            preview(cfg, name, opt["--preview"], opt.get("--cells", "idle:0"), opt.get("--dirs", "s,se,e,ne,n"))
        return
    build(cfg, opt.get("--out", os.path.join(repo, "public", "assets", "art", "crew3d")),
          opt.get("--meta", os.path.join(repo, "src", "renderer", "src", "render", "crew3d.generated.json")),
          set(opt["--only"].split(",")) if "--only" in opt else None)


if __name__ == "__main__":
    main(sys.argv)

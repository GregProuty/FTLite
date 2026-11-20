"""Crew3D: an original armoured figure built from primitives, and the skeleton solver that poses it.

No downloaded model: every part is made here, so the sheets are the project's own work. The figure stands at the
origin, Z up, facing -Y; its left side is +X. A pose is a dict of joint targets (see rest_pose); solve() turns it into
one frame (a 4x4 matrix) per body segment, and apply() moves every part to its segment. Parts are rigid: nothing is
skinned, the dark undersuit shows at the joints between the plates.
"""
import math

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

# ---------------------------------------------------------------------------------------------------------------------
# Materials


def _sock(sockets, identifier):
    return next(s for s in sockets if s.identifier == identifier)


def _mix_rgb(nodes, links, blend, fac, a, b):
    """A colour Mix node. fac, a and b are sockets or constants."""
    n = nodes.new("ShaderNodeMix")
    n.data_type = "RGBA"
    n.blend_type = blend
    for ident, v in (("Factor_Float", fac), ("A_Color", a), ("B_Color", b)):
        s = _sock(n.inputs, ident)
        if hasattr(v, "is_output"):
            links.new(v, s)
        elif isinstance(v, (int, float)):
            s.default_value = v
        else:
            s.default_value = (*v, 1.0)
    return _sock(n.outputs, "Result_Color")


def _map_range(nodes, links, value, from_min, from_max, to_min, to_max):
    n = nodes.new("ShaderNodeMapRange")
    links.new(value, n.inputs["Value"])
    n.inputs["From Min"].default_value = from_min
    n.inputs["From Max"].default_value = from_max
    n.inputs["To Min"].default_value = to_min
    n.inputs["To Max"].default_value = to_max
    return n.outputs["Result"]


def grit_material(name, look):
    """Worn, hammered metal: mottled base colour, grime in the creases, bare metal on the edges, noisy roughness."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nodes, links = nt.nodes, nt.links
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    tc = nodes.new("ShaderNodeTexCoord")
    info = nodes.new("ShaderNodeObjectInfo")
    off = nodes.new("ShaderNodeVectorMath")   # a per-part offset, so two parts never share one patch of noise
    off.operation = "ADD"
    scale = nodes.new("ShaderNodeVectorMath")
    scale.operation = "SCALE"
    scale.inputs[0].default_value = (17.0, 31.0, 23.0)
    links.new(info.outputs["Random"], scale.inputs["Scale"])
    links.new(tc.outputs["Object"], off.inputs[0])
    links.new(scale.outputs["Vector"], off.inputs[1])
    coord = off.outputs["Vector"]

    def noise(sc, detail, rough=0.5):
        n = nodes.new("ShaderNodeTexNoise")
        n.inputs["Scale"].default_value = sc
        n.inputs["Detail"].default_value = detail
        n.inputs["Roughness"].default_value = rough
        links.new(coord, n.inputs["Vector"])
        return n.outputs["Fac"]

    ao = nodes.new("ShaderNodeAmbientOcclusion")
    ao.inputs["Distance"].default_value = look["aoDistance"]
    grimed = _mix_rgb(nodes, links, "MIX", _map_range(nodes, links, ao.outputs["AO"], 0.3, 0.9, 0.0, 1.0), look["grime"], look["base"])
    geo = nodes.new("ShaderNodeNewGeometry")
    edge = nodes.new("ShaderNodeValToRGB")
    edge.color_ramp.elements[0].position = look["wearRamp"][0]
    edge.color_ramp.elements[1].position = look["wearRamp"][1]
    links.new(geo.outputs["Pointiness"], edge.inputs["Fac"])
    wear = nodes.new("ShaderNodeMath")
    wear.operation = "MULTIPLY"
    links.new(edge.outputs["Color"], wear.inputs[0])
    links.new(_map_range(nodes, links, noise(70, 10), 0.4, 0.6, 0.0, 1.0), wear.inputs[1])
    amt = nodes.new("ShaderNodeMath")
    amt.operation = "MULTIPLY"
    amt.inputs[1].default_value = look["wear"]
    links.new(wear.outputs[0], amt.inputs[0])
    bared = _mix_rgb(nodes, links, "MIX", amt.outputs[0], grimed, look["bare"])
    mottle = _map_range(nodes, links, noise(14, 6, 0.7), 0.3, 0.7, look["mottle"][0], look["mottle"][1])
    links.new(_mix_rgb(nodes, links, "MULTIPLY", 1.0, bared, mottle), bsdf.inputs["Base Color"])
    rough = nodes.new("ShaderNodeMix")
    rough.data_type = "FLOAT"
    links.new(amt.outputs[0], _sock(rough.inputs, "Factor_Float"))
    links.new(_map_range(nodes, links, noise(25, 8), 0.0, 1.0, look["roughness"][0], look["roughness"][1]), _sock(rough.inputs, "A_Float"))
    _sock(rough.inputs, "B_Float").default_value = 0.25
    links.new(_sock(rough.outputs, "Result_Float"), bsdf.inputs["Roughness"])
    bsdf.inputs["Metallic"].default_value = look["metallic"]
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = look["bump"]
    bump.inputs["Distance"].default_value = 0.02
    links.new(noise(90, 4), bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return m


def plain_material(name, base, metallic, roughness, emission=None, strength=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*base, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
        bsdf.inputs["Emission Strength"].default_value = strength
    return m


def flat_material(name, value):
    """Mask pass: unlit white (a team-colour part) or black (anything else; it still hides what is behind it)."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (value, value, value, 1.0)
    nt.links.new(em.outputs[0], out.inputs["Surface"])
    return m


def build_materials(palette, look):
    """palette: the character's colours from the config. Returns the materials by role."""
    mats = {}
    for role in ("steel", "accent", "trim"):
        mats[role] = grit_material(f"crew3d.{role}", {**look["grit"], **palette[role]})
    mats["suit"] = plain_material("crew3d.suit", palette["suit"], 0.0, 0.5)
    mats["dark"] = plain_material("crew3d.dark", palette["dark"], 0.3, 0.4)
    mats["leather"] = plain_material("crew3d.leather", palette["leather"], 0.0, 0.6)
    mats["glow"] = plain_material("crew3d.glow", palette["glow"], 0.0, 0.5, palette["glow"], palette["glowStrength"])
    mats["red"] = plain_material("crew3d.red", (0.45, 0.04, 0.03), 0.2, 0.45)
    mats["spark"] = plain_material("crew3d.spark", (1.0, 0.75, 0.3), 0.0, 0.5, (1.0, 0.7, 0.25), 6.0)
    return mats


# ---------------------------------------------------------------------------------------------------------------------
# Meshes (bmesh only: no bpy.ops, so it runs headless without a context)


def _finish(name, bm, mat, bevel):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    me.materials.append(mat)
    if bevel > 0:
        b = ob.modifiers.new("Bevel", "BEVEL")
        b.width = bevel
        b.segments = 3
        b.limit_method = "ANGLE"
        b.angle_limit = math.radians(40)
    return ob


def _turn(bm, rot, at):
    if rot:
        bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Euler(tuple(math.radians(a) for a in rot)).to_matrix(), verts=bm.verts)
    if at:
        bmesh.ops.translate(bm, vec=at, verts=bm.verts)


def tube(name, mat, r_top, r_bot, length, z0=0.0, flat=1.0, bevel=0.008, segments=20, rot=None, at=None):
    """A tapered cylinder hanging down the segment: from z = -z0 to z = -(z0 + length). flat squashes it front to back.
    rot (XYZ degrees, about the origin) and then at (an offset) place it elsewhere."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segments, radius1=r_bot, radius2=r_top, depth=length)
    bmesh.ops.scale(bm, vec=(1.0, flat, 1.0), verts=bm.verts)
    bmesh.ops.translate(bm, vec=(0.0, 0.0, -(z0 + length / 2)), verts=bm.verts)
    _turn(bm, rot, at)
    return _finish(name, bm, mat, bevel)


def ball(name, mat, radius, scale=(1.0, 1.0, 1.0), centre=(0.0, 0.0, 0.0)):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=14, radius=radius)
    bmesh.ops.scale(bm, vec=scale, verts=bm.verts)
    bmesh.ops.translate(bm, vec=centre, verts=bm.verts)
    return _finish(name, bm, mat, 0.0)


def rbox(name, mat, size, centre=(0.0, 0.0, 0.0), bevel=0.02, rot=None):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=size, verts=bm.verts)
    bmesh.ops.translate(bm, vec=centre, verts=bm.verts)
    _turn(bm, rot, None)   # about the segment origin, after placing
    return _finish(name, bm, mat, bevel)


def spike(name, mat, radius, length, base, direction):
    """A cone from `base` pointing along `direction`."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=12, radius1=radius, radius2=0.0, depth=length)
    bmesh.ops.translate(bm, vec=(0.0, 0.0, length / 2), verts=bm.verts)
    q = Vector((0, 0, 1)).rotation_difference(Vector(direction).normalized())
    bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=q.to_matrix(), verts=bm.verts)
    bmesh.ops.translate(bm, vec=base, verts=bm.verts)
    return _finish(name, bm, mat, 0.0)


# ---------------------------------------------------------------------------------------------------------------------
# The figure


class Figure:
    """The parts of one character, and its proportions. parts: (segment, object, accent, shows) where `shows` is None
    (always) or the set of animation names the part is drawn in (tools)."""

    def __init__(self, dims, root):
        self.d = dims
        self.root = root
        self.parts = []

    def add(self, segment, ob, accent=False, shows=None):
        bpy.context.scene.collection.objects.link(ob)
        ob.parent = self.root
        self.parts.append((segment, ob, accent, shows))
        return ob


def build_figure(spec, mats, root):
    """spec: the character block of the config (proportions and kit). Lengths in metres."""
    d = dict(spec["dims"])
    f = Figure(d, root)
    g = d["girth"]            # limb and torso thickness multiplier
    sw, hw = d["shoulderW"], d["hipW"]
    kit = spec["kit"]
    acc = set(kit["accent"])  # which pieces carry the team colour

    def mat(piece, default="steel"):
        return mats["accent"] if piece in acc else mats[default]

    def add(seg, piece, ob, shows=None):
        f.add(seg, ob, piece in acc, shows)

    # pelvis and belly
    add("pelvis", "hips", rbox("hips", mat("hips"), (0.30 * g, 0.20 * g, 0.17), (0, 0, -0.01), 0.05))
    add("pelvis", "belt", tube("belt", mats["leather"], 0.165 * g, 0.17 * g, 0.055, -0.115, 0.72))
    add("pelvis", "buckle", rbox("buckle", mats["trim"], (0.07, 0.03, 0.05), (0, -0.125 * g, 0.085), 0.008))
    add("pelvis", "belly", tube("belly", mats["suit"], 0.135 * g, 0.15 * g, d["spine"], -d["spine"] - 0.02, 0.74))
    # chest: the breastplate, a collar, a pack on the back
    ch = d["chest"]
    add("chest", "chest", ball("chest", mat("chest"), 1.0, (0.215 * g * sw / 0.21, 0.15 * g, ch * 0.66), (0, -0.005, ch * 0.5)))
    add("chest", "collar", tube("collar", mats["steel"], 0.085, 0.11, 0.05, -ch - 0.03, 0.9))
    add("chest", "core", rbox("core", mats["glow"], (0.05, 0.02, 0.035), (0, -0.148 * g, ch * 0.62), 0.006))
    if kit["pack"] == "large":
        add("chest", "pack", rbox("pack", mat("pack"), (0.26, 0.13, 0.32), (0, 0.17 * g, ch * 0.55), 0.03))
        add("chest", "packLight", rbox("packLight", mats["glow"], (0.14, 0.02, 0.03), (0, 0.24 * g, ch * 0.8), 0.005))
    elif kit["pack"] == "small":
        add("chest", "pack", rbox("pack", mat("pack"), (0.18, 0.10, 0.20), (0, 0.16 * g, ch * 0.6), 0.03))
        add("chest", "tank", tube("tank", mats["trim"], 0.035, 0.035, 0.24, -ch * 0.95, at=(0.125, 0.15 * g, 0.0)))
    # head
    hr = d["head"]
    add("head", "neck", tube("neck", mats["suit"], 0.05, 0.055, 0.07, -0.05))
    add("head", "helmet", ball("helmet", mat("helmet"), hr, (1.0, 1.1, 1.05), (0, 0, hr + 0.01)))
    if kit["helmet"] == "crest":
        add("head", "visor", rbox("visor", mats["glow"], (hr * 1.25, 0.05, 0.04), (0, -hr * 0.92, hr + 0.015), 0.01))
        add("head", "crest", rbox("crest", mat("crest"), (0.025, hr * 1.7, 0.06), (0, 0.01, hr * 2.02), 0.01))
    elif kit["helmet"] == "dome":
        add("head", "visor", rbox("visor", mats["glow"], (hr * 1.5, 0.06, 0.07), (0, -hr * 0.86, hr + 0.02), 0.02))
        for s in (1, -1):
            add("head", "ear", ball("ear", mats["trim"], 0.035, (0.7, 1.0, 1.0), (s * hr * 0.98, 0.0, hr + 0.01)))
        add("head", "antenna", tube("antenna", mats["dark"], 0.006, 0.006, 0.13, -(hr * 2 + 0.11), bevel=0.0, segments=8, at=(hr * 0.9, 0.02, 0.0)))
    elif kit["helmet"] == "horned":
        add("head", "visor", rbox("visor", mats["glow"], (hr * 1.1, 0.05, 0.025), (0, -hr * 0.95, hr + 0.02), 0.006))
        add("head", "jaw", rbox("jaw", mats["trim"], (hr * 1.0, 0.07, 0.06), (0, -hr * 0.75, hr * 0.45), 0.015))
        for s in (1, -1):
            add("head", "horn", spike("horn", mats["trim"], 0.03, 0.17, (s * hr * 0.75, 0.0, hr * 1.5), (s * 0.8, -0.15, 1.0)))
    # arms
    ua, fa = d["upperArm"], d["foreArm"]
    for side, s in (("L", 1), ("R", -1)):
        add("upperArm" + side, "shoulders", ball("pad" + side, mat("shoulders"), 1.0, (0.095 * g, 0.10 * g, 0.07), (s * 0.02, 0, 0.02)))
        add("upperArm" + side, "arm", tube("arm" + side, mats["suit"], 0.055 * g, 0.05 * g, ua))
        add("upperArm" + side, "sleeve", tube("sleeve" + side, mat("sleeve"), 0.066 * g, 0.06 * g, ua * 0.52, ua * 0.3))
        add("foreArm" + side, "elbow", ball("elbow" + side, mats["suit"], 0.054 * g))
        add("foreArm" + side, "fore", tube("fore" + side, mats["suit"], 0.048 * g, 0.04 * g, fa))
        add("foreArm" + side, "gauntlet", tube("gauntlet" + side, mat("gauntlet"), 0.06 * g, 0.05 * g, fa * 0.68, fa * 0.22))
        add("hand" + side, "glove", rbox("glove" + side, mats["dark"], (0.075, 0.055, 0.10), (0, 0, -0.045), 0.02))
        if kit.get("spikes"):
            add("upperArm" + side, "spike", spike("spike" + side, mats["trim"], 0.03, 0.14, (s * 0.07, 0, 0.06), (s * 1.0, 0, 0.8)))
            add("upperArm" + side, "spike", spike("spikeB" + side, mats["trim"], 0.025, 0.10, (s * 0.02, 0.07, 0.07), (s * 0.3, 0.6, 1.0)))
    # legs
    th, sh = d["thigh"], d["shin"]
    for side, s in (("L", 1), ("R", -1)):
        add("thigh" + side, "leg", tube("leg" + side, mats["suit"], 0.085 * g, 0.066 * g, th))
        add("thigh" + side, "cuisse", tube("cuisse" + side, mat("cuisse"), 0.097 * g, 0.082 * g, th * 0.6, th * 0.14))
        add("shin" + side, "knees", ball("knee" + side, mat("knees"), 0.072 * g, (1.0, 1.05, 1.0), (0, -0.01, 0)))
        add("shin" + side, "calf", tube("calf" + side, mats["suit"], 0.062 * g, 0.05 * g, sh))
        add("shin" + side, "greave", tube("greave" + side, mat("greave"), 0.078 * g, 0.064 * g, sh * 0.68, sh * 0.2))
        add("foot" + side, "boot", rbox("boot" + side, mat("boot"), (0.115 * g, 0.27, 0.10), (0, -0.06, -0.03), 0.035))
        add("foot" + side, "ankle", ball("ankle" + side, mats["suit"], 0.055 * g))
    # kit on the body and tools in the hand
    if kit.get("holster"):
        add("thighR", "holster", rbox("holster", mats["dark"], (0.04, 0.09, 0.16), (-0.1 * g, -0.01, -th * 0.42), 0.012))
    if kit.get("blade"):
        tilt = (30, 0, 0)   # the blade points forward and a little down from a hanging arm
        add("handR", "hilt", rbox("hilt", mats["leather"], (0.03, 0.16, 0.03), (0, -0.01, -0.05), 0.006, tilt))
        add("handR", "blade", rbox("blade", mats["trim"], (0.022, 0.62, 0.11), (0, -0.41, -0.05), 0.006, tilt))
        add("handR", "guard", rbox("guard", mats["dark"], (0.03, 0.03, 0.16), (0, -0.09, -0.05), 0.006, tilt))
    if kit.get("tools"):
        # tools lie along the forearm (local -Z), so they point where the arm reaches
        add("handR", "welder", rbox("welder", mats["dark"], (0.04, 0.05, 0.20), (0, -0.03, -0.12), 0.01), {"repair"})
        add("handR", "weldTip", ball("weldTip", mats["spark"], 0.024, centre=(0, -0.03, -0.235)), {"repair"})
        add("handR", "extinguisher", tube("extinguisher", mats["red"], 0.05, 0.05, 0.26, -0.06, bevel=0.015, at=(0.07, 0.0, 0.0)), {"firefight"})
        add("handR", "nozzle", spike("nozzle", mats["dark"], 0.035, 0.14, (0.07, 0.0, -0.20), (0, 0, -1)), {"firefight"})
    return f


# ---------------------------------------------------------------------------------------------------------------------
# Skeleton


def rest_pose(d):
    """Standing, arms relaxed. Positions are in the figure's space (metres); rotations are XYZ Euler degrees, where a
    positive X turn leans forward and a positive Z turn yaws to the figure's left."""
    hip_h = d["ankle"] + d["shin"] + d["thigh"] + 0.03 - 0.008   # the hip joint sits 0.03 under the pelvis; knees a touch bent
    return {
        "pelvis": [0.0, 0.0, hip_h], "pelvisRot": [0.0, 0.0, 0.0], "chestRot": [0.0, 0.0, 0.0], "headRot": [0.0, 0.0, 0.0],
        "footL": [d["hipW"] + 0.01, 0.0, d["ankle"]], "footR": [-d["hipW"] - 0.01, 0.0, d["ankle"]],
        "footRotL": [0.0, 0.0, 6.0], "footRotR": [0.0, 0.0, -6.0],
        "kneeL": [0.15, -1.0, 0.0], "kneeR": [-0.15, -1.0, 0.0],
        "handL": [d["shoulderW"] + 0.035, -0.04, hip_h - 0.03], "handR": [-d["shoulderW"] - 0.035, -0.04, hip_h - 0.03],
        "elbowL": [0.2, 1.0, -0.2], "elbowR": [-0.2, 1.0, -0.2],
        "global": None,
    }


def _rot(deg):
    return Euler(tuple(math.radians(a) for a in deg), "XYZ").to_matrix().to_4x4()


def _frame(p0, p1, back):
    """A segment's frame: origin at p0, local -Z toward p1, local +Y as near `back` as it can be."""
    z = (p0 - p1).normalized()
    y = back - back.dot(z) * z
    if y.length < 1e-5:
        y = Vector((0.0, 1.0, 0.0)) - z.y * z
    y.normalize()
    x = y.cross(z)
    m = Matrix((x, y, z)).transposed().to_4x4()
    m.translation = p0
    return m


def _ik(a, target, l1, l2, pole):
    """Two-bone IK: the middle joint and the reachable end for a limb from `a` toward `target`, bending toward `pole`."""
    v = target - a
    dist = max(min(v.length, (l1 + l2) * 0.999), abs(l1 - l2) + 1e-4)
    n = v.normalized()
    a1 = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist)
    h = math.sqrt(max(l1 * l1 - a1 * a1, 0.0))
    p = pole - pole.dot(n) * n
    if p.length < 1e-5:
        p = Vector((0.0, -1.0, 0.0))
    p.normalize()
    return a + n * a1 + p * h, a + n * dist


def solve(d, pose):
    """The frame of every segment for a pose."""
    fr = {}
    pelvis = Matrix.Translation(pose["pelvis"]) @ _rot(pose["pelvisRot"])
    chest = pelvis @ Matrix.Translation((0, 0, d["spine"])) @ _rot(pose["chestRot"])
    head = chest @ Matrix.Translation((0, 0, d["chest"] + d["neck"])) @ _rot(pose["headRot"])
    fr["pelvis"], fr["chest"], fr["head"] = pelvis, chest, head
    yaw = Matrix.Rotation(math.radians(pose["pelvisRot"][2]), 4, "Z")
    for side, s in (("L", 1), ("R", -1)):
        hip = pelvis @ Vector((s * d["hipW"], 0.0, -0.03))
        knee_pole = yaw @ Vector(pose["knee" + side])
        knee, ankle = _ik(hip, Vector(pose["foot" + side]), d["thigh"], d["shin"], knee_pole)
        fr["thigh" + side] = _frame(hip, knee, -knee_pole)
        fr["shin" + side] = _frame(knee, ankle, -knee_pole)
        fr["foot" + side] = Matrix.Translation(ankle) @ yaw @ _rot(pose["footRot" + side])
        shoulder = chest @ Vector((s * d["shoulderW"], 0.0, d["chest"] - 0.05))
        elbow_pole = yaw @ Vector(pose["elbow" + side])
        elbow, wrist = _ik(shoulder, Vector(pose["hand" + side]), d["upperArm"], d["foreArm"], elbow_pole)
        fr["upperArm" + side] = _frame(shoulder, elbow, elbow_pole)
        fr["foreArm" + side] = _frame(elbow, wrist, elbow_pole)
        hand = fr["foreArm" + side].copy()
        hand.translation = wrist
        fr["hand" + side] = hand
    if pose.get("global") is not None:
        for k in fr:
            fr[k] = pose["global"] @ fr[k]
    return fr


def apply(figure, pose, anim):
    """Move every part to its segment for this pose; tools show only in their own animations."""
    fr = solve(figure.d, pose)
    for segment, ob, _accent, shows in figure.parts:
        ob.matrix_local = fr[segment]
        ob.hide_render = shows is not None and anim not in shows
        ob.hide_viewport = ob.hide_render

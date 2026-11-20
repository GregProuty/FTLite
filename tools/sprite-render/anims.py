"""Crew3D: procedural animations. pose(dims, name, t) gives the pose (see figure.rest_pose) at phase t in [0, 1) of a
loop. Everything is a closed-form curve of t, so a re-run gives the same frames. The figure faces -Y; +X is its left."""
import math

from mathutils import Matrix

from figure import rest_pose

TAU = 2 * math.pi


def _add(p, key, dx=0.0, dy=0.0, dz=0.0):
    p[key] = [p[key][0] + dx, p[key][1] + dy, p[key][2] + dz]


def idle(d, t):
    p = rest_pose(d)
    b = math.sin(TAU * t)
    _add(p, "pelvis", dz=-0.008 + 0.008 * b)                 # breathing: a slow sink and rise
    p["chestRot"] = [1.5 - 1.5 * b, 0.0, 0.0]
    p["headRot"] = [2.0, 0.0, 4.0 * math.sin(TAU * t + 1.0)]  # a slight look about
    for side, s in (("L", 1), ("R", -1)):
        _add(p, "hand" + side, dx=s * 0.008 * b, dz=0.01 * b)
    return p


def walk(d, t):
    p = rest_pose(d)
    th = TAU * t
    stride, lift, drop, bob = 0.26, 0.11, 0.05, 0.015
    _add(p, "pelvis", dx=0.012 * math.sin(th), dz=-drop + bob * math.cos(2 * th))
    p["pelvisRot"] = [3.0, 0.0, 6.0 * math.cos(th)]
    p["chestRot"] = [4.0, 0.0, -12.0 * math.cos(th)]          # the shoulders counter the hips
    p["headRot"] = [-4.0, 0.0, 6.0 * math.cos(th)]
    for side, s, ph in (("L", 1, 0.0), ("R", -1, math.pi)):
        a = th + ph
        up = max(0.0, -math.sin(a))                           # the foot is off the ground while it swings forward
        _add(p, "foot" + side, dy=-stride * math.cos(a), dz=lift * up)
        p["footRot" + side] = [28.0 * up - 10.0 * max(0.0, math.cos(a)) * (1 - up), 0.0, p["footRot" + side][2]]
        # the arm swings against its own leg
        _add(p, "hand" + side, dx=-s * 0.02, dy=0.17 * math.cos(a), dz=-drop + 0.04 * abs(math.cos(a)))
    return p


def work(d, t):
    """Standing at a console: both hands forward at waist height, tapping in turn."""
    p = rest_pose(d)
    h = p["pelvis"][2]
    _add(p, "pelvis", dy=0.02)
    p["chestRot"] = [8.0, 0.0, 0.0]
    p["headRot"] = [14.0, 0.0, 5.0 * math.sin(TAU * t)]
    for side, s, ph in (("L", 1, 0.0), ("R", -1, math.pi)):
        tap = max(0.0, math.sin(TAU * t + ph))
        p["hand" + side] = [s * (0.13 + 0.03 * math.cos(TAU * t + ph)), -0.36, h + 0.16 - 0.05 * tap]
        p["elbow" + side] = [s * 0.8, 0.6, -0.6]
    return p


def repair(d, t):
    """Kneeling on the right knee, welding low in front."""
    p = rest_pose(d)
    b = math.sin(TAU * t)
    p["pelvis"] = [0.0, 0.03, 0.50 + 0.008 * b]
    p["pelvisRot"] = [6.0, 0.0, 0.0]
    p["chestRot"] = [22.0, 0.0, 0.0]
    p["headRot"] = [16.0, 0.0, 0.0]
    p["footL"] = [0.13, -0.27, d["ankle"]]
    p["kneeL"] = [0.2, -1.0, 0.6]
    p["footR"] = [-0.12, 0.36, 0.10]
    p["footRotR"] = [70.0, 0.0, 0.0]                          # toes on the deck
    p["kneeR"] = [-0.1, -1.0, -0.9]
    p["handR"] = [-0.06, -0.44, 0.42 + 0.03 * b]
    p["handL"] = [0.16, -0.38, 0.50]
    p["elbowL"], p["elbowR"] = [0.9, 0.5, -0.3], [-0.9, 0.5, -0.3]
    return p


def firefight(d, t):
    """Braced, both arms out with the extinguisher, sweeping side to side."""
    p = rest_pose(d)
    sw = math.sin(TAU * t)
    h = p["pelvis"][2]
    _add(p, "pelvis", dy=0.03, dz=-0.07)
    p["pelvisRot"] = [4.0, 0.0, 6.0 * sw]
    p["chestRot"] = [10.0, 0.0, 14.0 * sw]
    p["headRot"] = [4.0, 0.0, 6.0 * sw]
    _add(p, "footL", dy=-0.17)
    _add(p, "footR", dy=0.17)
    x = 0.20 * sw
    p["handR"] = [-0.08 + x, -0.50, h + 0.10]
    p["handL"] = [0.07 + x, -0.44, h + 0.07]
    p["elbowL"], p["elbowR"] = [0.9, 0.4, -0.5], [-0.9, 0.4, -0.5]
    return p


def down(d, _t):
    """Lying on the back with the knees drawn up, so the body fits the frame in every direction. The body is posed
    upright, then laid down; the config aims the camera at the floor for this one (focusZ 0)."""
    p = rest_pose(d)
    h = p["pelvis"][2]
    p["headRot"] = [-6.0, 0.0, 20.0]
    p["chestRot"] = [0.0, 0.0, 5.0]
    p["footL"], p["footR"] = [0.17, -0.02, h - 0.40], [-0.20, -0.04, h - 0.46]
    p["footRotL"], p["footRotR"] = [80.0, 0.0, 12.0], [60.0, 0.0, -25.0]   # soles toward the deck
    p["handL"] = [0.50, -0.02, h + 0.36]
    p["handR"] = [-0.10, -0.20, h + 0.10]                                  # one arm across the belly
    p["elbowL"], p["elbowR"] = [0.4, -0.1, -1.0], [-1.0, -0.2, -0.3]
    # up becomes "toward +Y" and the chest faces the sky; the hips rest a little behind the origin so the body is centred
    p["global"] = Matrix.Translation((0.0, -h - 0.19, 0.13)) @ Matrix.Rotation(math.radians(-90), 4, "X")
    return p


def attack(d, t):
    """An overhead chop with the right arm: raise, strike, recover. A short lunge goes with the strike."""
    p = rest_pose(d)
    h = p["pelvis"][2]
    # s: 0 = blade raised behind the head, 1 = blade down in front
    if t < 0.45:
        s = 0.0 + 0.08 * math.sin(math.pi * t / 0.45)        # held high, a small wind-up
    elif t < 0.65:
        u = (t - 0.45) / 0.20
        s = u * u * (3 - 2 * u)                               # the strike, fast
    else:
        u = (t - 0.65) / 0.35
        s = 1.0 - u * u * (3 - 2 * u)                         # recover
    lunge = 0.12 * s
    _add(p, "pelvis", dy=-lunge, dz=-0.05 - 0.05 * s)
    p["pelvisRot"] = [2.0 + 8.0 * s, 0.0, -10.0 + 14.0 * s]
    p["chestRot"] = [-6.0 + 26.0 * s, 0.0, -14.0 + 24.0 * s]
    p["headRot"] = [-2.0 - 6.0 * s, 0.0, 6.0]
    _add(p, "footL", dy=-0.16 - lunge)
    _add(p, "footR", dy=0.16)
    hi, lo = (-0.26, 0.14, h + 0.78), (-0.05, -0.50 - lunge, h + 0.02)
    p["handR"] = [hi[i] + (lo[i] - hi[i]) * s for i in range(3)]
    p["elbowR"] = [-1.0, 0.3 + 0.5 * s, 0.4 - 0.9 * s]
    p["handL"] = [0.20, -0.30 - lunge, h + 0.25 - 0.10 * s]  # the off hand guards
    p["elbowL"] = [0.9, 0.4, -0.5]
    return p


ANIMS = {"idle": idle, "walk": walk, "work": work, "repair": repair, "firefight": firefight, "down": down, "attack": attack}


def pose(d, name, t):
    return ANIMS[name](d, t)

"""Crew3D pixel pass (numpy only, so it runs inside Blender's Python): supersampled frames -> hard-edged frames in
one small shared palette, with a flat sheared shadow, packed into a sheet. All settings come from the config's
"pixelPass" block. Arrays are float32 or uint8, rows top-down."""
import numpy as np


def downsample(a, frame, ss):
    """Box-filter a (frame*ss)^2 RGBA image to frame^2, alpha-weighted so edges keep their own colour."""
    a = a.astype(np.float32).copy()
    a[..., :3] *= a[..., 3:4]
    s = a.reshape(frame, ss, frame, ss, 4).mean(axis=(1, 3))
    al = s[..., 3:4]
    s[..., :3] = np.where(al > 1e-6, s[..., :3] / np.maximum(al, 1e-6), 0.0)
    return s


def median_cut(colors, weights, k):
    """colors: (n, 3) unique uint8 colours; weights: their pixel counts. Returns a (<= k, 3) uint8 palette."""
    c = colors.astype(np.float64)
    boxes = [np.arange(len(c))]
    while len(boxes) < k:
        best, score = -1, 0.0
        for i, idx in enumerate(boxes):
            if len(idx) < 2:
                continue
            span = (c[idx].max(axis=0) - c[idx].min(axis=0)).max()
            sc = span * weights[idx].sum()
            if sc > score:
                best, score = i, sc
        if best < 0:
            break
        idx = boxes.pop(best)
        axis = int(np.argmax(c[idx].max(axis=0) - c[idx].min(axis=0)))
        order = idx[np.argsort(c[idx, axis], kind="stable")]
        cum = np.cumsum(weights[order])
        cut = int(np.searchsorted(cum, cum[-1] / 2.0))
        cut = min(max(cut, 1), len(order) - 1)
        boxes += [order[:cut], order[cut:]]
    pal = np.array([np.average(c[idx], axis=0, weights=weights[idx]) for idx in boxes])
    return np.clip(np.rint(pal), 0, 255).astype(np.uint8)


def quantise(rgb8, opaque, pp):
    """Map every opaque pixel to the nearest colour of one shared palette. rgb8: (..., 3) uint8."""
    px = rgb8[opaque]
    uniq, inverse, counts = np.unique(px, axis=0, return_inverse=True, return_counts=True)
    weights = counts.astype(np.float64)
    sat = uniq.max(axis=1).astype(int) - uniq.min(axis=1).astype(int)
    weights[sat > pp["accentSaturation"]] *= pp["accentWeight"]   # keep small bright accents (the visor glow)
    pal = median_cut(uniq, weights, pp["colors"])
    nearest = np.empty(len(uniq), dtype=np.int64)
    for i in range(0, len(uniq), 4096):
        d = uniq[i:i + 4096, None, :].astype(np.int32) - pal[None, :, :].astype(np.int32)
        nearest[i:i + 4096] = np.argmin((d * d).sum(axis=2), axis=1)
    out = rgb8.copy()
    out[opaque] = pal[nearest][inverse.reshape(-1)]
    return out, len(pal)


def shadow(opaque, pp):
    """The Diablo 2 trick: the frame's own silhouette, flattened and sheared along the floor. Returns a uint8 alpha."""
    f = opaque.shape[0]
    sh = np.zeros((f, f), dtype=np.uint8)
    ys, xs = np.nonzero(opaque)
    if len(ys) == 0:
        return sh
    h = ys.max() - ys
    ny = np.rint(ys.max() - h * pp["shadow"]["keepY"]).astype(int)
    for dx in (0, 1):   # two columns close the gaps the shear opens
        nx = np.rint(xs + h * pp["shadow"]["shiftX"]).astype(int) + dx
        ok = (nx >= 0) & (nx < f)
        sh[ny[ok], nx[ok]] = pp["shadow"]["alpha"]
    return sh


def pack(cells, frame, columns):
    rows = -(-len(cells) // columns)
    sheet = np.zeros((rows * frame, columns * frame, 4), dtype=np.uint8)
    for i, c in enumerate(cells):
        y, x = (i // columns) * frame, (i % columns) * frame
        sheet[y:y + frame, x:x + frame] = c
    return sheet


def finish(beauty, mask, cfg, head_cells, shadows):
    """beauty, mask: lists of downsampled float frames (mask may be None); shadows: per frame, add the sheared shadow
    or not. Returns (sheet, mask sheet or None, head row): head row is the highest opaque row over the first
    head_cells frames (the idle animation)."""
    pp, f = cfg["pixelPass"], cfg["frame"]
    stack = np.stack(beauty)
    opaque = stack[..., 3] >= pp["alphaCut"]
    rgb8 = np.rint(np.clip(stack[..., :3], 0.0, 1.0) ** pp["gamma"] * 255).astype(np.uint8)
    rgb8, colours = quantise(rgb8, opaque, pp)
    cells, mask_cells = [], []
    for i in range(len(beauty)):
        o = opaque[i]
        cell = np.zeros((f, f, 4), dtype=np.uint8)
        if shadows[i]:
            cell[..., 3] = shadow(o, pp)    # the shadow first, black
        cell[o, :3] = rgb8[i][o]
        cell[o, 3] = 255
        cells.append(cell)
        if mask is not None:
            on = o & (mask[i][..., 0] * mask[i][..., 3] >= 0.5)
            lum = rgb8[i].astype(np.float32) @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
            grey = np.clip(np.rint(lum * pp["maskGain"]), 0, 255).astype(np.uint8)
            m = np.zeros((f, f, 4), dtype=np.uint8)
            m[on, 0] = m[on, 1] = m[on, 2] = grey[on]
            m[on, 3] = 255
            mask_cells.append(m)
    tops = [np.nonzero(opaque[i].any(axis=1))[0] for i in range(min(head_cells, len(beauty)))]
    head_row = int(min(t[0] for t in tops if len(t)))
    cols = cfg["sheet"]["columns"]
    return pack(cells, f, cols), (pack(mask_cells, f, cols) if mask is not None else None), head_row

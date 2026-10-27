"""Builds the Blemia 3D logo scene and Blemi, exports design/blemia/blemi-raw.glb.

Run headless, then compress for the web (keep the named nodes the hero drives):
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
    --python scripts/blender/build_blemi.py -- <repo-root> [preview.png]
  npx @gltf-transform/cli@4 optimize design/blemia/blemi-raw.glb public/models/blemi.glb \
    --compress meshopt --flatten false --join false --simplify false --instance false --palette false --prune-attributes false --texture-compress false

Blemi is a rigid-part robot: parts are parented in a node hierarchy and animated
by transforms, so no skinning is needed. The head is a separate group under the
root, so it can pop off and become the final "a". The screen is a UV-mapped
mesh named "Screen"; the web scene draws the face on it with a shader.
"""
import json
import math
import os
import sys

import addon_utils
import bpy
from mathutils import Vector

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ROOT = ARGS[0] if ARGS else os.getcwd()
PREVIEW = ARGS[1] if len(ARGS) > 1 else None
FONT = '/System/Library/Fonts/Supplemental/Arial Rounded Bold.ttf'
FONT_FALLBACK = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'
MARK_SVG = os.path.join(ROOT, 'design/blemia/blemia-mark.svg')
OUT_GLB = os.path.join(ROOT, 'design/blemia/blemi-raw.glb')
OUT_JSON = os.path.join(ROOT, 'src/components/blemi/blemi-rig.json')
FPS = 30

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.name = 'blemi_timeline'
scene.render.fps = FPS


# ---------------------------------------------------------------- materials
def linear(hex_color):
    def ch(v):
        v /= 255
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    h = hex_color.lstrip('#')
    return (ch(int(h[0:2], 16)), ch(int(h[2:4], 16)), ch(int(h[4:6], 16)), 1.0)


def material(name, color, roughness=0.35, metallic=0.0, coat=0.0, emission=None, strength=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    def put(key, value):
        if key in bsdf.inputs:
            bsdf.inputs[key].default_value = value
    put('Base Color', linear(color))
    put('Roughness', roughness)
    put('Metallic', metallic)
    put('Coat Weight', coat)
    put('Coat Roughness', 0.12)
    if emission:
        put('Emission Color', linear(emission))
        put('Emission Strength', strength)
    return m


M = {
    'emerald': material('BlemiEmerald', '#10B981', 0.3, coat=0.7),
    'royal': material('BlemiRoyal', '#1E47C8', 0.3, coat=0.7),
    'white': material('BlemiWhite', '#F3F5F8', 0.34, coat=0.5),
    'silver': material('BlemiSilver', '#C7CDD6', 0.26, metallic=1.0),
    'screen': material('BlemiScreen', '#060A14', 0.12, coat=1.0),
    'mint': material('BlemiMint', '#5EEAD4', 0.3, emission='#5EEAD4', strength=3.0),
    'socket': material('BlemiSocket', '#1F2937', 0.5),
}


# ---------------------------------------------------------------- geometry helpers
def finish(obj, mat, name, bevel=0.0, segments=4):
    obj.name = name
    obj.data.name = name
    if bevel > 0:
        mod = obj.modifiers.new('bevel', 'BEVEL')
        mod.width = bevel
        mod.segments = segments
        mod.limit_method = 'NONE'
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for mod in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.ops.object.shade_smooth()
    obj.select_set(False)
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return obj


def box(name, size, loc, mat, bevel):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object
    o.scale = size
    return finish(o, mat, name, bevel)


def cylinder(name, radius, depth, loc, mat, rot=(0, 0, 0), verts=28, bevel=0.006):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth, location=loc, rotation=rot)
    return finish(bpy.context.active_object, mat, name, bevel, 2)


def sphere(name, radius, loc, mat, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=22, ring_count=11, radius=radius, location=loc)
    o = bpy.context.active_object
    o.scale = scale
    return finish(o, mat, name)


def torus(name, major, minor, loc, mat, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=32, minor_segments=10,
                                     location=loc, rotation=rot)
    return finish(bpy.context.active_object, mat, name)


def taper(obj, amount):
    """Scale X and Y towards the bottom of the mesh: positive narrows it, negative flares it."""
    zs = [v.co.z for v in obj.data.vertices]
    lo, hi = min(zs), max(zs)
    for v in obj.data.vertices:
        k = 1 - amount * (hi - v.co.z) / max(hi - lo, 1e-6)
        v.co.x *= k
        v.co.y *= k
    obj.data.update()
    return obj


def empty(name, loc, parent=None):
    o = bpy.data.objects.new(name, None)
    o.empty_display_size = 0.05
    bpy.context.collection.objects.link(o)
    o.location = loc
    if parent:
        attach(o, parent)
    return o


def attach(child, parent):
    bpy.context.view_layer.update()  # matrix_world is stale until the depsgraph re-evaluates
    world = child.matrix_world.copy()
    child.parent = parent
    child.matrix_world = world


def screen_plane(name, width, height, loc, mat):
    """Rounded rectangle facing -Y with 0..1 UVs, for the shader face."""
    import bmesh
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    r, steps = min(width, height) * 0.22, 6
    pts = []
    corners = [(width / 2 - r, height / 2 - r, 0), (-width / 2 + r, height / 2 - r, 90),
               (-width / 2 + r, -height / 2 + r, 180), (width / 2 - r, -height / 2 + r, 270)]
    for cx, cz, start in corners:
        for s in range(steps + 1):
            a = math.radians(start + 90 * s / steps)
            pts.append((cx + r * math.cos(a), cz + r * math.sin(a)))
    center = bm.verts.new((0, 0, 0))
    ring = [bm.verts.new((x, 0, z)) for x, z in pts]
    uv_layer = bm.loops.layers.uv.new('UVMap')
    for i in range(len(ring)):
        f = bm.faces.new((center, ring[(i + 1) % len(ring)], ring[i]))
        for loop in f.loops:
            co = loop.vert.co
            loop[uv_layer].uv = (co.x / width + 0.5, co.z / height + 0.5)
    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()
    o = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(o)
    o.location = loc
    o.data.materials.append(mat)
    for poly in o.data.polygons:
        poly.use_smooth = False
    return o


def to_mesh_from_curve(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target='MESH')
    o = bpy.context.active_object
    bpy.ops.object.shade_smooth()
    return o


def bounds(obj):
    pts = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def place(obj, left, bottom=0.0, depth_center=0.0):
    lo, hi = bounds(obj)
    obj.location += Vector((left - lo.x, depth_center - (lo.y + hi.y) / 2, bottom - lo.z))
    bpy.context.view_layer.update()
    lo, hi = bounds(obj)
    return hi.x


# ---------------------------------------------------------------- letters
def letter(ch, mat, name):
    curve = bpy.data.curves.new(name, 'FONT')
    curve.body = ch
    curve.font = bpy.data.fonts.load(FONT, check_existing=True)
    curve.size = 1.0
    curve.extrude = 0.09
    curve.bevel_depth = 0.035
    curve.bevel_resolution = 3
    curve.resolution_u = 8
    o = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(o)
    o.rotation_euler = (math.radians(90), 0, 0)
    m = to_mesh_from_curve(o)
    if len(m.data.vertices) == 0:
        bpy.data.objects.remove(m)
        curve = bpy.data.curves.new(name, 'FONT')
        curve.body = ch
        curve.font = bpy.data.fonts.load(FONT_FALLBACK, check_existing=True)
        curve.extrude, curve.bevel_depth, curve.bevel_resolution = 0.09, 0.035, 4
        o = bpy.data.objects.new(name, curve)
        bpy.context.collection.objects.link(o)
        o.rotation_euler = (math.radians(90), 0, 0)
        m = to_mesh_from_curve(o)
    m.name = name
    m.data.materials.clear()
    m.data.materials.append(mat)
    return m


def b_mark():
    try:
        addon_utils.enable('io_curve_svg', default_set=True)
        before = set(bpy.data.objects)
        bpy.ops.import_curve.svg(filepath=MARK_SVG)
        curves = [o for o in bpy.data.objects if o not in before and o.type == 'CURVE']
        if not curves:
            raise RuntimeError('no curves imported')
        bpy.ops.object.select_all(action='DESELECT')
        for c in curves:
            c.select_set(True)
        bpy.context.view_layer.objects.active = curves[0]
        if len(curves) > 1:
            bpy.ops.object.join()
        o = bpy.context.active_object
        o.data.dimensions = '2D'
        o.data.fill_mode = 'BOTH'
        lo, hi = bounds(o)
        s = 1.0 / max(hi.y - lo.y, 1e-6)
        o.scale = (s, s, s)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        o.data.extrude = 0.09
        o.data.bevel_depth = 0.03
        o.data.bevel_resolution = 3
        o.data.resolution_u = 6
        for sp in o.data.splines:
            for pt in sp.bezier_points:
                pt.radius = 1.0  # the SVG importer's radii scale the bevel
        o.rotation_euler = (math.radians(90), 0, 0)
        m = to_mesh_from_curve(o)
        m.name = 'LetterB'
        m.data.name = 'LetterB'
    except Exception as e:  # noqa: BLE001
        print('SVG import failed, using a text B:', e)
        m = letter('B', M['emerald'], 'LetterB')
    m.data.materials.clear()
    m.data.materials.append(M['emerald'])
    return m


letters = [b_mark(), letter('l', M['emerald'], 'LetterL'), letter('€', M['royal'], 'LetterEuro'), letter('m', M['emerald'], 'LetterM')]
# Scale everything so the l is 1.0 tall, then lay out left to right on the baseline.
l_lo, l_hi = bounds(letters[1])
k = 1.0 / (l_hi.z - l_lo.z)
for o in letters[1:]:
    o.scale = (k, k, k)
bpy.context.view_layer.update()
b_lo, b_hi = bounds(letters[0])
kb = 1.04 / (b_hi.z - b_lo.z)
letters[0].scale = (kb, kb, kb)
bpy.context.view_layer.update()
for o in letters:
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
x = 0.0
gap = 0.07
for o in letters:
    x = place(o, x) + gap
letter_parent = empty('Wordmark', (0, 0, 0))
for o in letters:
    attach(o, letter_parent)
I_SLOT = x + 0.27                      # robot body centre
A_SLOT = I_SLOT + 0.27 + 0.08 + 0.33   # head centre when it is the "a"


# ---------------------------------------------------------------- Blemi
root = empty('Blemi', (I_SLOT, 0, 0))
hips = empty('Hips', (I_SLOT, 0, 0.27), root)

# The body carries its own screen face, so it is still a whole character once the head has become the "a".
X = I_SLOT
for side, sx in (('L', -1), ('R', 1)):
    lx = X + 0.088 * sx
    hip = empty(f'Hip{side}', (lx, 0, 0.255), hips)
    cylinder(f'Thigh{side}', 0.05, 0.075, (lx, 0, 0.222), M['emerald'], bevel=0.012)
    sphere(f'Knee{side}', 0.058, (lx, 0, 0.178), M['silver'], scale=(1.15, 1.05, 0.8))
    taper(cylinder(f'BootCuff{side}', 0.06, 0.11, (lx, 0.012, 0.105), M['emerald'], bevel=0.014), -0.25)
    sphere(f'Toe{side}', 0.085, (lx + 0.004 * sx, -0.03, 0.042), M['white'], scale=(0.95, 1.15, 0.62))
    box(f'BootSole{side}', (0.17, 0.215, 0.04), (lx + 0.004 * sx, -0.02, 0.02), M['emerald'], 0.019)
    for part in (f'Thigh{side}', f'Knee{side}', f'BootCuff{side}', f'Toe{side}', f'BootSole{side}'):
        attach(bpy.data.objects[part], hip)

taper(box('Torso', (0.34, 0.25, 0.26), (X, 0, 0.415), M['emerald'], 0.105), 0.1)
box('ChestBezel', (0.25, 0.04, 0.18), (X, -0.108, 0.43), M['white'], 0.055)
screen_plane('ChestScreen', 0.22, 0.155, (X, -0.1285, 0.431), M['screen'])
taper(box('Belly', (0.3, 0.225, 0.11), (X, 0, 0.268), M['white'], 0.05), 0.22)
cylinder('NeckConnector', 0.062, 0.04, (X, 0, 0.555), M['silver'])
cylinder('NeckSocket', 0.036, 0.012, (X, 0, 0.574), M['socket'])
for part in ('Torso', 'ChestBezel', 'ChestScreen', 'Belly', 'NeckConnector', 'NeckSocket'):
    attach(bpy.data.objects[part], hips)

for side, sx in (('L', -1), ('R', 1)):
    ax = X + 0.19 * sx
    sh = empty(f'Shoulder{side}', (ax, 0, 0.49), hips)
    sphere(f'ShoulderCap{side}', 0.058, (ax, 0, 0.49), M['emerald'])
    cylinder(f'ShoulderRing{side}', 0.034, 0.018, (ax, 0, 0.448), M['silver'])
    cylinder(f'UpperArm{side}', 0.034, 0.06, (ax, 0, 0.41), M['white'], bevel=0.01)
    el = empty(f'Elbow{side}', (ax, 0, 0.378), sh)
    cylinder(f'ElbowJoint{side}', 0.031, 0.018, (ax, 0, 0.375), M['silver'])
    taper(cylinder(f'Forearm{side}', 0.04, 0.045, (ax, 0, 0.345), M['emerald'], bevel=0.012), -0.12)
    box(f'Hand{side}', (0.078, 0.066, 0.056), (ax, -0.004, 0.307), M['emerald'], 0.024)
    fingers = []
    for i, fx in enumerate((-0.023, 0.0, 0.023)):
        fingers.append(sphere(f'Finger{side}{i}', 0.016, (ax + fx, -0.008, 0.27), M['white'], scale=(1, 1, 1.6)).name)
    sphere(f'Thumb{side}', 0.016, (ax - 0.038 * sx, -0.024, 0.298), M['white'], scale=(1, 1, 1.4))
    for part in (f'ShoulderCap{side}', f'ShoulderRing{side}', f'UpperArm{side}'):
        attach(bpy.data.objects[part], sh)
    for part in (f'ElbowJoint{side}', f'Forearm{side}', f'Hand{side}', f'Thumb{side}', *fingers):
        attach(bpy.data.objects[part], el)
    sh.rotation_euler.y = math.radians(-9 * sx)  # rest pose: arms angled out, clear of the round torso

NECK = 0.575
head = empty('HeadGroup', (I_SLOT, 0, NECK), root)
box('HeadHousing', (0.56, 0.4, 0.44), (I_SLOT, 0, NECK + 0.245), M['emerald'], 0.1)
box('HeadBezel', (0.47, 0.03, 0.35), (I_SLOT, -0.196, NECK + 0.245), M['white'], 0.07)
screen_plane('Screen', 0.42, 0.3, (I_SLOT, -0.2125, NECK + 0.245), M['screen'])
for side, sx in (('L', -1), ('R', 1)):
    cylinder(f'Ear{side}', 0.09, 0.05, (I_SLOT + 0.292 * sx, 0, NECK + 0.25), M['white'], rot=(0, math.radians(90), 0))
    cylinder(f'EarCap{side}', 0.058, 0.016, (I_SLOT + 0.322 * sx, 0, NECK + 0.25), M['silver'], rot=(0, math.radians(90), 0))
antenna = empty('Antenna', (I_SLOT, 0, NECK + 0.465), head)
cylinder('AntennaStem', 0.013, 0.1, (I_SLOT, 0, NECK + 0.51), M['silver'], verts=16)
sphere('AntennaBall', 0.042, (I_SLOT, 0, NECK + 0.58), M['emerald'])
sphere('AntennaTip', 0.016, (I_SLOT, -0.03, NECK + 0.598), M['mint'])
for part in ('HeadHousing', 'HeadBezel', 'Screen', 'EarL', 'EarR', 'EarCapL', 'EarCapR'):
    attach(bpy.data.objects[part], head)
for part in ('AntennaStem', 'AntennaBall', 'AntennaTip'):
    attach(bpy.data.objects[part], antenna)


# ---------------------------------------------------------------- animation
CLIPS = {}
OBJ = bpy.data.objects
NODES = ['Blemi', 'Hips', 'HeadGroup', 'Antenna', 'HipL', 'HipR', 'ShoulderL', 'ShoulderR', 'ElbowL', 'ElbowR']
REST = {n: (OBJ[n].location.copy(), OBJ[n].rotation_euler.copy()) for n in NODES}
HEAD_REST = REST['HeadGroup'][0]
HEAD_AT_A = Vector((A_SLOT - I_SLOT, 0, 0.0))  # in Blemi-root space, like the head's rest position
for n in NODES:
    OBJ[n].rotation_mode = 'XYZ'


def key(name, frame, loc=None, rot=None):
    o = OBJ[name]
    base_loc, base_rot = REST[name]
    o.location = base_loc + Vector(loc) if loc is not None else o.location
    if rot is not None:
        o.rotation_euler = (base_rot.x + math.radians(rot[0]), base_rot.y + math.radians(rot[1]), base_rot.z + math.radians(rot[2]))
    o.keyframe_insert('location', frame=frame)
    o.keyframe_insert('rotation_euler', frame=frame)


def head_at(frame, world, rot=(0, 0, 0)):
    key('HeadGroup', frame, loc=world - HEAD_REST, rot=rot)


def pose_rest(frame, head_world=None, head_rot=(0, 0, 0)):
    for n in NODES:
        if n == 'HeadGroup':
            continue
        key(n, frame, loc=(0, 0, 0), rot=(0, 0, 0))
    head_at(frame, head_world if head_world is not None else HEAD_REST, head_rot)


def clip(name, start, end):
    CLIPS[name] = [start, end]


# idle (assembled): breathing bob, antenna sway, soft arm swing
s = 1
pose_rest(s)
for f, bob, tilt, sway, arm in ((s + 15, 0.008, 2.5, 6, 3), (s + 30, 0.0, 0, 0, 0), (s + 45, 0.008, -2.5, -6, -3)):
    key('Hips', f, loc=(0, 0, bob))
    head_at(f, HEAD_REST + Vector((0, 0, bob)), rot=(0, tilt, 0))
    key('Antenna', f, rot=(0, sway, 0))
    key('ShoulderL', f, rot=(arm, 0, 0))
    key('ShoulderR', f, rot=(-arm, 0, 0))
pose_rest(s + 60)
clip('idle', s, s + 60)

# wave (assembled): right arm up, elbow waves
s = 71
pose_rest(s)
key('ShoulderR', s + 10, rot=(0, -150, 0))
for i, f in enumerate(range(s + 16, s + 48, 8)):
    key('ElbowR', f, rot=(0, 28 if i % 2 == 0 else -18, 0))
    head_at(f, HEAD_REST, rot=(0, -4 if i % 2 == 0 else 2, 0))
key('ShoulderR', s + 48, rot=(0, -150, 0))
key('ElbowR', s + 52, rot=(0, 0, 0))
pose_rest(s + 62)
clip('wave', s, s + 62)

# story: the head pops off, bounces, rolls and settles as the "a"
s = 141
pose_rest(s)
head_at(s + 6, HEAD_REST + Vector((0, 0, -0.02)))                       # anticipation
key('ShoulderL', s + 6, rot=(0, 10, 0))
key('ShoulderR', s + 6, rot=(0, -10, 0))
head_at(s + 14, HEAD_REST + Vector((0.05, 0, 0.38)), rot=(0, -25, 0))   # pop
key('ShoulderL', s + 14, rot=(0, 75, 0))                                # surprised arms
key('ShoulderR', s + 14, rot=(0, -75, 0))
mid = HEAD_REST.lerp(HEAD_AT_A, 0.55) + Vector((0, 0, 0.32))
head_at(s + 24, mid, rot=(0, -150, 0))
head_at(s + 34, HEAD_AT_A + Vector((-0.12, 0, 0.0)), rot=(0, -250, 0))  # lands
head_at(s + 42, HEAD_AT_A + Vector((-0.07, 0, 0.12)), rot=(0, -320, 0))  # bounce
head_at(s + 50, HEAD_AT_A + Vector((-0.03, 0, 0.0)), rot=(0, -360, 0))
for f, dx in ((s + 30, 0.05), (s + 40, 0.1)):                          # two quick steps after it
    key('Hips', f, loc=(dx, 0, 0.012))
    key('HipL', f, rot=(-25 if dx < 0.08 else 20, 0, 0))
    key('HipR', f, rot=(20 if dx < 0.08 else -25, 0, 0))
    key('Blemi', f, loc=(0, 0, 0))
key('ShoulderL', s + 40, rot=(-40, 30, 0))                             # reaching
key('ShoulderR', s + 40, rot=(-40, -30, 0))
for i, f in enumerate(range(s + 52, s + 64, 3)):                       # short circuit twitch
    key('Hips', f, loc=(0.1, 0, 0.0), rot=(4 if i % 2 else -4, 0, 3 if i % 2 else -3))
key('Hips', s + 70, loc=(0.12, -0.02, -0.02), rot=(18, 0, 0))           # stumble forward
key('HipL', s + 70, rot=(-15, 0, 0))
key('HipR', s + 70, rot=(10, 0, 0))
head_at(s + 66, HEAD_AT_A + Vector((-0.03, 0, 0.0)), rot=(0, -360, 0))
head_at(s + 74, HEAD_AT_A + Vector((0.0, 0, 0.0)), rot=(0, -368, 0))   # bumped into the a slot, leaning 8 degrees
head_at(s + 84, HEAD_AT_A, rot=(0, -368, 0))
key('Hips', s + 92, loc=(0.06, 0, 0.01), rot=(0, 0, 0))                # gets up and walks back
key('HipL', s + 92, rot=(20, 0, 0))
key('HipR', s + 92, rot=(-20, 0, 0))
key('Hips', s + 104, loc=(0.0, 0, 0.0))
key('HipL', s + 104, rot=(0, 0, 0))
key('HipR', s + 104, rot=(0, 0, 0))
key('ShoulderL', s + 104, rot=(0, 0, 0))
key('ShoulderR', s + 104, rot=(0, 0, 0))
key('ElbowL', s + 104, rot=(0, 0, 0))
key('ElbowR', s + 104, rot=(0, 0, 0))
key('ShoulderR', s + 118, rot=(0, -140, 0))                            # small wave next to the dot
key('ElbowR', s + 124, rot=(0, 22, 0))
key('ElbowR', s + 130, rot=(0, -14, 0))
key('ShoulderR', s + 140, rot=(0, 0, 0))
key('ElbowR', s + 140, rot=(0, 0, 0))
for n in ('Hips', 'HipL', 'HipR', 'ShoulderL', 'Antenna', 'Blemi', 'ElbowL'):
    key(n, s + 150, loc=(0, 0, 0), rot=(0, 0, 0))
head_at(s + 150, HEAD_AT_A, rot=(0, -368, 0))
clip('story', s, s + 150)

# logo idle: body at the i, head is the a
s = 301
pose_rest(s, HEAD_AT_A, (0, -368, 0))
for f, bob, tilt in ((s + 20, 0.006, -366), (s + 40, 0.0, -370)):
    key('Hips', f, loc=(0, 0, bob))
    head_at(f, HEAD_AT_A + Vector((0, 0, bob * 0.5)), rot=(0, tilt, 0))
pose_rest(s + 60, HEAD_AT_A, (0, -368, 0))
clip('logo_idle', s, s + 60)

# reassemble: the head hops back onto the neck
s = 371
pose_rest(s, HEAD_AT_A, (0, -368, 0))
head_at(s + 8, HEAD_AT_A + Vector((0, 0, -0.03)), rot=(0, -368, 0))
key('ShoulderL', s + 12, rot=(0, 120, 0))
key('ShoulderR', s + 12, rot=(0, -120, 0))
head_at(s + 20, HEAD_REST.lerp(HEAD_AT_A, 0.5) + Vector((0, 0, 0.42)), rot=(0, -180, 0))
head_at(s + 30, HEAD_REST + Vector((0, 0, 0.05)), rot=(0, -10, 0))
key('Hips', s + 31, loc=(0, 0, -0.03))
head_at(s + 34, HEAD_REST + Vector((0, 0, -0.03)), rot=(0, 0, 0))
pose_rest(s + 44)
clip('reassemble', s, s + 44)

# working (assembled): typing in front, small nods
s = 425
pose_rest(s)
for i, f in enumerate(range(s + 4, s + 60, 6)):
    a = 6 if i % 2 else -6
    key('ShoulderL', f, rot=(-55 + a, 12, 0))
    key('ShoulderR', f, rot=(-55 - a, -12, 0))
    key('ElbowL', f, rot=(-35, 0, 0))
    key('ElbowR', f, rot=(-35, 0, 0))
    head_at(f, HEAD_REST, rot=(-6 if i % 4 < 2 else -2, 0, 0))
pose_rest(s + 64)
clip('working', s, s + 64)

scene.frame_start = 1
scene.frame_end = max(e for _, e in CLIPS.values())
for o in bpy.data.objects:
    if o.animation_data and o.animation_data.action:
        for fc in getattr(o.animation_data.action, 'fcurves', []):
            for kp in fc.keyframe_points:
                kp.interpolation = 'BEZIER'
                kp.easing = 'AUTO'


# ---------------------------------------------------------------- export
os.makedirs(os.path.dirname(OUT_GLB), exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(
    filepath=OUT_GLB,
    export_format='GLB',
    export_apply=True,
    export_yup=True,
    export_animations=True,
    export_animation_mode='SCENE',
    export_force_sampling=True,
    export_frame_range=True,
    export_def_bones=False,
    export_lights=False,
    export_cameras=False,
)
tris = sum(len(p.vertices) - 2 for o in bpy.data.objects if o.type == 'MESH' for p in o.data.polygons)


def gltf_bounds(objs):
    """World-space bounds in glTF axes: x, y up, z towards the camera."""
    pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
    lo = (min(p.x for p in pts), min(p.z for p in pts), min(-p.y for p in pts))
    hi = (max(p.x for p in pts), max(p.z for p in pts), max(-p.y for p in pts))
    return {'min': [round(v, 4) for v in lo], 'max': [round(v, 4) for v in hi]}


# Bounds at the assembled rest pose, so camera framing can be tested by projecting real geometry.
scene.frame_set(CLIPS['idle'][0])
bpy.context.view_layer.update()
BOUNDS = {
    'blemi': gltf_bounds([o for o in root.children_recursive if o.type == 'MESH']),
    'letters': {o.name: gltf_bounds([o]) for o in letters},
}
os.makedirs(os.path.dirname(OUT_JSON), exist_ok=True)
with open(OUT_JSON, 'w') as fh:
    json.dump({
        'fps': FPS,
        'clips': CLIPS,
        'slots': {'i': I_SLOT, 'a': A_SLOT, 'wordmarkEnd': A_SLOT + 0.33},
        'neckHeight': NECK,
        'bounds': BOUNDS,
        'triangles': tris,
    }, fh, indent=2)
print('BLEMI_EXPORTED', OUT_GLB, 'triangles', tris, 'clips', CLIPS)

# ---------------------------------------------------------------- preview render
if PREVIEW:
    cam_data = bpy.data.cameras.new('cam')
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = A_SLOT + 0.9
    cam = bpy.data.objects.new('cam', cam_data)
    bpy.context.collection.objects.link(cam)
    cam.location = ((A_SLOT + 0.33) / 2, -6, 0.6)
    cam.rotation_euler = (math.radians(90), 0, 0)
    scene.camera = cam
    for n, (loc, energy) in {'key': ((-2, -4, 4), 260), 'fill': ((4, -3, 2), 110)}.items():
        ld = bpy.data.lights.new(n, 'AREA')
        ld.energy = energy
        ld.size = 4
        lo = bpy.data.objects.new(n, ld)
        lo.location = loc
        lo.rotation_euler = (Vector((0, 0, 0.5)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
        bpy.context.collection.objects.link(lo)
    world = bpy.data.worlds.new('w')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[0].default_value = (0.95, 0.96, 0.97, 1)
    world.node_tree.nodes['Background'].inputs[1].default_value = 0.5
    scene.world = world
    scene.view_settings.view_transform = 'Standard'
    try:
        scene.render.engine = 'BLENDER_EEVEE'
    except TypeError:
        scene.render.engine = 'BLENDER_WORKBENCH'
    scene.render.resolution_x, scene.render.resolution_y = 1600, 640
    for frame, suffix in ((CLIPS['idle'][0], 'assembled'), (CLIPS['story'][1], 'logo')):
        scene.frame_set(frame)
        scene.render.filepath = PREVIEW.replace('.png', f'-{suffix}.png')
        bpy.ops.render.render(write_still=True)
    cam_data.ortho_scale = 0.75
    cam.location = (I_SLOT, -6, 0.3)
    scene.render.resolution_x, scene.render.resolution_y = 800, 800
    scene.frame_set(CLIPS['story'][1])
    scene.render.filepath = PREVIEW.replace('.png', '-body.png')
    bpy.ops.render.render(write_still=True)
    print('BLEMI_PREVIEW', PREVIEW)

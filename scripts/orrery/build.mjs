// 發條星儀 Roundworks Orrery — the round clock of the autonomous world.
// One winding key, one open drive bay, three stacked arm collars carrying three
// faction planets over engraved orbit rings; moons swing on wires; a counter
// dial reads rounds (RND 0001, game style) and a sub-dial sweeps the current
// round's 18 phases. Winding the key is the only energy source.
//
// Writes public/orrery.html (dark) and, with --light, a light page.
// Kit home override: ANATOMY_HOME (defaults to ~/.agents/skills/anatomy).
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { homedir, platform, userInfo } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "public");
const theme = process.argv.includes("--light") ? "light" : "dark";

function anatomyHome() {
  const env = process.env.ANATOMY_HOME;
  if (env) return env;
  const base = platform() === "win32" ? join("C:", "Users", userInfo().username, ".agents") : homedir() + "/.agents";
  return join(base, "skills", "anatomy");
}
const KIT = anatomyHome();
const k = await import(pathToFileURL(join(KIT, "kit", "iso-kit.mjs")));
const G = await import(pathToFileURL(join(KIT, "kit", "lathe.mjs")));
const { kitScript } = await import(pathToFileURL(join(KIT, "scripts", "inline-kit.mjs")));

import { model, armAngle, moonAngle, crankAngle, phaseOf, roundAt, pad4 } from "./model.mjs";

const WIDTH = 1180;
const HEIGHT = 640;
const MODEL = model();

// ── world layout ─────────────────────────────────────────────────────────────
const DECK = MODEL.deck;
const BED = { x: -138, y: -60, w: 212, d: 130, r: 8 };      // bench bed, top z 0
const HOUSING = { x: -86, y: -52, w: 48, d: 30, r: 3 };     // open drive bay, 0..8
const SPRING = { at: [-50.5, -31], r: 6.8 };                // mainspring barrel
const IDLER = { at: [-60.1, -34.5], r: 3.4 };
const SUB = { at: [-74, -33.5], r: 6, faceZ: 12.2 };        // phase sub-dial
const DIAL = { at: [-119, 20], r: 14, faceZ: 6.8 };         // round counter
const RATCHET = { at: SPRING.at, r: 6.3, z: 15.75 };
const KNOB = { at: SPRING.at, z: 15.75, pin: 4.2 };

const P = k.fitProjection(
  [
    ...k.boxCorners(BED, -18, 0),
    ...k.boxCorners(HOUSING, 0, 22),
    ...k.boxCorners({ x: DECK[0] - 53, y: DECK[1] - 53, w: 106, d: 106, r: 0 }, 0, 46),
    [DECK[0], DECK[1], 58.4],
  ],
  WIDTH,
  HEIGHT,
  { pad: 30, azimuth: 38 },
);

const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
// bare-name aliases so the embeddable live-shape helpers below run in BOTH
// scopes: here (aliases) and on the page (kitScript() globals after stripping)
const iso = k.iso;
const lineSvg = k.lineSvg;
const solidSvg = k.solidSvg;
const dotsSvg = k.dotsSvg;
const cylinder = k.cylinder;
const extrude = k.extrude;
const knurl = k.knurl;
const ring = k.ring;
const radialTicks = k.radialTicks;
const lineOnTop = k.lineOnTop;

// ── live-shape helpers shared by build and page ──────────────────────────────
// Every one of these takes (…, proj, …) and calls the kit through `k.`, so the
// page embeds them with `.replace(/\bk\./g, "")` (kitScript() strips exports).
// No template literals inside: the page script is a plain string.

// ratchet: a radial tick ring riding the barrel cap; `angle` rotates the teeth
function ratchetSvg(angle, proj, cfg) {
  const centre = iso([cfg.at[0], cfg.at[1], cfg.z], proj);
  const ticks = radialTicks(cfg.at[0], cfg.at[1], cfg.r, 36, 3, cfg.z + 0.04, [2.4, 2.4], proj, angle);
  return (
    lineSvg(ring(cfg.at[0], cfg.at[1], cfg.r, cfg.z, proj, 44), { tone: "lo" }) +
    lineSvg(ring(cfg.at[0], cfg.at[1], cfg.r - 2.4, cfg.z, proj, 36), { tone: "faint" }) +
    lineSvg(ticks.minor, { tone: "lo" }) +
    lineSvg(ticks.major, { tone: "mid" }) +
    dotsSvg([centre], { size: 0.7, tone: "mid" })
  );
}

// winding key: hub web + collar + knurled knob riding an eccentric pin
function knobSvg(angle, proj, cfg) {
  const ax = cfg.at[0], ay = cfg.at[1];
  const dx = Math.sin(angle), dy = -Math.cos(angle);
  const px = ax + dx * cfg.pin, py = ay + dy * cfg.pin;
  const nx = -dy, ny = dx, w = 1.05;
  const z = cfg.z;
  return (
    solidSvg(extrude([
      [ax - nx * w, ay - ny * w],
      [px - nx * w, py - ny * w],
      [px + nx * w, py + ny * w],
      [ax + nx * w, ay + ny * w],
    ], z, 1.6, proj), { tone: "hi" }) +
    solidSvg(cylinder(px, py, 1.6, z + 1.6, 1.6, proj, 16), { tone: "mid" }) +
    solidSvg(cylinder(px, py, 2.4, z + 3.2, 3, proj, 20, 0.4), { tone: "hi" }) +
    lineSvg(knurl(px, py, 2.4, z + 3.2, z + 6.2, 18, proj, 0), { tone: "lo" }) +
    dotsSvg([iso([px, py, z + 6.2], proj)], { size: 0.55, tone: "hi" })
  );
}

// dial needle: tail–tip line with a hub dot and a tip dot so every end anchors
function needleSvg(angle, proj, at2, R, z) {
  const s = Math.sin(angle), c = Math.cos(angle);
  const tail = [at2[0] - s * 3.4, at2[1] + c * 3.4];
  const tip = [at2[0] + s * R, at2[1] - c * R];
  return (
    lineSvg(lineOnTop(tail, tip, z, proj), { tone: "hi" }) +
    dotsSvg([iso([tail[0], tail[1], z], proj), iso([tip[0], tip[1], z], proj)], { size: 0.8, tone: "hi" })
  );
}

// one armature: collar drum + truss + planet + moon wires, rebuilt per frame
function armSvg(rounds, proj, arm, m) {
  const cx = m.deck[0], cy = m.deck[1];
  const cz = arm.collar;
  const angle = armAngle(m, rounds, arm.index);
  const s = Math.sin(angle), c = Math.cos(angle);
  const R = (x, y) => [cx + x * c - y * s, cy + x * s + y * c];
  const scr = (p) => iso(p, proj);
  const rIn = m.orbits[arm.index];
  const out = [];

  // collar drum + rotation index line (dotted at both ends so both ends anchor)
  out.push(solidSvg(cylinder(cx, cy, 4.6, cz, 2.2, proj, 30, 0.4), { tone: "hi" }));
  const ib = R(2.2, 0);
  const ia = R(4.6, 0);
  out.push(lineSvg(lineOnTop(ib, ia, cz + 2.3, proj), { tone: "lo" }));
  out.push(dotsSvg([scr([ib[0], ib[1], cz + 2.3]), scr([ia[0], ia[1], cz + 2.3])], { size: 0.7, tone: "mid" }));

  // truss arm: pointed plan from the hub to the orbit radius
  const w0 = 3.1, w1 = 1.4, half = (w0 + w1) / 2 + 0.3;
  out.push(solidSvg(extrude([
    R(4.2, w0), R(rIn - 8, half), R(rIn - 1.6, w1), R(rIn, w1 * 0.7),
    R(rIn, -w1 * 0.7), R(rIn - 1.6, -w1), R(rIn - 8, -half), R(4.2, -w0),
  ], cz + 2.2, 2, proj), { tone: "hi" }));

  // planet pin, drum, faction band ring, cap
  const tx = R(rIn, 0)[0], ty = R(rIn, 0)[1];
  const pz = cz + 4.6;
  out.push(solidSvg(cylinder(tx, ty, 1.1, cz + 4.2, m.planetH + 2.8, proj, 12), { tone: "mid", crease: "none" }));
  out.push(solidSvg(cylinder(tx, ty, m.planetR, pz, m.planetH, proj, 26, 0.5), { tone: "mid" }));
  out.push("<path class=\"iso-line\" data-tone=\"hi\" d=\"" + ring(tx, ty, m.planetR - 0.4, pz + m.planetH * 0.45, proj, 30) + "\" style=\"stroke:" + arm.color + "\"/>");
  out.push(solidSvg(cylinder(tx, ty, m.planetR * 0.55, pz + m.planetH, 0.6, proj, 18), { tone: "hi", crease: "none" }));
  out.push(dotsSvg([scr([tx, ty, pz + m.planetH + 0.6])], { size: 0.5, tone: "hi" }));

  // moon post, then one wire + drum per moon
  const postZ = pz + m.planetH + 0.6;
  const postTop = postZ + m.moonPostH;
  out.push(solidSvg(cylinder(tx, ty, m.moonPostR, postZ, m.moonPostH, proj, 10), { tone: "mid", crease: "none" }));
  out.push(dotsSvg([scr([tx, ty, postTop])], { size: 0.6, tone: "mid" }));
  for (let j = 0; j < m.moons[arm.index]; j++) {
    const ma = moonAngle(m, rounds, arm.index, j) + m.moonRest[arm.index][j];
    const mx = tx + Math.sin(ma) * m.moonDist;
    const my = ty - Math.cos(ma) * m.moonDist;
    out.push(lineSvg(lineOnTop([tx, ty], [mx, my], postTop, proj), { tone: "lo" }));
    out.push(solidSvg(cylinder(mx, my, m.moonR, postTop, 1.2, proj, 14, 0.2), { tone: "mid" }));
    out.push(dotsSvg([scr([mx, my, postTop + 1.2])], { size: 0.5, tone: "mid" }));
  }
  return out.join("");
}

// ── static assemblies, painted in depth order ────────────────────────────────

function base() {
  const out = [];
  out.push("<path class=\"iso-halo\" d=\"" + k.haloOf(BED, -18, 18, P) + "\"/>");
  const feet = [...k.corners(BED, 14)].sort((a, b) => k.depthOf([a[0], a[1], -14], P) - k.depthOf([b[0], b[1], -14], P));
  for (const [x, y] of feet) {
    out.push(S(k.cylinder(x, y, 6.2, -18, 3, P, 24), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 4.6, -15, 3, P, 24), { tone: "mid" }));
  }
  out.push(S(k.slabOf(BED, -12, 12, P, 10, 1.4), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(BED, 5), 0.06, P), { tone: "faint" }));
  for (const [x, y] of k.corners(BED, 9)) {
    out.push(L(k.ring(x, y, 1.7, 0.05, P, 14), { tone: "lo" }));
    out.push(D([at([x, y, 0.05])], { size: 0.9 }));
  }
  // ruler strip on the front-right edge: ticks hang between two parallel rails
  const strip = { x: 12, y: 60, w: 56, d: 7, r: 1 };
  out.push(S(k.slabOf(strip, 0, 1.4, P, 3, 0.3), { tone: "hi", crease: "none" }));
  out.push(L(k.lineOnTop([strip.x, strip.y + 1], [strip.x + strip.w, strip.y + 1], 1.45, P), { tone: "lo" }));
  out.push(L(k.lineOnTop([strip.x, strip.y + 4.2], [strip.x + strip.w, strip.y + 4.2], 1.45, P), { tone: "lo" }));
  const ticks = k.topTicks(strip.x + 3, strip.x + strip.w - 3, 2, 5, strip.y + 1, 1.5, [3.2, 3.2], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  // engraved label plate front-left
  const plate = { x: -66, y: 58.5, w: 72, d: 8, r: 1.5 };
  out.push(S(k.slabOf(plate, 0, 1.8, P, 3, 0.4), { tone: "mid" }));
  out.push(k.faceTextSvg(k.topMatrix([plate.x + plate.w / 2, plate.y + 4], 1.9, P, "x"), "ROUNDWORKS · 36/144·216·288 · 1 TURN = 1 ROUND", { size: 2.2, tone: "lo", anchor: "middle" }));
  return out.join("");
}

// drive shaft from the bay to the deck plinth (under the stage disc);
// the west end hides under the housing fill painted after it
function shaft() {
  const out = [];
  out.push(L(k.lineOnTop([-39, -37], [-4, -37], 2.6, P), { tone: "lo" }));
  for (const x of [-30, -12]) {
    out.push(S(k.cylinder(x, -37, 2.1, 0, 4.4, P, 20), { tone: "mid" }));
    out.push(D([at([x, -37, 4.4])], { size: 0.6 }));
  }
  return out.join("");
}

function housing() {
  const out = [];
  out.push(S(k.slabOf(HOUSING, 0, 8, P, 6, 0.8), { tone: "mid" }));
  out.push(S(k.slabOf(k.insetPlan(HOUSING, 4), 0.4, 0.5, P, 4), { tone: "lo", flat: true, crease: "none" }));
  for (const [x, y] of k.corners(HOUSING, 6)) {
    out.push(L(k.ring(x, y, 1.5, 8.05, P, 12), { tone: "lo" }));
    out.push(D([at([x, y, 8.05])], { size: 0.7 }));
  }
  return out.join("");
}

function train() {
  const out = [];
  const sx = SPRING.at[0], sy = SPRING.at[1];
  out.push(S(k.cylinder(sx, sy, 2.4, 8, 2.6, P, 20), { tone: "mid" }));
  out.push(S(k.cylinder(sx, sy, SPRING.r, 10.6, 4.4, P, 40), { tone: "hi" }));
  out.push(L(k.sideArc(sx, sy, SPRING.r, 13.4, P, 24), { tone: "faint" }));
  out.push(S(k.cylinder(sx, sy, SPRING.r - 0.8, 15, 0.7, P, 40, 0.2), { tone: "mid" }));
  out.push("<g data-part=\"ratchet\">" + ratchetSvg(0, P, RATCHET) + "</g>");
  out.push("<g data-part=\"knob\">" + knobSvg(0, P, KNOB) + "</g>");
  // click pawl east of the barrel: blade + tooth line ending on the ratchet ring
  const px = sx + SPRING.r + 2.6, py = sy + 1.2;
  out.push(S(k.slabOf({ x: px, y: py - 1.1, w: 7.5, d: 2.2, r: 1 }, 15.4, 1.1, P, 3, 0.2), { tone: "mid", crease: "none" }));
  const dirx = px + 0.6 - sx, diry = py - 1.1 - sy;
  const dlen = Math.hypot(dirx, diry);
  out.push(L(k.lineOnTop([px + 0.6, py - 1.1], [sx + (dirx / dlen) * RATCHET.r, sy + (diry / dlen) * RATCHET.r], 15.7, P), { tone: "lo" }));
  out.push(D([at([px + 3.4, py, 16.5])], { size: 0.6 }));
  // idler gear
  const ix = IDLER.at[0], iy = IDLER.at[1];
  out.push(S(k.cylinder(ix, iy, 1.9, 8, 2.6, P, 18), { tone: "mid" }));
  out.push(S(k.cylinder(ix, iy, IDLER.r, 10.6, 3, P, 30, 0.3), { tone: "mid" }));
  out.push(L(k.knurl(ix, iy, IDLER.r, 10.7, 13.5, 22, P, 0), { tone: "faint" }));
  out.push(D([at([ix, iy, 13.6])], { size: 0.7 }));
  // sub-dial pedestal (face lives in readouts)
  out.push(S(k.cylinder(SUB.at[0], SUB.at[1], 2.4, 8, 2.6, P, 18), { tone: "mid" }));
  return out.join("");
}

function deck() {
  const out = [];
  const cx = DECK[0], cy = DECK[1];
  out.push(S(k.cylinder(cx, cy, 15, 0, 5, P, 48), { tone: "hi" }));
  out.push(S(k.cylinder(cx, cy, 50, 5, 10, P, 96), { tone: "mid" }));
  // rim fluting between two rails: the top rim and an engraved side arc
  out.push(L(k.sideArc(cx, cy, 50, 12.8, P, 48), { tone: "faint" }));
  out.push(L(k.knurl(cx, cy, 50, 12.8, 14.8, 72, P, 0), { tone: "faint" }));
  for (let i = 0; i < 3; i++) {
    const r = MODEL.orbits[i];
    out.push(L(k.ring(cx, cy, r, 15.06, P, 72), { tone: "lo" }));
    out.push(L(k.ring(cx, cy, r - 2, 15.06, P, 72), { tone: "faint" }));
    const ticks = k.radialTicks(cx, cy, r, 36, 6, 15.08, [2, 2], P);
    out.push(L(ticks.minor, { tone: "faint" }), L(ticks.major, { tone: "lo" }));
  }
  out.push(L(k.ring(cx, cy, 5.4, 15.06, P, 32), { tone: "lo" }));
  out.push(S(k.cylinder(cx, cy, 2.8, 15, 32, P, 24), { tone: "mid", crease: "none" }));
  return out.join("");
}

function readouts() {
  const out = [];
  const dx = DIAL.at[0], dy = DIAL.at[1];
  out.push(S(k.cylinder(dx, dy, 2.4, 0, 5, P, 18), { tone: "mid" }));
  out.push(S(k.cylinder(dx, dy, DIAL.r, 5, 1.8, P, 64, 0.5), { tone: "hi" }));
  out.push(L(k.ring(dx, dy, DIAL.r - 0.6, DIAL.faceZ + 0.05, P, 56), { tone: "lo" }));
  out.push(L(k.ring(dx, dy, DIAL.r - 3, DIAL.faceZ + 0.05, P, 48), { tone: "faint" }));
  const ticks = k.radialTicks(dx, dy, DIAL.r - 0.6, MODEL.dialTicks, 5, DIAL.faceZ + 0.1, [2.4, 2.4], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  for (const n of [0, 15, 30, 45]) {
    const a = (n / 60) * Math.PI * 2;
    const nx = dx + Math.sin(a) * (DIAL.r - 4.6), ny = dy - Math.cos(a) * (DIAL.r - 4.6);
    out.push(k.faceTextSvg(k.topMatrix([nx, ny], DIAL.faceZ + 0.12, P, "x"), String(n).padStart(2, "0"), { size: 2.1, tone: "lo", anchor: "middle" }));
  }
  out.push(k.faceTextSvg(k.topMatrix([dx, dy + 4.2], DIAL.faceZ + 0.12, P, "x"), "RND", { size: 2.6, tone: "lo", anchor: "middle" }));
  out.push("<g data-part=\"needle\"></g>");
  const ax = SUB.at[0], ay = SUB.at[1];
  out.push(S(k.cylinder(ax, ay, SUB.r, 10.6, 1.6, P, 40, 0.4), { tone: "hi" }));
  out.push(L(k.ring(ax, ay, SUB.r - 0.5, SUB.faceZ + 0.05, P, 40), { tone: "lo" }));
  out.push(L(k.ring(ax, ay, SUB.r - 2.5, SUB.faceZ + 0.05, P, 32), { tone: "faint" }));
  const subs = k.radialTicks(ax, ay, SUB.r - 0.5, MODEL.phases, 3, SUB.faceZ + 0.1, [2, 2], P);
  out.push(L(subs.minor, { tone: "lo" }), L(subs.major, { tone: "mid" }));
  out.push("<g data-part=\"phase-needle\"></g>");
  return out.join("");
}

// the sun: the one lit part of the figure
function sun() {
  const cx = DECK[0], cy = DECK[1];
  return (
    S(G.sphereOf([cx, cy, MODEL.sunZ + MODEL.sunR], MODEL.sunR, P, { steps: 56 }), { tone: "hi", lit: true }) +
    S(k.cylinder(cx, cy, 0.9, MODEL.sunZ + MODEL.sunR * 2, 2.4, P, 12), { tone: "mid", crease: "none" }) +
    D([at([cx, cy, MODEL.sunZ + MODEL.sunR * 2 + 2.4])], { size: 0.8, tone: "hi" })
  );
}

// ── static figure ────────────────────────────────────────────────────────────
const svgBody = [
  base(),
  shaft(),
  housing(),
  train(),
  deck(),
  readouts(),
  ...[2, 1, 0].map((i) => "<g data-part=\"arm-" + i + "\">" + armSvg(0, P, MODEL.arms[i], MODEL) + "</g>"),
  sun(),
];

const figure = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label:
    "A brass bench orrery. One winding key over an open drive bay; three stacked arm collars carry three faction planets over engraved orbit rings; moons swing on wires; a counter dial reads rounds and a sub-dial sweeps the current round's 18 phases.",
  body: svgBody,
});

// ── extra CSS (embed + film chrome) ─────────────────────────────────────────
const EXTRA_CSS = `
.iso-stage{display:block;outline:none;overflow:hidden}
.iso-stage:focus-visible{outline:2px solid var(--anatomy-blue);outline-offset:4px}
html.iso-embed,html.iso-film{background:transparent}
html.iso-film{background:var(--anatomy-page)}
.iso-film .iso-figure svg{filter:brightness(1.3)}
.iso-embed .iso-figure svg,.iso-film .iso-figure svg{display:block;width:100%;height:auto}
.iso-embed main.iso-page,.iso-film main.iso-page{width:100%;margin:0;max-width:none}
body.iso-embed,body.iso-film{background:transparent}
.iso-embed .iso-figure,.iso-film .iso-figure{margin:0}
.iso-embed .iso-plate{padding:14px 14px 16px;background:transparent;box-shadow:none}
.iso-film .iso-plate{padding:14px 14px 16px}
.iso-embed .iso-plate-corner,.iso-film .iso-plate-corner{display:none}
.iso-embed .iso-plate-corner[data-corner="readout"],.iso-film .iso-plate-corner[data-corner="readout"]{display:block;top:10px;right:12px;bottom:auto;font-size:11px}
.iso-embed .iso-legend,.iso-film .iso-legend{display:none}
.iso-film-cap{position:absolute;left:0;right:0;bottom:20px;display:none;text-align:center;pointer-events:none}
body.iso-film .iso-film-cap{display:block}
.iso-film-cap strong{display:block;font-size:16px;line-height:1.4;color:var(--anatomy-strong);letter-spacing:.02em}
.iso-film-cap span{display:block;font-size:12.5px;color:var(--anatomy-muted)}
`;

// ── the page's live half ─────────────────────────────────────────────────────
const strip = (fn) => fn.toString().replace(/\bk\./g, "");

// film pans are solved at build time: put a world point at the frame centre.
// svg transform-origin is 50% 58%, so displayed = o + (f − o)·z + t with
// o = (.5, .58); solving t for displayed = (.5, .5) gives the pan fractions.
const ZOOM_ORIGIN = [0.5, 0.58];
const panFor = (point, z) => {
  const [sx, sy] = k.iso(point, P);
  const f = [sx / WIDTH, sy / HEIGHT];
  return [
    Number(((0.5 - ZOOM_ORIGIN[0] - (f[0] - ZOOM_ORIGIN[0]) * z) * 100).toFixed(1)),
    Number(((0.5 - ZOOM_ORIGIN[1] - (f[1] - ZOOM_ORIGIN[1]) * z) * 100).toFixed(1)),
  ];
};
const BEATS = [
  { t: 0, r: 0.4, zoom: 1.0, pan: [0, 0], text: { zh: ["發條星儀", "上一次鍵，世界走一回合。"], en: ["Roundworks Orrery", "One wind of the key, one round of the world."] } },
  { t: 5.2, r: 2.6, zoom: 1.06, pan: [0, 0], text: { zh: ["三勢力行星", "焰洲四回合一圈 · 霜脊六 · 沉星八。"], en: ["Three faction planets", "Yanzhou orbits in 4 rounds · Shuangji 6 · Chenxing 8."] } },
  { t: 12, r: 8.2, zoom: 1.5, pan: panFor([10, 4, 36], 1.5), text: { zh: ["衛星是據點", "每顆衛星兩到四回合繞行星一圈。"], en: ["Moons are settlements", "Each moon circles its planet in two to four rounds."] } },
  { t: 18.6, r: 13.6, zoom: 1.7, pan: panFor([-54, -33, 13], 1.7), text: { zh: ["發條艙", "副針掃過十八個階段 · 上鍵驅動整座星儀。"], en: ["The winding bay", "The sub-dial sweeps the 18 phases; the key drives the whole orrery."] } },
  { t: 23.8, r: 17.4, zoom: 1.0, pan: [0, 0], text: { zh: ["RND 0018", "上鍵十八次，世界走了十八回合。"], en: ["RND 0018", "Eighteen winds — the world walked eighteen rounds."] } },
];
const FILM_LEN = 26;
const live = `
const P = ${JSON.stringify(P)};
const MODEL = ${JSON.stringify(MODEL)};
const DIAL = ${JSON.stringify(DIAL)};
const SUB = ${JSON.stringify(SUB)};
const RATCHET = ${JSON.stringify(RATCHET)};
const KNOB = ${JSON.stringify(KNOB)};
const TAU = Math.PI * 2;
const roundAt = ${roundAt.toString()};
const armAngle = ${armAngle.toString()};
const moonAngle = ${moonAngle.toString()};
const crankAngle = ${crankAngle.toString()};
const phaseOf = ${phaseOf.toString()};
const pad4 = ${pad4.toString()};
const ratchetSvg = ${strip(ratchetSvg)};
const knobSvg = ${strip(knobSvg)};
const needleSvg = ${strip(needleSvg)};
const armSvg = ${strip(armSvg)};

const params = new URLSearchParams(location.search);
const film = params.get("film") === "1";
const embed = params.get("embed") === "1";
const lang = params.get("lang") === "en" ? "en" : "zh";
if (film) document.body.classList.add("iso-film");
if (embed) document.body.classList.add("iso-embed");
if (params.get("lang")) document.documentElement.lang = lang;

const stage = document.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const ratchetEl = svg.querySelector('[data-part="ratchet"]');
const knobEl = svg.querySelector('[data-part="knob"]');
const needleEl = svg.querySelector('[data-part="needle"]');
const phaseEl = svg.querySelector('[data-part="phase-needle"]');
const armEls = [2, 1, 0].map((i) => svg.querySelector('[data-part="arm-' + i + '"]'));
const readout = document.querySelector("[data-readout]");
const cap = document.querySelector(".iso-film-cap");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

let rounds = 0, target = 1, touring = true, visible = false, frame = 0, last = 0, clock = 0, idle = 0, drawn = null;
const STEP = 3.0;

function draw() {
  if (drawn === rounds) return;
  drawn = rounds;
  const crank = crankAngle(rounds);
  ratchetEl.innerHTML = ratchetSvg(crank, P, RATCHET);
  knobEl.innerHTML = knobSvg(crank, P, KNOB);
  needleEl.innerHTML = needleSvg(((rounds % 60) / 60) * TAU, P, DIAL.at, DIAL.r - 2.2, DIAL.faceZ + 0.15);
  phaseEl.innerHTML = needleSvg(phaseOf(rounds) * TAU, P, SUB.at, SUB.r - 1.4, SUB.faceZ + 0.15);
  for (let i = 0; i < 3; i++) armEls[i].innerHTML = armSvg(rounds, P, MODEL.arms[i], MODEL);
  const ph = 1 + Math.floor(phaseOf(rounds) * MODEL.phases);
  const label = (lang === "zh" ? "階段 " : "phase ") + String(ph).padStart(2, "0") + "/" + MODEL.phases;
  const text = "RND " + pad4(roundAt(rounds)) + " · " + label;
  if (readout.textContent !== text) readout.textContent = text;
  stage.setAttribute("aria-valuenow", String(Math.round(roundAt(rounds))));
  stage.setAttribute("aria-valuetext", text);
}
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  if (touring) { clock += dt; target = Math.floor(clock / STEP) + 1; }
  rounds += (target - rounds) * (1 - Math.exp(-dt / 0.42));
  if (Math.abs(target - rounds) < 0.002) rounds = target;
  draw();
  if (document.hidden || !visible) { frame = 0; return; }
  frame = requestAnimationFrame(tick);
}
const run = () => { if (!frame && visible && !still.matches && !film) { last = 0; frame = requestAnimationFrame(tick); } };
function steer(next) {
  touring = false;
  clearTimeout(idle);
  target = clamp(Math.round(next), 1, 60);
  if (still.matches) { rounds = target; draw(); return; }
  idle = setTimeout(() => { touring = true; clock = target * STEP; }, 4200);
  run();
}

new IntersectionObserver((entries) => {
  visible = entries[entries.length - 1].isIntersecting;
  if (visible) run();
}, { rootMargin: "120px 0px" }).observe(stage);
document.addEventListener("visibilitychange", () => { if (!document.hidden) run(); });
still.addEventListener("change", () => {
  if (still.matches) { cancelAnimationFrame(frame); frame = 0; rounds = target; drawn = null; draw(); }
  else run();
});

let drag = null;
stage.addEventListener("pointerdown", (event) => {
  drag = { x: event.clientX, rounds: target };
  stage.setPointerCapture(event.pointerId);
  steer(drag.rounds);
});
stage.addEventListener("pointermove", (event) => {
  if (!drag) return;
  const box = svg.getBoundingClientRect();
  steer(drag.rounds + (event.clientX - drag.x) / (box.width / 24));
});
stage.addEventListener("pointerup", () => { drag = null; });
stage.addEventListener("keydown", (event) => {
  let to = null;
  if (event.key === "ArrowRight" || event.key === "ArrowUp") to = target + 1;
  if (event.key === "ArrowLeft" || event.key === "ArrowDown") to = target - 1;
  if (event.key === "Home") to = 1;
  if (event.key === "End") to = 60;
  if (to === null) return;
  event.preventDefault();
  steer(to);
});

if (film) {
  const BEATS = ${JSON.stringify(BEATS)};
  const LEN = ${FILM_LEN};
  const view = { z: 1, x: 0, y: 0 };
  let ft = 0, beat = -1;
  svg.style.transformOrigin = "50% 58%";
  const applyBeat = (b) => {
    if (cap) cap.innerHTML = "<strong>" + b.text[lang][0] + "</strong><span>" + b.text[lang][1] + "</span>";
  };
  const roundsAt = (t) => {
    for (let i = 0; i < BEATS.length - 1; i++) {
      const a = BEATS[i], b = BEATS[i + 1];
      if (t <= b.t) return a.r + ((t - a.t) / (b.t - a.t)) * (b.r - a.r);
    }
    return BEATS[BEATS.length - 1].r;
  };
  const beatAt = (t) => {
    let index = 0;
    while (index < BEATS.length - 1 && BEATS[index + 1].t <= t) index++;
    return index;
  };
  const stepFilm = (dt) => {
    ft = Math.min(ft + dt, LEN - 1e-6);
    const index = beatAt(ft);
    if (index !== beat) { beat = index; applyBeat(BEATS[index]); }
    const b = BEATS[index];
    const ease = 1 - Math.exp(-dt / 0.6);
    view.z += (b.zoom - view.z) * ease;
    view.x += (b.pan[0] - view.x) * ease;
    view.y += (b.pan[1] - view.y) * ease;
    svg.style.transform = "translate(" + view.x.toFixed(3) + "%," + view.y.toFixed(3) + "%) scale(" + view.z.toFixed(4) + ")";
    rounds = roundsAt(ft);
    draw();
  };
  window.__film = {
    ready: true,
    len: LEN,
    loaded: () => document.fonts.status === "loaded",
    start: () => { ft = 0; beat = -1; drawn = null; view.z = 1; view.x = 0; view.y = 0; svg.style.transform = ""; applyBeat(BEATS[0]); stepFilm(1 / 30); },
    step: stepFilm,
    seek: (t) => { while (ft < t - 1e-6) stepFilm(Math.min(1 / 30, t - ft)); },
  };
  applyBeat(BEATS[0]);
} else {
  touring = !still.matches;
  draw();
  run();
}
`;

const body = k.plateHtml({
  fig: "ORR-1",
  title: "Roundworks Orrery · 發條星儀",
  hint: "DRAG TO WIND · ONE TURN = ONE ROUND",
  readout: "RND 0001 · 階段 01/18",
  keys: [
    { mark: "lit", label: "Sun — the world core" },
    { mark: "raised", label: "Faction planets · band colour = faction · moon wires = settlements" },
  ],
  caption:
    "A brass bench orrery of the autonomous world: wind the key once and the world advances one round. Three faction planets ride their orbit rings at 4/6/8 rounds per orbit, moons circle them as settlements, the counter dial logs rounds, and the sub-dial sweeps the round's 18 phases. 發條上一次，世界走一回合。",
  body:
    "<style>" + EXTRA_CSS + "</style>" +
    '<div class="iso-stage" tabindex="0" role="slider" aria-label="Roundworks Orrery: drag or press arrow keys to advance rounds; one turn of the key is one round" aria-valuemin="1" aria-valuemax="60" aria-valuenow="1">' +
    figure +
    "</div>" +
    '<div class="iso-film-cap" aria-hidden="true"><strong></strong><span></span></div>',
});

const page = k.pageHtml({
  title: "Roundworks Orrery · 發條星儀",
  theme,
  body,
  script: kitScript() + live,
  width: 1180,
});

const file = join(OUT, theme === "light" ? "orrery-light.html" : "orrery.html");
writeFileSync(file, page);
console.log("wrote", file);

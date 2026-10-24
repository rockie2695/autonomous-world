// 發條星儀 Roundworks Orrery — model.mjs
// Single source of truth for the figure. Every number the build script and the
// live page print or project comes from here. Pure: no DOM, no imports.

export const TAU = Math.PI * 2;

export const model = () => ({
  deck: [10, 4],             // world x/y of the column centre
  orbits: [22, 33, 44],      // engraved orbit-ring radii (stage disc r = 50, top z 15)
  period: [4, 6, 8],         // rounds per orbit, arm 0 = inner/fastest
  armTeeth: [144, 216, 288], // arm wheel teeth; drive 36 ÷ arm = 1 orbit per 4/6/8 rounds
  driveTeeth: 36,
  moons: [2, 3, 1],          // moon count per arm (settlements)
  moonPeriod: [2, 3, 4],     // moon orbit periods, rounds
  moonDist: 7.5,
  moonR: 1.2,
  planetR: 3.4,
  planetH: 2.8,
  moonPostR: 1.0,
  moonPostH: 2.2,
  sunR: 5.6,
  sunZ: 44,                  // sun sphere bottom; centre z = sunZ + sunR
  dialTicks: 60,             // round-counter dial stations
  phases: 18,                // one sweep of the sub-dial = one round (18 phases)
  rest: [2.4, 4.9, 0.6],     // arm bearing angles at round 0 (spread for the first look)
  moonRest: [[0.8, 3.9], [1.7, 3.7, 5.6], [2.6]],
  arms: [
    { index: 0, collar: 41.4, color: "#d97706", name: "焰洲" },
    { index: 1, collar: 35.0, color: "#0891b2", name: "霜脊" },
    { index: 2, collar: 28.6, color: "#7c3aed", name: "沉星" },
  ],
});

// ── pure helpers (inlined into the page too) ────────────────────────────────
export const roundAt = (rounds) => 1 + Math.floor(rounds + 1e-9); // RND counter, game style
export const armAngle = (m, rounds, i) => ((rounds / m.period[i]) * TAU + m.rest[i]) % TAU;
export const moonAngle = (m, rounds, i, j) =>
  ((rounds / m.moonPeriod[i]) * TAU + (j / m.moons[i]) * TAU) % TAU;
export const crankAngle = (rounds) => (rounds * TAU) % TAU; // 1 turn = 1 round
export const phaseOf = (rounds) => ((rounds % 1) + 1) % 1;  // sub-dial sweep per round
export const pad4 = (n) => String(Math.max(1, n)).padStart(4, "0");

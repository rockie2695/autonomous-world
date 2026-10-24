// ============================================================================
// 星艦裝配線的靜態畫 / The assembly line's static art
// ============================================================================
// Server-safe：geometry.ts 的路徑在這裡排成**畫家序**的 JSX 片段。沒有 ref 的
// 東西都放這裡；會動的（關節、火光、燈、零件開關、火花）由 live.tsx 從同一批
// 幾何資料組出來。
//
// Server-safe: geometry.ts's paths arranged here as **painter's-order** JSX
// fragments. Anything without a ref lives here; everything that moves (joints,
// fires, lamps, part display, sparks) is assembled by live.tsx from the same
// geometry.
//
// 畫家序是三層，順序不能動（view.ts 說明了為什麼這條線不需要每帧換層）：
//   遠景 → 產品 → 近景
// 遠景：地面 → 地面刻線 → 後牆（貨架、艙門、燈條槽）→ 配電櫃 → 熔金塔 → 天花板
//       （樑、吊架、燈殼）→ 遠側導軌 → **18 隻手**（見 live.tsx）
// 產品：托架 + 星艦（18 批零件，見 SHIP_PARTS）
// 近景：近側導軌 → 里程計 → 銘牌 → 火花 → 命中圈
//
// The painter's order is three planes and the sequence is load-bearing (view.ts
// explains why this line never re-layers a part): far → product → near.
// ============================================================================

import * as React from 'react';
import { Dots, Line, Solid } from '@/components/iso/react/draw';
import {
  BEAM_ART,
  CABINET_ART,
  CRADLE_ART,
  CRUCIBLE_ART,
  FLOOR_ART,
  HALL_ART,
  HAND_ART,
  LABEL_ART,
  ODO_ART,
  RACK_ART,
  RAIL_ART,
  SHIP_ART,
} from './geometry';
import { ODO_STEP } from './view';

// ── 遠景：廠房、後牆、事業設備 / Far plane: hall, back wall, plant ────────

export const HALL_EL = (
  <g key="hall">
    <path className="iso-halo" d={HALL_ART.halo} />
    {HALL_ART.feet.map((parts, index) => (
      <g key={index}>
        {parts.map((paths, part) => (
          <Solid key={part} paths={paths} tone={part ? 'mid' : 'lo'} crease="none" flat />
        ))}
      </g>
    ))}
    <Solid paths={HALL_ART.slab} tone="mid" crease="faint" />
    <Line d={HALL_ART.groove} tone="lo" />
    {/* 車道線畫在地面上：端點落在素面上是對的（線就畫在漆面上）
        Lane markings lie on the floor: their ends resting on a bare face is right */}
    <Line d={HALL_ART.lanes} tone="lo" free className="el-fine" />
    <Line d={HALL_ART.laneTicks} tone="mid" className="el-fine" free />
    <Line d={HALL_ART.screwRings} tone="lo" className="el-fine" />
    {/* 精細裝飾整組包起來：手機版一條 .el-fine 就把它們全部收掉
        Fine detail wrapped as one group: on phones a single .el-fine rule drops it */}
    <g className="el-fine">
      <Dots points={HALL_ART.screws} size={0.5} tone="mid" />
    </g>
  </g>
);

export const RACK_EL = (
  <g key="rack">
    <Solid paths={RACK_ART.slab} tone="lo" crease="faint" />
    <Line d={RACK_ART.top} tone="lo" />
    <Line d={RACK_ART.kick} tone="faint" free />
    <Line d={RACK_ART.bays} tone="faint" />
    <Line d={RACK_ART.transom} tone="lo" free />
    <Line d={RACK_ART.strip} tone="faint" free />
    <g className="el-fine">
      <Dots points={RACK_ART.dots} size={0.4} tone="mid" />
    </g>
  </g>
);

export const CABINET_EL = (
  <g key="cabinets">
    {CABINET_ART.map((cabinet, index) => (
      <g key={index}>
        <Solid paths={cabinet.body} tone="mid" crease="faint" />
        <Line d={cabinet.door} tone="lo" />
        <Line d={cabinet.vents} tone="faint" className="el-fine" free />
        <g className="el-fine">
          <Dots points={cabinet.dots} size={0.55} tone="hi" />
        </g>
      </g>
    ))}
  </g>
);

export const WORKS_EL = (
  <g key="works">
    {/* 熔金塔：本體靜態，澆口窗與澆口面會亮（live.tsx）*/}
    <Solid paths={CRUCIBLE_ART.tower} tone="mid" crease="faint" />
    <Line d={CRUCIBLE_ART.ribs} tone="faint" className="el-fine" />
    <Line d={CRUCIBLE_ART.windowRim} tone="lo" />
    <Solid paths={CRUCIBLE_ART.lid} tone="mid" crease="faint" />
    <Line d={CRUCIBLE_ART.lidRing} tone="lo" />
    <Solid paths={CRUCIBLE_ART.spout} tone="mid" crease="faint" />
    <Solid paths={CRUCIBLE_ART.spoutLip} tone="lo" crease="none" />
    <g className="el-fine">
      <Dots points={CRUCIBLE_ART.screws} size={0.5} tone="mid" />
    </g>
    {/* 天花板：樑、吊架、燈殼（燈的發光面在 live.tsx）*/}
    <Solid paths={BEAM_ART.slab} tone="mid" crease="faint" />
    <Line d={BEAM_ART.underside} tone="lo" />
    <Line d={BEAM_ART.way} tone="faint" free />
    {BEAM_ART.hangers.map((hanger, index) => (
      <Solid key={index} paths={hanger} tone="lo" crease="none" flat />
    ))}
    <g className="el-fine">
      <Dots points={BEAM_ART.hangerDots} size={0.5} tone="mid" />
    </g>
  </g>
);

export const RAIL_FAR_EL = (
  <g key="rail-far">
    <Solid paths={RAIL_ART.far} tone="mid" crease="faint" />
    <Line d={RAIL_ART.farTop} tone="lo" />
    <Line d={RAIL_ART.farTicks} tone="lo" />
    <g className="el-fine">
      <Dots points={RAIL_ART.rollerDots.filter((_, index) => index % 2 === 0)} size={0.45} tone="mid" />
    </g>
  </g>
);

/** 地板前緣：走道與料件。**近景**——它們在近側導軌之外，也就是離觀眾更近的那半
    地面，所以要在產品之後畫。
    The floor's front strip: the walkway and the stock. **Near plane** — they sit out
    beyond the near rail, the half of the floor closest to the viewer, so they are
    painted after the product. */
export const FLOOR_FRONT_EL = (
  <g key="floor-front">
    <Solid paths={FLOOR_ART.walkway} tone="lo" crease="none" flat />
    <Line d={FLOOR_ART.walkwayEdge} tone="faint" />
    <Line d={FLOOR_ART.tread} tone="faint" className="el-fine" />
    {FLOOR_ART.pallets.map((paths, index) => (
      <g key={index}>
        <Solid paths={paths} tone="mid" crease="faint" />
        <Line d={FLOOR_ART.palletLids[index] ?? ''} tone="lo" />
        <Line d={FLOOR_ART.palletBands[index] ?? ''} tone="faint" className="el-fine" free />
        <g className="el-fine">
          <Dots points={FLOOR_ART.palletDots.slice(index * 2, index * 2 + 2)} size={0.45} tone="mid" />
        </g>
      </g>
    ))}
  </g>
);

export const RAIL_NEAR_EL = (
  <g key="rail-near">
    <Solid paths={RAIL_ART.near} tone="mid" crease="faint" />
    <Line d={RAIL_ART.nearTop} tone="lo" />
    <Line d={RAIL_ART.nearTicks} tone="lo" />
    <g className="el-fine">
      <Dots points={RAIL_ART.rollerDots.filter((_, index) => index % 2 === 1)} size={0.45} tone="mid" />
    </g>
  </g>
);

// ── 產品：托架 + 18 批零件 / Product: the cradle and the 18 batches ────────

export const CRADLE_EL = (
  <g key="cradle">
    {CRADLE_ART.skids.map((skid, index) => (
      <Solid key={index} paths={skid} tone="lo" crease="faint" />
    ))}
    <Solid paths={CRADLE_ART.slab} tone="mid" crease="faint" />
    <Line d={CRADLE_ART.top} tone="lo" />
    {CRADLE_ART.clamps.map((clamp, index) => (
      <Solid key={index} paths={clamp} tone="hi" crease="none" flat />
    ))}
    <Dots points={CRADLE_ART.clampDots} size={0.5} tone="hi" />
  </g>
);

/**
 * 18 批零件：index 0 = 第 1 站。順序就是裝配順序，也就是左側清單的階段順序。
 * live.tsx 逐批包上 ref、用 display 開關，所以這裡只管把畫好的東西寫出來。
 * The 18 batches: index 0 = station 1. The order *is* the build order, which is
 * the phase order of the list beside the machine. live.tsx wraps each of them in a
 * display-toggled ref; this file only writes down what is drawn.
 */
export const SHIP_PARTS: React.ReactNode[] = [
  // 1 龍骨 / keel
  <g key="keel">
    <Solid paths={SHIP_ART.keel} tone="mid" crease="faint" />
  </g>,
  // 2 前肋骨 / fore ribs
  <g key="ribs-fore">
    {SHIP_ART.ribsFore.map((paths, index) => (
      <Solid key={index} paths={paths} tone="hi" crease="none" flat />
    ))}
  </g>,
  // 3 後肋骨 / aft ribs
  <g key="ribs-aft">
    {SHIP_ART.ribsAft.map((paths, index) => (
      <Solid key={index} paths={paths} tone="hi" crease="none" flat />
    ))}
    <Line d={SHIP_ART.ribsAftSeam.join('')} tone="lo" />
  </g>,
  // 4 脊樑 / dorsal spine
  <g key="spine">
    <Solid paths={SHIP_ART.spine} tone="mid" crease="faint" />
  </g>,
  // 5 滑橇 / skids
  <g key="skids">
    {SHIP_ART.skids.map((paths, index) => (
      <Solid key={index} paths={paths} tone="lo" crease="none" flat />
    ))}
    <g className="el-fine">
      <Dots points={SHIP_ART.skidDots} size={0.45} tone="mid" />
    </g>
  </g>,
  // 6 下外板 / lower plating
  <g key="plates-low">
    <Solid paths={SHIP_ART.lowerPort} tone="mid" crease="faint" />
    <Solid paths={SHIP_ART.lowerStarboard} tone="mid" crease="faint" />
  </g>,
  // 7 左中板 + 左舷外板縫 / port midships and the port plating seams
  <g key="plates-mid-port">
    <Solid paths={SHIP_ART.midPort} tone="mid" crease="faint" />
    <Line d={SHIP_ART.plankSeamsPort} tone="faint" className="el-fine" />
  </g>,
  // 8 右中板 + 右舷外板縫 / starboard midships and its seams
  <g key="plates-mid-starboard">
    <Solid paths={SHIP_ART.midStarboard} tone="mid" crease="faint" />
    <Line d={SHIP_ART.plankSeamsStarboard} tone="faint" className="el-fine" />
  </g>,
  // 9 甲板 / deck
  <g key="deck">
    <Solid paths={SHIP_ART.deck} tone="hi" crease="faint" />
    <Line d={SHIP_ART.deckSeam} tone="lo" />
    <Line d={SHIP_ART.deckTies.join('')} tone="faint" className="el-fine" />
  </g>,
  // 10 艦橋 + 窗 / bridge and its windows
  <g key="bridge">
    <Solid paths={SHIP_ART.bridge} tone="mid" crease="faint" />
    <Solid paths={SHIP_ART.bridgeCap} tone="hi" crease="faint" />
    <path className="el-hot" d={SHIP_ART.bridgeWindows.fill} opacity={0.7} />
  </g>,
  // 11 桅杆與天線盤 / mast and dish
  <g key="mast">
    <Solid paths={SHIP_ART.mast} tone="mid" crease="none" />
    <Solid paths={SHIP_ART.mastYard} tone="mid" crease="none" />
    <Solid paths={SHIP_ART.mastDish} tone="hi" crease="faint" />
    <Line d={SHIP_ART.mastDishRing} tone="lo" />
  </g>,
  // 12 舷側管線 / flank ducting
  <g key="ducts">
    {/* 線圈繞過管線：後段先畫、前段後畫，管線才像穿過去
        The coil wraps the pipe: its back run first, its front run after */}
    <Line d={SHIP_ART.ductCoil.back} tone="mid" free />
    <Line d={SHIP_ART.ductPipe} tone="lo" free />
    <Line d={SHIP_ART.ductCoil.front} tone="mid" free />
    <Dots points={SHIP_ART.ductEnds} size={0.55} tone="mid" />
  </g>,
  // 13 左翼 / port wing
  <g key="wing-port">
    <Solid paths={SHIP_ART.wingPort} tone="mid" crease="faint" />
    <Line d={SHIP_ART.wingRimPort} tone="lo" />
    {SHIP_ART.wingPylonsPort.map((paths, index) => (
      <Solid key={index} paths={paths} tone="lo" crease="none" flat />
    ))}
  </g>,
  // 14 右翼 / starboard wing
  <g key="wing-starboard">
    <Solid paths={SHIP_ART.wingStarboard} tone="mid" crease="faint" />
    <Line d={SHIP_ART.wingRimStarboard} tone="lo" />
    {SHIP_ART.wingPylonsStarboard.map((paths, index) => (
      <Solid key={index} paths={paths} tone="lo" crease="none" flat />
    ))}
  </g>,
  // 15 塗裝 / livery
  <g key="livery">
    <Line d={SHIP_ART.livery} tone="hi" />
    <Solid paths={SHIP_ART.liveryPatch} tone="hi" crease="faint" />
    <Line d={SHIP_ART.liveryDisc} tone="hi" />
  </g>,
  // 16 引擎艙 / the engine bay
  <g key="bay">
    <Solid paths={SHIP_ART.bayPort} tone="lo" crease="faint" />
    <Solid paths={SHIP_ART.bayStarboard} tone="lo" crease="faint" />
    <Line d={SHIP_ART.baySeams} tone="faint" free />
    <Solid paths={SHIP_ART.bayLintel} tone="mid" crease="faint" />
    <Line d={SHIP_ART.bayRibs.join('')} tone="lo" />
  </g>,
  // 17 引擎本體 / the engine itself
  <g key="engine">
    <Solid paths={SHIP_ART.engine} tone="mid" crease="faint" />
    <Solid paths={SHIP_ART.engineCollar} tone="hi" crease="faint" />
    <Line d={SHIP_ART.engineRing} tone="lo" />
    {SHIP_ART.engineMounts.map((paths, index) => (
      <Solid key={index} paths={paths} tone="lo" crease="none" />
    ))}
    <path className="el-hot" d={SHIP_ART.engineSlit.fill} opacity={0.55} />
  </g>,
  // 18 鐘口 / the bell
  <g key="bell">
    <Solid paths={SHIP_ART.bell} tone="mid" crease="faint" />
    <Line d={SHIP_ART.bellRings} tone="lo" />
    <Line d={SHIP_ART.bellMouth} tone="faint" />
  </g>,
];

// ── 近景：里程計與銘牌 / Near plane: the odometer and the label plate ──────

export const ODO_EL = (
  <g key="odo">
    <Solid paths={ODO_ART.housing} tone="mid" crease="faint" />
    <Line d={ODO_ART.bezel} tone="lo" />
    <Solid paths={ODO_ART.window} tone="lo" crease="none" flat />
    <Line d={ODO_ART.windowLine} tone="lo" />
    <Line d={ODO_ART.screwRings} tone="lo" className="el-fine" />
    <Dots points={ODO_ART.screws} size={0.5} tone="mid" />
  </g>
);

export const LABEL_EL = (
  <g key="label">
    <Solid paths={LABEL_ART.plate} tone="lo" crease="none" />
    <Line d={LABEL_ART.line} tone="faint" />
    {/* 刻線是印的字：允許停在素面上 / The rules are printed text: they may stop on a bare face */}
    <Line d={LABEL_ART.rules} tone="lo" free />
    <Dots points={LABEL_ART.screws} size={0.45} tone="mid" />
  </g>
);

/** 命中圈：全部畫在最上層，任何東西都蓋不掉它（抓的仍是基座的位置）
    The hit circles: drawn last so nothing can sit over them (they still mark the pedestals) */
export const HITS_EL = (
  <g key="hits">
    {HAND_ART.map((hand) => (
      <circle
        key={hand.index}
        className="el-hit"
        data-station={hand.index}
        cx={hand.hit[0]}
        cy={hand.hit[1]}
        r={hand.hitR}
      />
    ))}
  </g>
);

/** 數位帶的內容（0..9 兩輪）由 live 掛進每個槽 / The strip glyphs (0..9 twice); live hangs them in each slot */
export function OdoStripGlyphs(): React.ReactNode {
  return Array.from({ length: 20 }, (_, index) => (
    <text
      key={index}
      className="iso-face-text"
      data-tone="hi"
      x={0}
      y={index * ODO_STEP + 3}
      fontSize={9}
      textAnchor="middle"
    >
      {index % 10}
    </text>
  ));
}

/**
 * 18 隻手的**不動**部分：基座、立柱、肩、接縫。會動的三段（上臂、前臂、工具頭）
 * 由 live.tsx 依序嵌進三個關節群組裡。
 * The **static** half of each hand: base plate, column, shoulder, seams. The three
 * moving segments (upper arm, forearm, tool) are nested into the joint groups by
 * live.tsx.
 */
// 小圓柱用 flat：一個 14px 寬的圓柱上四條色階只有 2px 寬，糊在一起；flat 只留
// 填充與輪廓，反而更清楚，也讓 18 隻手的節點數少一半以上。大的面（地面、艦體、
// 肩座）仍然走完整的四色階——那才是 kit 的實體語言。
// Small cylinders go flat: four shade bands on a 14px-wide cylinder are 2px each and
// smear together, whereas fill plus outline reads better — and it halves the 18
// hands' node count. The big surfaces (floor, hull, shoulder) keep the full
// four-tone language, which is the kit's solid language.
export const HAND_BASES: React.ReactNode[] = HAND_ART.map((hand) => (
  <g key={hand.index}>
    <Solid paths={hand.pedestal} tone="mid" crease="faint" />
    <Solid paths={hand.column} tone="mid" crease="none" flat />
    <Line d={hand.seams} tone="faint" className="el-fine" free />
    <Line d={hand.columnRing} tone="lo" />
    <Solid paths={hand.shoulder} tone="hi" crease="faint" />
  </g>
));

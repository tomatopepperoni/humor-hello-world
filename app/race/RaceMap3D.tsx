"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LANDMARK_STATIONS, LINE_1, STOPS_TO_COLUMBIA } from "@/lib/line1";

export type MapRider = {
  id: string;
  name: string;
  avatarUrl: string | null;
  station: number;
  points: number;
  me: boolean;
};

type Api = {
  findMe: () => void;
  showAll: () => void;
  replay: () => void;
  zoom: (dir: 1 | -1) => void;
  setExploring: (on: boolean) => void;
};

/* ---------- geometry helpers (lat/lng → scene units) ---------- */

const LAT0 = 40.755;
const LNG0 = -73.99;
const K = 600; // scene units per degree of latitude
const COS0 = Math.cos((LAT0 * Math.PI) / 180);
const toXZ = (lat: number, lng: number) => ({ x: (lng - LNG0) * COS0 * K, z: -(lat - LAT0) * K });

// The Hudson shoreline (rough) and Central Park, for orientation.
const HUDSON = [
  [40.7, -74.0185],
  [40.711, -74.0165],
  [40.725, -74.0115],
  [40.74, -74.0095],
  [40.755, -74.0045],
  [40.77, -73.9935],
  [40.785, -73.9865],
  [40.8, -73.9755],
  [40.812, -73.9675],
] as const;
const CENTRAL_PARK = [
  [40.7681, -73.9812],
  [40.8005, -73.9582],
  [40.7968, -73.9493],
  [40.7644, -73.973],
] as const;

function initial(name: string) {
  return (name.trim()[0] ?? "?").toUpperCase();
}

function avatarHTML(r: MapRider, size = 26) {
  const ring = r.me ? "box-shadow:0 0 0 3px #fccc0a" : "box-shadow:0 0 0 2px #fff";
  if (r.avatarUrl) {
    return `<img src="${r.avatarUrl}" alt="" style="width:${size}px;height:${size}px;border-radius:999px;object-fit:cover;${ring}" />`;
  }
  return `<span style="width:${size}px;height:${size}px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;background:#fff;color:#16181a;font:700 12px/1 var(--font-geist-sans),sans-serif;${ring}">${initial(
    r.name
  )}</span>`;
}

function escapeHTML(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

/**
 * Race to Columbia in 3D: the 1 line laid out on a dark map of Manhattan.
 * - Track is red as far up as anyone has ridden this week (built together),
 *   grey beyond that.
 * - Pillars at each station show how many riders have passed it.
 * - Every rider is a train that rides from South Ferry to their current stop
 *   and waits there; yours is marked "You".
 * - Two more 1 trains keep running up and down the line.
 * Falls back to `children` (the 2D line diagram) when WebGL isn't available.
 */
export default function RaceMap3D({ riders, children }: { riders: MapRider[]; children: React.ReactNode }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<Api | null>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [exploring, setExploring] = useState(false);
  const [touch, setTouch] = useState(false);

  const active = useMemo(() => riders.filter((r) => r.points > 0), [riders]);
  const me = riders.find((r) => r.me);
  const frontier = active.reduce((m, r) => Math.max(m, r.station), 0);
  const totalStops = active.reduce((s, r) => s + Math.min(r.points, STOPS_TO_COLUMBIA), 0);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    let disposed = false;
    let cleanup = () => {};

    (async () => {
      const THREE = await import("three");
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
      const { CSS2DRenderer, CSS2DObject } = await import("three/examples/jsm/renderers/CSS2DRenderer.js");
      if (disposed) return;

      let renderer: InstanceType<typeof THREE.WebGLRenderer>;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "low-power" });
      } catch {
        setFailed(true);
        return;
      }

      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const coarse = window.matchMedia("(pointer: coarse)").matches;
      setTouch(coarse);

      const width = () => wrap.clientWidth;
      const height = () => wrap.clientHeight;

      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(width(), height());
      renderer.setClearColor(0x000000);
      renderer.domElement.style.display = "block";
      renderer.domElement.setAttribute("aria-hidden", "true");
      wrap.appendChild(renderer.domElement);

      const labels = new CSS2DRenderer();
      labels.setSize(width(), height());
      Object.assign(labels.domElement.style, { position: "absolute", inset: "0", pointerEvents: "none" });
      labels.domElement.setAttribute("aria-hidden", "true");
      wrap.appendChild(labels.domElement);

      const scene = new THREE.Scene();
      scene.fog = new THREE.Fog(0x000000, 90, 190);
      const camera = new THREE.PerspectiveCamera(38, width() / height(), 0.1, 500);

      scene.add(new THREE.AmbientLight(0xffffff, 0.55));
      const sun = new THREE.DirectionalLight(0xffffff, 1.6);
      sun.position.set(-30, 60, 40);
      scene.add(sun);

      // Everything map-related sits in one group, turned so the line runs "up" the screen.
      const world = new THREE.Group();
      world.rotation.y = 0.335;
      scene.add(world);

      // CSS2DRenderer rewrites the outer element's display and transform every frame,
      // so all styling goes on an inner element.
      const makeLabel = (inner: HTMLElement, outerClass = "") => {
        const outer = document.createElement("div");
        if (outerClass) outer.className = outerClass;
        outer.appendChild(inner);
        return new CSS2DObject(outer);
      };

      const pts = LINE_1.map((s) => toXZ(s.lat, s.lng));
      const cx = (Math.min(...pts.map((p) => p.x)) + Math.max(...pts.map((p) => p.x))) / 2;
      const cz = (Math.min(...pts.map((p) => p.z)) + Math.max(...pts.map((p) => p.z))) / 2;
      const v = (lat: number, lng: number, y = 0) => {
        const p = toXZ(lat, lng);
        return new THREE.Vector3(p.x - cx, y, p.z - cz);
      };
      const stationPos = LINE_1.map((s) => v(s.lat, s.lng, 0));

      /* ground, street grid, river, park */
      const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(400, 400),
        new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 1 })
      );
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -0.02;
      world.add(ground);

      const grid = new THREE.GridHelper(260, 130, 0x1f2023, 0x161719);
      grid.rotation.y = -0.506; // Manhattan's street grid is ~29° off true north
      grid.position.y = 0;
      world.add(grid);

      const flat = (coords: readonly (readonly [number, number])[], color: number, y: number) => {
        const shape = new THREE.Shape();
        coords.forEach(([lat, lng], i) => {
          const p = toXZ(lat, lng);
          const x = p.x - cx;
          const zz = -(p.z - cz); // Shape is in the XY plane; we rotate it onto the ground
          if (i === 0) shape.moveTo(x, zz);
          else shape.lineTo(x, zz);
        });
        const mesh = new THREE.Mesh(
          new THREE.ShapeGeometry(shape),
          new THREE.MeshStandardMaterial({ color, roughness: 1 })
        );
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.y = y;
        world.add(mesh);
        return mesh;
      };
      const riverPoly: [number, number][] = [
        ...HUDSON.map(([a, b]) => [a, b] as [number, number]),
        [40.812, -74.06],
        [40.69, -74.06],
        [40.69, -74.02],
      ];
      flat(riverPoly, 0x0a1a2e, 0.005);
      flat(CENTRAL_PARK, 0x0f2a18, 0.01);

      const areaLabel = (text: string, at: InstanceType<typeof THREE.Vector3>, color: string) => {
        const el = document.createElement("div");
        el.textContent = text;
        el.style.cssText = `font:600 12px var(--font-geist-sans),sans-serif;letter-spacing:.02em;color:${color};white-space:nowrap`;
        const o = makeLabel(el);
        o.position.copy(at);
        world.add(o);
      };
      areaLabel("Hudson River", v(40.742, -74.0175, 0.1), "#5b7fa8");
      areaLabel("Central Park", v(40.7825, -73.9655, 0.1), "#4f8a5f");

      /* the line */
      const curve = new THREE.CatmullRomCurve3(stationPos, false, "catmullrom", 0.35);
      const DIV = 1200;
      const lengths = curve.getLengths(DIV);
      const total = lengths[DIV];
      const n = LINE_1.length;
      const uAt = (i: number) => lengths[Math.round((i / (n - 1)) * DIV)] / total;
      const uFrontier = uAt(frontier);

      const segment = (u0: number, u1: number) => {
        const samples: InstanceType<typeof THREE.Vector3>[] = [];
        const steps = Math.max(2, Math.round((u1 - u0) * 300));
        for (let k = 0; k <= steps; k++) samples.push(curve.getPointAt(u0 + ((u1 - u0) * k) / steps));
        return new THREE.CatmullRomCurve3(samples);
      };
      const tube = (c: InstanceType<typeof THREE.CatmullRomCurve3>, r: number, mat: InstanceType<typeof THREE.Material>) => {
        const m = new THREE.Mesh(new THREE.TubeGeometry(c, Math.max(8, c.points.length * 2), r, 10, false), mat);
        m.position.y = 0.18;
        world.add(m);
        return m;
      };
      if (uFrontier > 0.001) {
        const built = segment(0, uFrontier);
        tube(built, 0.24, new THREE.MeshStandardMaterial({ color: 0xee352e, emissive: 0xee352e, emissiveIntensity: 0.55 }));
        tube(built, 0.6, new THREE.MeshBasicMaterial({ color: 0xee352e, transparent: true, opacity: 0.14, depthWrite: false }));
      }
      if (uFrontier < 0.999) {
        tube(segment(uFrontier, 1), 0.18, new THREE.MeshStandardMaterial({ color: 0x3a3b3e, roughness: 0.9 }));
      }

      /* stations + traffic pillars */
      const passed = (i: number) => active.filter((r) => r.station >= i).length;
      const maxPassed = Math.max(1, ...LINE_1.map((_, i) => passed(i)));
      const pulse: InstanceType<typeof THREE.Mesh>[] = [];
      LINE_1.forEach((s, i) => {
        const last = i === n - 1;
        const built = i <= frontier;
        const disc = new THREE.Mesh(
          new THREE.CylinderGeometry(last ? 0.95 : 0.5, last ? 0.95 : 0.5, 0.3, 28),
          new THREE.MeshStandardMaterial({
            color: last ? 0xfccc0a : built ? 0xffffff : 0x4a4b4f,
            emissive: last ? 0xfccc0a : 0x000000,
            emissiveIntensity: last ? 0.35 : 0,
            roughness: 0.5,
          })
        );
        disc.position.copy(stationPos[i]).setY(0.2);
        world.add(disc);
        if (last) {
          const ring = new THREE.Mesh(
            new THREE.RingGeometry(1.3, 1.55, 40),
            new THREE.MeshBasicMaterial({ color: 0xfccc0a, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
          );
          ring.rotation.x = -Math.PI / 2;
          ring.position.copy(stationPos[i]).setY(0.05);
          world.add(ring);
          pulse.push(ring);
        }
        const count = passed(i);
        if (count > 0 && i > 0) {
          const h = 0.3 + (count / maxPassed) * 2.2;
          const pillar = new THREE.Mesh(
            new THREE.CylinderGeometry(0.12, 0.12, h, 10),
            new THREE.MeshBasicMaterial({ color: 0xff5a4f, transparent: true, opacity: 0.3 + 0.35 * (count / maxPassed) })
          );
          // stand the pillar just east of the platform so trains don't run through it
          pillar.position.copy(stationPos[i]).add(new THREE.Vector3(1.4, h / 2, 0));
          world.add(pillar);
        }

        const hasRider = active.some((r) => r.station === i);
        if (LANDMARK_STATIONS.has(i) || hasRider || i === frontier + 1) {
          const el = document.createElement("div");
          const building = i === frontier + 1 && i < n - 1;
          el.innerHTML = `${escapeHTML(s.name)}${building ? ' <span style="color:#fccc0a">next to build</span>' : ""}`;
          el.style.cssText = `font:${last ? 700 : 500} ${last ? 13 : 11}px var(--font-geist-sans),sans-serif;color:${
            last ? "#16181a" : "#fff"
          };background:${last ? "#fccc0a" : "rgba(0,0,0,.72)"};padding:2px 7px;border-radius:999px;white-space:nowrap;margin-left:14px`;
          const o = makeLabel(el, !LANDMARK_STATIONS.has(i) && !building ? "map-minor" : "");
          o.position.copy(stationPos[i]).setY(0.9);
          o.center.set(0, 0.5);
          world.add(o);
        }
      });

      /* trains */
      const carLen = 1.35;
      const carGap = 0.12;
      const silver = new THREE.MeshStandardMaterial({ color: 0xc9ccd1, metalness: 0.55, roughness: 0.35 });
      const stripe = new THREE.MeshStandardMaterial({ color: 0xee352e, emissive: 0xee352e, emissiveIntensity: 0.3 });
      const lamp = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
      type Train = { cars: InstanceType<typeof THREE.Group>[]; label?: InstanceType<typeof CSS2DObject> };
      const makeTrain = (cars = 3, highlight = false): Train => {
        const list: InstanceType<typeof THREE.Group>[] = [];
        for (let c = 0; c < cars; c++) {
          const g = new THREE.Group();
          const body = new THREE.Mesh(new THREE.BoxGeometry(carLen, 0.5, 0.56), highlight ? new THREE.MeshStandardMaterial({ color: 0xfccc0a, metalness: 0.3, roughness: 0.4 }) : silver);
          body.position.y = 0.55;
          g.add(body);
          const band = new THREE.Mesh(new THREE.BoxGeometry(carLen * 1.002, 0.07, 0.58), stripe);
          band.position.y = 0.62;
          g.add(band);
          if (c === 0) {
            const light = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.3), lamp);
            light.position.set(carLen / 2 + 0.02, 0.55, 0);
            g.add(light);
          }
          world.add(g);
          list.push(g);
        }
        return { cars: list };
      };
      const tmpT = new THREE.Vector3();
      const placeTrain = (t: Train, u: number, dir: 1 | -1 = 1) => {
        t.cars.forEach((car, c) => {
          const uc = Math.min(1, Math.max(0, u - dir * (c * (carLen + carGap) + carLen / 2) / total));
          const p = curve.getPointAt(uc);
          curve.getTangentAt(uc, tmpT);
          car.position.set(p.x, 0, p.z);
          car.rotation.y = Math.atan2(-tmpT.z, tmpT.x) + (dir === -1 ? Math.PI : 0);
        });
        if (t.label) {
          const head = t.cars[0].position;
          t.label.position.set(head.x, 1.6, head.z);
        }
      };

      // Rider trains: queue behind each other when several riders share a stop.
      const trainLenU = (3 * (carLen + carGap)) / total;
      const order = [...active].sort((a, b) => b.station - a.station || Number(b.me) - Number(a.me));
      const seenAt = new Map<number, number>();
      const riderTrains = order.map((r, idx) => {
        const slot = seenAt.get(r.station) ?? 0;
        seenAt.set(r.station, slot + 1);
        const t = makeTrain(3, r.me);
        const el = document.createElement("div");
        el.style.cssText =
          "display:flex;align-items:center;gap:6px;padding:3px 9px 3px 3px;border-radius:999px;white-space:nowrap;font:600 12px var(--font-geist-sans),sans-serif;" +
          (r.me ? "background:#fccc0a;color:#16181a" : "background:rgba(255,255,255,.92);color:#16181a");
        el.innerHTML = r.me
          ? `${avatarHTML(r, 22)}<span>You</span><span class="map-name" style="font-weight:500;opacity:.75">${escapeHTML(LINE_1[r.station].name)}</span>`
          : `${avatarHTML(r, 22)}<span class="map-name">${escapeHTML(r.name)}</span>`;
        t.label = makeLabel(el, r.me ? "" : "map-rider");
        t.label.center.set(0.5, 1);
        world.add(t.label);
        const target = Math.max(0.0005, uAt(r.station) + 0.0035 - slot * trainLenU * 1.15);
        return { rider: r, train: t, target, delay: idx * 0.35 };
      });

      // Two ordinary 1 trains running up and down the whole line.
      const ambient = [makeTrain(4), makeTrain(4)];

      /* camera + controls */
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.enableZoom = false; // page scroll stays page scroll; use the +/- buttons
      controls.minDistance = 10;
      controls.maxDistance = 150;
      controls.maxPolarAngle = 1.32;
      controls.autoRotate = false;
      controls.enabled = !coarse; // on phones, a drag scrolls the page until "Explore" is tapped
      renderer.domElement.style.touchAction = coarse ? "pan-y" : "none";
      // Until someone touches the map, the camera sways gently left and right.
      let swaying = !reduced;
      controls.addEventListener("start", () => (swaying = false));

      const narrow = width() / height() < 0.9;
      const home = narrow
        ? { pos: new THREE.Vector3(10, 84, 68), target: new THREE.Vector3(0, 0, 0) }
        : { pos: new THREE.Vector3(23, 35, 50), target: new THREE.Vector3(0, 0, 3) };
      camera.position.copy(home.pos);
      controls.target.copy(home.target);
      controls.update();

      let fly: { from: [InstanceType<typeof THREE.Vector3>, InstanceType<typeof THREE.Vector3>]; to: [InstanceType<typeof THREE.Vector3>, InstanceType<typeof THREE.Vector3>]; t: number } | null = null;
      const flyTo = (pos: InstanceType<typeof THREE.Vector3>, target: InstanceType<typeof THREE.Vector3>) => {
        swaying = false;
        if (reduced) {
          camera.position.copy(pos);
          controls.target.copy(target);
          return;
        }
        fly = { from: [camera.position.clone(), controls.target.clone()], to: [pos, target], t: 0 };
      };

      let clock = 0;
      const restart = () => {
        clock = 0;
      };

      apiRef.current = {
        findMe: () => {
          const mine = riderTrains.find((rt) => rt.rider.me);
          const at = mine ? world.localToWorld(curve.getPointAt(mine.target).clone()) : world.localToWorld(stationPos[0].clone());
          flyTo(at.clone().add(new THREE.Vector3(9, 11, 14)), at);
        },
        showAll: () => flyTo(home.pos.clone(), home.target.clone()),
        replay: restart,
        zoom: (dir) => {
          if (dir === 1) controls.dollyIn(1.25);
          else controls.dollyOut(1.25);
          controls.update();
        },
        setExploring: (on) => {
          if (on) swaying = false;
          controls.enabled = on || !coarse;
          renderer.domElement.style.touchAction = on || !coarse ? "none" : "pan-y";
        },
      };

      /* loop */
      let raf = 0;
      let visible = true;
      let last = performance.now();
      const SPEED = 0.16; // fraction of the line per second for rider trains
      const ease = (x: number) => 1 - Math.pow(1 - x, 3);

      const frame = (now: number) => {
        raf = requestAnimationFrame(frame);
        if (!visible) return;
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        clock += dt;

        for (const rt of riderTrains) {
          if (reduced) {
            placeTrain(rt.train, rt.target);
            continue;
          }
          const dur = Math.max(0.6, rt.target / SPEED);
          const p = Math.min(1, Math.max(0, (clock - rt.delay) / dur));
          placeTrain(rt.train, Math.max(0.0005, rt.target * ease(p)));
        }
        ambient.forEach((t, i) => {
          if (reduced) {
            placeTrain(t, i === 0 ? 0.25 : 0.7, i === 0 ? 1 : -1);
            return;
          }
          const period = 46; // seconds for a full round trip
          const phase = ((clock + i * period * 0.5) % period) / period;
          const up = phase < 0.5;
          const u = up ? phase * 2 : 2 - phase * 2;
          placeTrain(t, 0.02 + u * 0.96, up ? 1 : -1);
        });
        pulse.forEach((m) => {
          if (reduced) return;
          const s = 1 + 0.25 * Math.sin(clock * 2.2);
          m.scale.set(s, s, s);
          (m.material as InstanceType<typeof THREE.MeshBasicMaterial>).opacity = 0.45 + 0.3 * Math.sin(clock * 2.2 + Math.PI);
        });

        if (swaying) {
          const off = home.pos.clone().sub(home.target);
          off.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.32 * Math.sin(clock * 0.18));
          camera.position.copy(home.target).add(off);
          controls.target.copy(home.target);
        }
        if (fly) {
          fly.t = Math.min(1, fly.t + dt / 1.1);
          const k = ease(fly.t);
          camera.position.lerpVectors(fly.from[0], fly.to[0], k);
          controls.target.lerpVectors(fly.from[1], fly.to[1], k);
          if (fly.t >= 1) fly = null;
        }
        controls.update();
        renderer.render(scene, camera);
        labels.render(scene, camera);
      };
      raf = requestAnimationFrame(frame);

      const io = new IntersectionObserver(([e]) => {
        visible = e.isIntersecting && document.visibilityState === "visible";
        last = performance.now();
      });
      io.observe(wrap);
      const onVis = () => {
        visible = document.visibilityState === "visible";
        last = performance.now();
      };
      document.addEventListener("visibilitychange", onVis);

      const ro = new ResizeObserver(() => {
        camera.aspect = width() / height();
        camera.updateProjectionMatrix();
        renderer.setSize(width(), height());
        labels.setSize(width(), height());
      });
      ro.observe(wrap);

      setReady(true);

      cleanup = () => {
        cancelAnimationFrame(raf);
        io.disconnect();
        ro.disconnect();
        document.removeEventListener("visibilitychange", onVis);
        controls.dispose();
        scene.traverse((o) => {
          const mesh = o as InstanceType<typeof THREE.Mesh>;
          if (mesh.geometry) mesh.geometry.dispose();
          const mat = mesh.material as InstanceType<typeof THREE.Material> | InstanceType<typeof THREE.Material>[] | undefined;
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else mat?.dispose();
        });
        renderer.dispose();
        renderer.domElement.remove();
        labels.domElement.remove();
        apiRef.current = null;
      };
    })();

    return () => {
      disposed = true;
      cleanup();
    };
    // Re-build the scene only when the riders change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(riders)]);

  if (failed) return <>{children}</>;

  const btn =
    "rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-ink shadow-sm transition-colors hover:bg-white disabled:opacity-50 sm:px-3.5 sm:py-2 sm:text-sm";

  return (
    <div className="relative overflow-hidden rounded-xl bg-sign">
      <div ref={wrapRef} className="relative h-[440px] w-full sm:h-[520px] lg:h-[600px]" />

      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-white/70">Laying track…</div>
      )}

      {/* what you're looking at */}
      <div className="pointer-events-none absolute left-3 top-3 max-w-[15rem] rounded-lg bg-black/70 px-3 py-2 text-white sm:left-4 sm:top-4 sm:max-w-[16rem] sm:p-3">
        <p className="text-[13px] font-semibold">Built together this week</p>
        <p className="mt-0.5 text-sm text-white/85">
          {frontier === 0 ? "Nobody has left South Ferry yet." : `South Ferry → ${LINE_1[frontier].name}`}
        </p>
        <p className="mt-1 text-xs text-white/60">
          {active.length} {active.length === 1 ? "rider" : "riders"}, {totalStops} stops ridden
        </p>
        <ul className="mt-2 hidden space-y-1 text-xs text-white/75 sm:block">
          <li className="flex items-center gap-2">
            <span className="h-1 w-5 rounded bg-bullet-red" /> Track someone has reached
          </li>
          <li className="flex items-center gap-2">
            <span className="h-1 w-5 rounded bg-[#3a3b3e]" /> Not reached yet
          </li>
          <li className="flex items-center gap-2">
            <span className="h-3 w-1 rounded bg-bullet-red/70" /> Riders who passed a stop
          </li>
        </ul>
      </div>

      {/* controls */}
      <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-end gap-2 sm:bottom-4 sm:right-4">
        {touch && (
          <button
            type="button"
            className={exploring ? "rounded-full bg-metro px-3 py-1.5 text-xs font-semibold text-ink sm:px-3.5 sm:py-2 sm:text-sm" : btn}
            onClick={() => {
              const next = !exploring;
              setExploring(next);
              apiRef.current?.setExploring(next);
            }}
          >
            {exploring ? "Done" : "Explore map"}
          </button>
        )}
        {me && me.points > 0 && (
          <button type="button" className={btn} onClick={() => apiRef.current?.findMe()} disabled={!ready}>
            Find my train
          </button>
        )}
        <button type="button" className={btn} onClick={() => apiRef.current?.showAll()} disabled={!ready}>
          Whole line
        </button>
        <button type="button" className={btn} onClick={() => apiRef.current?.replay()} disabled={!ready}>
          Replay the week
        </button>
        <span className="flex overflow-hidden rounded-full bg-white/95 shadow-sm">
          <button type="button" aria-label="Zoom in" className="px-3 py-1.5 text-sm font-bold text-ink hover:bg-white sm:py-2" onClick={() => apiRef.current?.zoom(1)}>
            +
          </button>
          <button type="button" aria-label="Zoom out" className="border-l px-3 py-1.5 text-sm font-bold text-ink hover:bg-white sm:py-2" onClick={() => apiRef.current?.zoom(-1)}>
            −
          </button>
        </span>
      </div>

      <p className="sr-only">
        Map of the 1 train from South Ferry to 116 St–Columbia University. {active.length} riders this week; the furthest
        is at {LINE_1[frontier].name}. The standings below list every rider and their stop.
      </p>
    </div>
  );
}

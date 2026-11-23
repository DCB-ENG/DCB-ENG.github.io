#!/usr/bin/env python3
"""DCB ENG roll-cage B-rep tube STEP exporter (CAD conversion, not cage certification).

Usage:
    pip install cadquery
    python roll_cage_step_export.py roll-cage-geometry.json output-folder

This command needs a local OpenCascade/CadQuery installation. Each numbered tube is
exported as an analytic hollow STEP B-rep, coped against its modelled parent tubes
when the source has enough geometry. Never interpret an unmodelled end as coped.
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import re
from pathlib import Path

import cadquery as cq

V = cq.Vector


def vec(p):
    if not isinstance(p, dict):
        raise ValueError("Missing coordinate object in cage geometry.")
    return V(float(p["x"]), float(p["y"]), float(p.get("z", 0)))


def num(x):
    value = float(x)
    if not math.isfinite(value):
        raise ValueError("Non-finite measurement in geometry.")
    return value


def check_tube(od, wall):
    od, wall = num(od), num(wall)
    if not (0 < wall < od / 2 and od < 1000):
        raise ValueError(f"Invalid round steel tube OD/wall: {od} x {wall}")
    return od, wall


def cylinder_envelope(p, q, od):
    start, end = vec(p), vec(q)
    d = end.sub(start)
    if d.Length <= 0.01:
        raise ValueError("Straight member has coincident endpoints.")
    return cq.Solid.makeCylinder(od / 2, d.Length, start, d.normalized())


def hollow_straight(p, q, od, wall):
    od, wall = check_tube(od, wall)
    outer = cylinder_envelope(p, q, od)
    start, end = vec(p), vec(q)
    d = end.sub(start).normalized()
    distance = end.sub(start).Length
    inner = cq.Solid.makeCylinder(od / 2 - wall, distance + 0.02, start.sub(d.multiply(0.01)), d)
    return outer.cut(inner), outer


def swept_bend(vertices, bends, od, wall):
    """Analytic lines and circular arcs (no polyline/facet substitute)."""
    od, wall = check_tube(od, wall)
    if not vertices or len(vertices) < 2:
        raise ValueError("Formed member requires at least two centreline points.")
    points = [vec(x) for x in vertices]
    edges = []
    last = points[0]
    for bend in bends:
        entry, mid, exit_ = vec(bend["entry"]), vec(bend["midPoint"]), vec(bend["exit"])
        if entry.sub(last).Length > 0.0001:
            edges.append(cq.Edge.makeLine(last, entry))
        edges.append(cq.Edge.makeThreePointArc(entry, mid, exit_))
        last = exit_
    if last.sub(points[-1]).Length > 0.0001:
        edges.append(cq.Edge.makeLine(last, points[-1]))
    if not edges:
        raise ValueError("Unable to construct the bent tube spine.")
    path = cq.Wire.assembleEdges(edges)
    tangent = edges[0].tangentAt(0)
    def envelope(radius):
        ring = cq.Wire.makeCircle(radius, points[0], tangent)
        return cq.Solid.sweep(ring, [], path, makeSolid=True, isFrenet=True)
    outer = envelope(od / 2)
    inner = envelope(od / 2 - wall)
    return outer.cut(inner), outer


def file_slug(name):
    # Avoid "_number" patterns (ProCAM interprets these as imported quantities).
    cleaned = re.sub(r"[^A-Za-z0-9-]+", "-", str(name)).strip("-").lower()
    return cleaned or "tube"


def safe_name(part):
    pid = str(part.get("partNumber") or part.get("id") or "unnumbered")
    return file_slug(pid)


def validate_shape(shape, part):
    solids = shape.Solids()
    if len(solids) != 1 or not shape.isValid() or shape.Volume() <= 0:
        raise ValueError(f"{part}: coped result is not one valid solid; joint needs manual CAD modelling")
    return shape


def export_tubes(data, output_dir):
    output_dir.mkdir(parents=True, exist_ok=True)
    if data.get("schema") not in ("roll-cage-geometry-v3", "roll-cage-geometry-v4"):
        raise ValueError("Use the current Roll Cage Generator geometry JSON export.")
    cut_list = data.get("cutList") or {}
    parts = cut_list.get("parts") or []
    by_id = {r["id"]: r for r in parts}
    hoop = data["hoop"]
    front = data.get("frontStructure") or {}
    stays = data.get("stays") or {}
    brace = data.get("brace") or {}
    harness = data.get("harness") or {}
    door = data.get("sideIntrusion") or {}
    extra = data.get("reinforcementMembers") or []
    shapes, parents, missing = {}, {}, {}

    def add(id_, solid, envelope, parent_ids=(), warning=None):
        if id_ not in by_id:
            return
        shapes[id_] = solid
        parents[id_] = list(parent_ids)
        if envelope is not None:
            parents["$envelope-" + id_] = envelope
        if warning:
            missing[id_] = warning

    # Continuous cage tubes: true circular centreline arcs swept by a circle.
    main, main_outer = swept_bend(
        hoop["centerlineVertices"], hoop.get("bends") or [], hoop["OD"], hoop["wall"])
    add("main-hoop", main, main_outer)

    if front and not front.get("errors"):
        for side in ("left", "right"):
            member = front.get(side)
            if member and not member.get("errors"):
                shape, outer = swept_bend(member["points"], member["bends"], front["OD"], front["wall"])
                add("front-leg-" + side, shape, outer, ("main-hoop",))
        header = front.get("header")
        if header:
            solid, outer = hollow_straight(header["left"], header["right"], header["OD"], header["wall"])
            add("windscreen-header", solid, outer, ("front-leg-left", "front-leg-right"))

    if brace.get("upper") and brace.get("lower"):
        solid, outer = hollow_straight(brace["upper"], brace["lower"], brace["OD"], brace["wall"])
        add("diagonal-brace", solid, outer, ("main-hoop",))

    if stays.get("left"):
        run = num(stays.get("run"))
        for side in ("left", "right"):
            top = dict(stays[side], z=0.0)
            foot = dict(stays[side + "Foot"], z=run)
            # Use part-numbered cut list for correct configurable CHS size.
            part = by_id.get("rear-stay-" + side)
            if part:
                solid, outer = hollow_straight(top, foot, part["od"], part["wall"])
                add("rear-stay-" + side, solid, outer, ("main-hoop",))

    if harness.get("left") and harness.get("right"):
        solid, outer = hollow_straight(harness["left"], harness["right"], harness["OD"], harness["wall"])
        add("harness-bar", solid, outer, ("rear-stay-left", "rear-stay-right"))

    if door.get("members"):
        for member in door["members"]:
            side = member["name"].lower()
            part = by_id.get("side-intrusion-" + side)
            if not part:
                continue
            solid, outer = hollow_straight(member["rear"], member["front"], part["od"], part["wall"])
            parent_ids = ["main-hoop"]
            warn = None
            if "front-leg-" + side in shapes:
                parent_ids.append("front-leg-" + side)
            else:
                warn = "Unmodelled front reference: FRONT end remains square; check manual fit"
            add("side-intrusion-" + side, solid, outer, parent_ids, warn)

    for member in extra:
        id_ = member.get("id")
        if id_ not in by_id:
            continue
        p = member["near"]
        q = member["far"]
        solid, outer = hollow_straight(p, q, member["od"], member["wall"])
        parent_ids = []
        warn = []
        for parent in (member.get("nearParent"), member.get("farParent")):
            kind = (parent or {}).get("kind")
            side = (parent or {}).get("side")
            if kind == "hoop":
                parent_ids.append("main-hoop")
            elif kind == "front":
                parent_ids.append("front-leg-" + str(side))
            elif kind == "header":
                parent_ids.append("windscreen-header")
            else:
                warn.append("unmodelled parent endpoint")
        add(id_, solid, outer, parent_ids, "; ".join(warn) if warn else None)

    logs, final_solids = [], []
    for part in parts:
        id_ = part["id"]
        pid = safe_name(part)
        if id_ not in shapes:
            raise ValueError(f"Part {pid} has no modelled geometry: {id_}")
        solid = shapes[id_]
        parent_ids = list(dict.fromkeys(parents.get(id_, [])))
        for parent_id in parent_ids:
            parent_outer = parents.get("$envelope-" + parent_id)
            if parent_outer is None:
                missing[id_] = (missing.get(id_, "") + " Parent envelope unavailable: " + parent_id).strip()
                continue
            solid = solid.cut(parent_outer)
        solid = validate_shape(solid, pid)
        filename = pid + "-" + file_slug(part.get("member", id_)) + ".step"
        dest = output_dir / filename
        cq.exporters.export(solid, str(dest), exportType="STEP")
        # Parse the file back through OpenCascade to reject invalid/empty exports.
        imported = cq.importers.importStep(str(dest))
        if len(imported.solids().vals()) != 1 or not imported.solids().val().isValid():
            raise ValueError(f"STEP round-trip validation failed for {filename}")
        final_solids.append(solid)
        logs.append(dict(
            part_number=part["partNumber"], filename=filename,
            member=part.get("member", id_), od=part["od"], wall=part["wall"],
            centreline_mm=part["span"], prep_blank_mm=part["blank"],
            model_volume_mm3=round(solid.Volume(), 2),
            cope_status="CHECK" if id_ in missing else "MODELLING COMPLETE - VERIFY FIT",
            note=missing.get(id_, "")
        ))
    with (output_dir / "cut-list-and-step-manifest.csv").open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(logs[0]))
        writer.writeheader()
        writer.writerows(logs)
    if len(final_solids) > 1:
        compound = cq.Compound.makeCompound(final_solids)
        cq.exporters.export(compound, str(output_dir / "roll-cage-assembly-preview.step"), exportType="STEP")
    return logs


def main():
    parser = argparse.ArgumentParser(description="Export actual hollow, coped B-rep STEP solids from DCB ENG roll-cage geometry JSON.")
    parser.add_argument("geometry_json", type=Path)
    parser.add_argument("output_dir", type=Path)
    args = parser.parse_args()
    data = json.loads(args.geometry_json.read_text(encoding="utf-8-sig"))
    logs = export_tubes(data, args.output_dir)
    print(f"Exported {len(logs)} individually numbered STEP solids to {args.output_dir}")
    for row in logs:
        print(f"{row['part_number']}: {row['filename']} — {row['cope_status']}")
        if row["note"]:
            print("  CAUTION:", row["note"])
    print("IMPORTANT: check each cope in CAD and on a physical test fit. Gussets, crossing-bar treatment, mounting feet, distortion, weld gaps and rules are NOT modelled or approved.")


if __name__ == "__main__":
    main()

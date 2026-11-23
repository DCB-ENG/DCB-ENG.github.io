## Experimental browser STEP lab (three tubes)

The Roll Cage Generator now offers **Browser STEP lab · 3 tubes** as an experimental proof of concept. Enable the **main-hoop diagonal** and **continuous front legs**, set the measured dimensions, and use that button beside the 1:1 fishmouth exports. It opens a separate page using an OpenCascade WebAssembly CAD kernel from the [brepjs](https://github.com/andymai/brepjs) and [occt-wasm](https://github.com/andymai/occt-wasm) projects.

1. Open [Roll Cage Generator](https://dcb-eng.github.io/roll-cage/), enable the diagonal and front legs, and enter the actual cage dimensions.
2. Click **Browser STEP lab · 3 tubes**. Your geometry is passed locally to the lab tab; if browser privacy settings prevent this, download the JSON and use its file picker instead.
3. Choose **left** (RC-002) or **right** (RC-003) front leg.
4. Click **Generate three STEP solids**. On success, download the three individual STEP files or the single ZIP.
5. Open each file in CAD or ProCAM and check tube diameter, wall thickness, bend and joint geometry. Do not manufacture from the prototype without independent inspection.

The proof-of-concept includes only the **main hoop, one front leg and the main-hoop diagonal**. It creates actual analytical B-rep solids with circular bends, a hollow wall, and modelled cope Boolean cuts. The UI checks the STEP file structure and volume; the repository's independent OpenCascade test verifies that generated STEP files reopen as valid, single-solid models.

This is **not yet a full website STEP exporter**. Other members, mounting feet, structural crossings, gussets, weld gaps and production machine setup are not exported. A browser may require an initial download of the WebAssembly CAD kernel from the pinned external module CDN. No vehicle geometry is intentionally sent to that service.

For **all** modelled members, continue using the desktop converter below.

---

# Roll Cage Generator — true STEP tube solids

The offline converter accepts geometry JSON from GitHub Pages and exports a wider set of tube STEP files (with the limitations below). The companion **roll_cage_step_export.py** converts JSON into actual analytic CadQuery/OpenCascade STEP B-rep solids on a computer.

## Windows setup

1. Install 64-bit Python 3.11 or 3.12.
2. Open PowerShell and install the CAD kernel:

       py -3.12 -m pip install cadquery

   Use -3.11 if you installed Python 3.11.
3. Download the [STEP exporter script](../tools/roll_cage_step_export.py) using GitHub's Raw view. Put it in your working folder.
4. In the [Roll Cage Generator](https://dcb-eng.github.io/roll-cage/), enter dimensions and selected cage members, then choose **Save geometry JSON · for CAD STEP**.
5. Run from a terminal in the directory with the script and JSON:

       py -3.12 roll_cage_step_export.py roll-cage-geometry-for-future-step.json cage-step-output

The converter writes one STEP per numbered tube, a combined assembly-preview STEP and cut-list-and-step-manifest.csv. Filenames use hyphens rather than underscore immediately followed by a number, avoiding ProCAM's quantity parser.

## What is modelled

- Main hoop: continuous hollow CHS swept along true circular bends, not a faceted centreline.
- Front legs: the measured 3D bent centrelines, tube OD and wall.
- Straight bars: one hollow cylinder between each calculated joint-centre pair.
- Modelled parent CHS external envelopes are Boolean-cut from branches for fishmouth ends.
- Each part is verified as a single valid B-rep solid and STEP is reimported for validation.
- Parts export separately for tube laser CAM review.

## Important limitations

**This is CAD preparation, NOT a certified safety cage or a CNC production program.**

- Main-hoop X, roof X, door-bar crossing and pillar reinforcement intersections can require cutting, gussets or engineering details. The converter does NOT resolve these crossings or create gussets. Inspect and finish the joints in CAD before using a laser.
- If the front receiving tube has not been modelled, the front end remains uncut. Check the manifest for this warning.
- Footplates, reinforcing mounting plates, harness ferrules, demountable couplers, tube ovalisation, machine kerf and weld gaps are not modelled.
- The generated solids represent finished tube centreline joint positions, NOT the oversized straight preparation blanks from the cutting list.
- In real fabrication, check each solid and its orientation against a test fit, your bender and the actual approved cage layout. Check the relevant AASA or Motorsport Australia regulations for your competition.
- Assembly-preview STEP is intended for checking geometric fit and will show still-unresolved structural crossings.

## Verification

The repository's [STEP CAD regression workflow](../.github/workflows/check-roll-cage-step.yml) installs CadQuery, generates known test geometry, reads the STEP solids back and checks their topological validity.

If a part gives zero or multiple solid bodies, the converter stops rather than exporting a knowingly invalid tube. Use FreeCAD or another STEP-capable CAD tool to inspect and repair any difficult intersection.

A future release may package the converter as a standalone Windows executable or expand the experimental browser WebAssembly CAD kernel to the entire cage. Merely renaming JSON or SVG to STEP does not produce a solid.

# Roll Cage Generator — true STEP tube solids

The Roll Cage Generator on GitHub Pages exports geometry JSON, not STEP. The companion **roll_cage_step_export.py** converts JSON into actual analytic CadQuery/OpenCascade STEP B-rep solids on a computer.

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

A future release may package the converter as a standalone Windows executable or provide a browser WebAssembly CAD kernel; renaming JSON or SVG as a STEP file would not produce a real solid.

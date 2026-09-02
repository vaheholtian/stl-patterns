# Research brief 02: verify specific FeatureScript API facts

> **RETIRED 2026-09-01.** The project moved to a browser mesh tool (see `planning/00-decisions.md`). Do not run this brief unless the FeatureScript route is revived. Brief 03 is the active one.

**Research only. Do not write FeatureScript, do not create Onshape documents.**
Write the report to `C:\Code\STL-patterns\research\02-findings.md` using the format at the bottom.

## Why this pass exists

Brief 01 (`01-onshape-featurescript-research-brief.md`, findings in `01-findings.md`) could not load the FeatureScript library documentation because `cad.onshape.com/FsDoc/library.html` is one huge page and the fetch tool truncated it. This pass is a checklist of exact function names to confirm or deny. Every item is a yes/no plus the signature. Do not paraphrase forum posts for these; find the actual documentation entry or the Standard Library source.

## How to get at the documentation

Try these in order and record which one worked:

1. The Onshape Standard Library source is plain FeatureScript files (`manipulator.fs`, `evaluate.fs`, `curveOperations.fs` or similar, `boolean.fs`, `sketch.fs`). Search GitHub for mirrors: queries like `"linearManipulator" manipulator.fs`, `"opCreateCurvesOnFace"`, `"evFaceTangentPlane" evaluate.fs`. Several public repos mirror the std library. A raw file from such a mirror is small and fetchable. Note the std version number in the file header if present.
2. FsDoc per-module anchors: `https://cad.onshape.com/FsDoc/library.html#module-manipulator.fs`, `#module-evaluate.fs`, `#module-curveOperations.fs`, `#module-boolean.fs`, `#module-sketch.fs`. If your fetch tool supports a byte range or "start at anchor", use it.
3. The FsDoc index page `https://cad.onshape.com/FsDoc/` links to smaller pages (`tokens.html`, `variables.html`, `annotations.html`, etc.) and has a search box; report anything useful.
4. Forum posts only as a last resort, and mark those items "forum only".

## Checklist

For each function below: does it exist (yes / no / not found), exact signature or parameter map keys, one line on what it does, and the source you read it in.

### M. Manipulators (module manipulator.fs)
- `linearManipulator`
- `angularManipulator`
- `flipManipulator`
- `pointsManipulator` (does it allow free 3D dragging of a point? what does the feature receive back after a drag: index, position, both?)
- `triadManipulator`
- `fullTriadManipulator`
- Any other manipulator constructor in the module (list them all).
- The `onManipulatorChange` mechanism: what annotation or function signature does a feature implement to receive a drag, and what map does it receive?
- Is there any manipulator option that constrains the drag to a face or surface? (Expected answer: no. Confirm.)

### C. Creating curves in 3D, not inside a sketch
- `opPolyline`
- `opFitSpline`
- `opCreateCurvesOnFace` (already known to exist; get the exact `CurveOnFaceDefinition` fields)
- `opCreateWiresFromPoints` or any function that makes a wire body from a list of 3D points (report whatever the real name is)
- `opHelix`, `opCreateBSplineCurve` (if present)
- In sketch.fs: `skPolyline`, `skFittedSpline`, `skArc`, `skEllipticalArc`, `skLineSegment`

### E. Evaluating geometry
- `evFaceTangentPlane` (does the parameter go in as a (u,v) vector? what does it return?)
- `evFaceTangentPlanes` (plural, batch version)
- `evSurfaceDefinition` (list every return type: Plane, Cylinder, Cone, Sphere, Torus, BSplineSurface, other)
- `evDistance` (confirm it returns the face parameter of the closest point)
- `evEdgeTangentLine` and `evEdgeTangentLines` (sampling points along an edge at given parameters)
- `evCurveDefinition` (return types)
- `evLength`, `evVolume`, `evArea`, `evBox3d`, `evApproximateCentroid`, `evVertexPoint`
- Anything named like `evFaceNormal...` (expected: does not exist, normal comes from the tangent plane. Confirm.)
- Face parameter convention: are face (u,v) parameters normalized to the unit square [0,1]x[0,1] for every face type, or are they the raw surface parameters (angle in radians, length in meters)? Find the documentation sentence that states this.
- Behavior on closed and degenerate surfaces: on a full sphere or full cylinder face, where is the u seam, and what does `evFaceTangentPlane` return at a sphere pole? Any documented caveats.
- Is there a function returning a face's parameter range or "parameter box" (something like `evFaceParameterBounds`)? If not, say how the community finds the range.
- `evDistance` from an arbitrary 3D point to a face: does it return the closest surface point and its (u,v)? Does it work for points off the surface in either direction? This is the intended way to project layout points back onto a doubly-curved face.

### S. Making solids from 3D curves, for cut and emboss tool bodies
- `opLoft`: can the profiles be 3D wire bodies (not sketch regions)? Can it loft between two closed 3D polylines?
- `opSweep`: can the path be a 3D wire body, and the profile a small sketch region? Any constraint that the profile must be perpendicular to the path start?
- `opExtrude`: can the entity be a closed 3D wire (non-planar)? If not, note that clearly.
- `opThicken`: does it work on a sheet body made from `opLoft` or `opFillSurface`?
- `opFillSurface` or `opPatch`: whatever exists for filling a closed 3D wire loop with a surface.
- `opOffsetFace`
- `opBoolean`: parameter map keys, `targetsAndToolsNeedGrouping`, `keepTools`, `eraseImprintedEdges`, and any documented guidance on many tools in one call.
- `opDeleteBodies`

### P. Projecting curves onto faces
- `opSplitFace`: parameter keys. Can it take edges plus a direction to project curves onto a face? Does it also accept faces as tools?
- Is there `opProjectCurves`, `opProjectCurve`, or similar? What does the native "Project curve" feature call under the hood (look in std for `projectCurve`)?
- Is there any std function whose name contains `wrap` (search `wrap` in std, case-insensitive). What does the native Wrap feature call? Is `opWrap` a thing?

### Q. Queries useful for island detection
- `qCreatedBy(id, EntityType.BODY)`
- `qBodyType`, `qOwnerBody`, `qContainsPoint`
- Any query for "bodies smaller than a volume" (expected: none, must loop `evVolume`). Confirm.

### T. Limits
- The documented regeneration time limit per feature or per Part Studio, if any official number exists (brief 01 found only "about 10 minutes" from user reports).
- Any documented limit on array size or string length in FeatureScript.
- Confirm the recursion depth figure (~1500) with a source.

### N. Native Wrap feature, current state
- Supported target face types today (cylinder, cone, anything else such as surfaces of revolution or splined faces). Cite the current help page and date.
- Whether Wrap's emboss/deboss result can be produced with a fixed height perpendicular to the face.
- Whether a later custom feature can select the faces Wrap created (expected: yes, they are normal faces; just confirm there's no oddity).

## Rules

- Exact names only. If a name in this checklist is wrong, say what the correct name is.
- "Not found" is a valid answer; say where you looked.
- Do not include performance opinions in this report; brief 01 covered that.
- Keep the report compact. This is a lookup table, not an essay.

## Output format

```
# Findings 02: FeatureScript API verification

## How I got the docs
(which method from the list worked, std version number if seen)

## M. Manipulators
| Name | Exists | Signature / keys | Notes | Source |
(one row per item; then a short paragraph on the onManipulatorChange mechanism)

## C. Curves in 3D
| Name | Exists | Signature / keys | Notes | Source |

## E. Evaluation
| Name | Exists | Signature / keys | Notes | Source |

## S. Solids from curves
| Name | Exists | Signature / keys | Notes | Source |

## P. Projection and wrap
| Name | Exists | Signature / keys | Notes | Source |

## Q. Queries
| Name | Exists | Signature / keys | Notes | Source |

## T. Limits
bullets

## N. Native Wrap
bullets

## Corrections to brief 01
Anything in 01-findings.md this pass proved wrong.

## Sources
numbered URLs with access dates
```

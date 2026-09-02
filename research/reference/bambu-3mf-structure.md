# What a Bambu Studio 3MF looks like (from a 2-cube sample, BambuStudio 02.08.02.61, 2026-09-02)

Sample files are in `bambu-3mf-sample/` (metadata PNGs and the 61 KB project_settings.config omitted).

## Zip layout
- `[Content_Types].xml` — declares rels, model, png, gcode types.
- `_rels/.rels` — points to `/3D/3dmodel.model` plus thumbnails.
- `3D/3dmodel.model` — root model. Holds metadata and a single `<object type="model">` made of `<components>` that reference meshes stored in a separate file. One `<build><item>` places that object on the plate.
- `3D/_rels/3dmodel.model.rels` — relationship to the objects file.
- `3D/Objects/object_1.model` — the actual `<mesh>` data (vertices and triangles), one `<object>` per mesh, each with a `p:UUID`.
- `Metadata/model_settings.config` — Bambu-specific: object names, per-part names, per-part transforms, extruder, plate assignment, mesh repair stats.
- `Metadata/project_settings.config` — full slicer profile (61 KB). Not needed for import.
- `Metadata/*.png` — thumbnails. Not needed.

## Observations that matter for our exporter
- Units: `unit="millimeter"`.
- Bambu uses the 3MF **production extension** (`xmlns:p`, `requiredextensions="p"`, `p:UUID` on every object, component, build, and item; `p:path` to put meshes in a separate file). This is Bambu's *writer* style. Bambu's *reader* also accepts plain core-spec 3MF (single `3dmodel.model` with inline meshes, no production extension), which is what our minimal writer should emit first. Confirm on first export test.
- **Objects vs parts.** In this sample the two cubes are **one object (id 3) with two parts** (components 1 and 2), not two separate objects. That is how Bambu represents "one print object made of several volumes" (what you get from Merge, or Add Part). Two independent print objects would instead appear as two `<object>` entries in the root model with two `<build><item>` entries. Our exporter needs to decide which to emit:
  - one object with parts: user sees one thing on the plate, parts keep their identity (useful if we ever export the pattern as a separate volume for a different color or setting);
  - separate objects: user can move and slice them independently.
  For a patterned single part, emit one object with one mesh. For pre-split regions, either works; parts is the closer match to "same physical part".
- Transforms are 3x4 row-major-ish strings: `"1 0 0 0 1 0 0 0 1 tx ty tz"` (rotation 3x3 then translation).
- Triangles are counter-clockwise outward, 0-based vertex indices, per the core spec.
- `model_settings.config` is optional for import but is where names come from. Without it Bambu names objects from the `<object name="">` attribute or the filename.

## Still untested
- Whether an **Onshape** multi-body 3MF export arrives in Bambu Studio as separate objects, separate parts, or one merged mesh. This sample was made inside Bambu Studio, so it does not answer that. Needs an Onshape-exported file.

# What an Onshape 3MF export looks like (2-body Part Studio, exported 2026-09-02)

Sample in `onshape-3mf-sample/`. Answers the open question: **yes, Onshape keeps bodies separate.**

- Single `3D/3dmodel.model`, plain core spec with inline meshes. No separate objects file.
- **Two `<object>` entries, one per body, named after the Onshape parts** (`name="Part 1"`, `name="Part 2"`), and **two `<build><item>` entries**. So they arrive as two independent objects, not one object with parts. In Bambu Studio that means two entries on the plate; the user would Merge them if they want a single print object.
- **Units are `meter`**, not millimeter. Coordinates are tiny (0.0128 for a 12.8 mm half-cube). Our loader must read the `unit` attribute and scale to millimeters. Do not assume three.js's 3MFLoader does this; verify. Bambu Studio handles it.
- Uses the material extension for per-object color (`m:colorgroup`, `pid`/`pindex`) and a custom `PTC_onshape_metadata` entity_type tag. Both ignorable.
- No transforms on the build items; geometry is in Part Studio coordinates.
- Triangles per cube: 12. Onshape tessellates flat faces minimally; curved faces will follow the export dialog's resolution setting (fine/medium/coarse or custom angle/chord). For pattern work the user should export at the finest setting, since the cut quality is bounded by the input mesh density.

## Consequence for the app
- Pre-splitting regions in Onshape is a supported workflow: each region becomes its own object in the 3MF, selectable by name.
- The app needs a units-aware 3MF reader (meter, millimeter, and the other spec units) and should tell the user the detected unit.
- Exporting one object with parts vs separate objects is our choice; Onshape shows the separate-objects style is fine for import.

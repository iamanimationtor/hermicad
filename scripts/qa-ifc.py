"""بازخوانی مستقل: pip install ifcopenshell pytest؛ سپس python scripts/qa-ifc.py"""
from pathlib import Path
import ifcopenshell
import ifcopenshell.validate
import ifcopenshell.geom
import ifcopenshell.util.placement

paths = sorted(Path(".preview/ifc-qa").glob("*.ifc"))
assert len(paths) == 6, "ابتدا npx tsx scripts/qa-ifc-fixtures.ts اجرا شود"
for path in paths:
    model = ifcopenshell.open(str(path))
    logger = ifcopenshell.validate.json_logger()
    ifcopenshell.validate.validate(model, logger, express_rules=True)
    assert not logger.statements, (path, logger.statements[:3])
    roots = model.by_type("IfcRoot")
    assert len({r.GlobalId for r in roots}) == len(roots)
    settings = ifcopenshell.geom.settings()
    settings.set("dimensionality", ifcopenshell.ifcopenshell_wrapper.CURVES_SURFACES_AND_SOLIDS)
    settings.set("use-world-coords", True)
    shapes = 0
    for product in model.by_type("IfcProduct"):
        if not product.Representation:
            continue
        shape = ifcopenshell.geom.create_shape(settings, product)
        assert len(shape.geometry.verts) > 0, product
        shapes += 1
    for storey in model.by_type("IfcBuildingStorey"):
        matrix = ifcopenshell.util.placement.get_local_placement(storey.ObjectPlacement)
        assert abs(matrix[2, 3] - storey.Elevation) < 1e-6
    if path.stem == "parameters":
        window = model.by_type("IfcWindow")[0]
        assert window.Name == "آزمون ' پنجره"
        assert abs(window.OverallHeight - 1.7) < 1e-6
        assert abs(window.OverallWidth - 1.8) < 1e-6
        coords = ifcopenshell.geom.create_shape(settings, window).geometry.verts
        zs = coords[2::3]
        assert abs(min(zs) - 4.5) < 1e-6 and abs(max(zs) - 6.2) < 1e-6
        footing = next(p for p in model.by_type("IfcProduct") if p.ObjectType == "footing-isolated")
        vertices = ifcopenshell.geom.create_shape(settings, footing).geometry.verts
        assert abs(min(vertices[2::3]) + 0.8) < 1e-6 and abs(max(vertices[2::3])) < 1e-6
    print(f"{path.name}: خطای شِما/EXPRESS = ۰؛ هندسهٔ بازخوانی‌شده = {shapes}")

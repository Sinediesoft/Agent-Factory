FeatureScript 2641;
import(path : "onshape/std/geometry.fs", version : "2641.0");

const WIDTH = { (millimeter) : [3200, 3840, 4200] } as LengthBoundSpec;
const DEPTH = { (millimeter) : [3000, 3220, 3800] } as LengthBoundSpec;
const OPENING = { (millimeter) : [1800, 2500, 2550] } as LengthBoundSpec;
const WALL = { (millimeter) : [40, 80, 120] } as LengthBoundSpec;

// Z is vertical. The machine loads from the negative Y side.
annotation { "Feature Type Name" : "CNC-L01 enclosure" }
export const cncEnclosure = defineFeature(function(context is Context, id is Id, definition is map)
    precondition
    {
        annotation { "Name" : "Overall width" }
        isLength(definition.width, WIDTH);
        annotation { "Name" : "Overall depth" }
        isLength(definition.depth, DEPTH);
        annotation { "Name" : "Loading opening width" }
        isLength(definition.opening, OPENING);
        annotation { "Name" : "Wall thickness" }
        isLength(definition.wall, WALL);
    }
    {
        const x = definition.width / 2;
        const y = definition.depth / 2;
        const w = definition.wall;
        const base = 320 * millimeter;
        const top = 3060 * millimeter;
        const port = definition.opening / 2;
        const extra = 1 * millimeter;
        fCuboid(context, id + "stock", {
                "corner1" : vector(-x, -y, base), "corner2" : vector(x, y, top) });
        fCuboid(context, id + "cavity", {
                "corner1" : vector(-x + w, -y + w, base + w),
                "corner2" : vector(x - w, y - w, top - w) });
        fCuboid(context, id + "opening", {
                "corner1" : vector(-port, -y - extra, 730 * millimeter),
                "corner2" : vector(port, -y + w + extra, 2310 * millimeter) });
        fCuboid(context, id + "reveal", {
                "corner1" : vector(-port, -y - extra, 2470 * millimeter),
                "corner2" : vector(port, -y + 16 * millimeter, 2510 * millimeter) });
        var tools = [qCreatedBy(id + "cavity", EntityType.BODY),
                     qCreatedBy(id + "opening", EntityType.BODY),
                     qCreatedBy(id + "reveal", EntityType.BODY)];
        for (var i = 0; i < 5; i += 1)
        {
            const ventId = id + ("vent" ~ i);
            const z = (1900 + 95 * i) * millimeter;
            fCuboid(context, ventId, {
                    "corner1" : vector(-x - extra, -150 * millimeter, z),
                    "corner2" : vector(-x + w + extra, 900 * millimeter, z + 42 * millimeter) });
            tools = append(tools, qCreatedBy(ventId, EntityType.BODY));
        }
        const body = qCreatedBy(id + "stock", EntityType.BODY);
        opBoolean(context, id + "machineOpenings", {
                "targets" : body, "tools" : qUnion(tools),
                "operationType" : BooleanOperationType.SUBTRACTION });
        setProperty(context, { "entities" : body, "propertyType" : PropertyType.NAME,
                    "value" : "CNC-L01 enclosure" });
    });

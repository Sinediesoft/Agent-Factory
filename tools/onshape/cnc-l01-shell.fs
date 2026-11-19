FeatureScript 2641;
import(path : "onshape/std/geometry.fs", version : "2641.0");

// External styling reference: FANUC ROBODRILL alpha-D21MiB5 Plus.
// Scene installation geometry, in millimetres. Load from the negative Y side.
const CABINET_WIDTH = { (millimeter) : [2850, 2920, 3200] } as LengthBoundSpec;
const CABINET_DEPTH = { (millimeter) : [2400, 2660, 3100] } as LengthBoundSpec;
const DOOR_OPENING = { (millimeter) : [1020, 1110, 1130] } as LengthBoundSpec;
const PANEL_WALL = { (millimeter) : [48, 60, 95] } as LengthBoundSpec;
const IVORY = color(0.91, 0.905, 0.865);
const YELLOW = color(0.99, 0.78, 0.11);
const GRAPHITE = color(0.19, 0.205, 0.22);
const BLACK = color(0.075, 0.08, 0.09);
const RED = color(0.82, 0.075, 0.07);
const GLASS = color(0.42, 0.54, 0.56, 0.23);

function block(context is Context, id is Id, a is Vector, b is Vector) returns Query
{
    fCuboid(context, id, { "corner1" : a * millimeter, "corner2" : b * millimeter });
    return qCreatedBy(id, EntityType.BODY);
}

function finish(context is Context, body is Query, name is string, paint is Color)
{
    setProperty(context, { "entities" : body, "propertyType" : PropertyType.NAME, "value" : name });
    setProperty(context, { "entities" : body, "propertyType" : PropertyType.APPEARANCE, "value" : paint });
}

function subtract(context is Context, id is Id, target is Query, tools is array)
{
    opBoolean(context, id, { "targets" : target, "tools" : qUnion(tools),
        "operationType" : BooleanOperationType.SUBTRACTION });
}

function joinBodies(context is Context, id is Id, bodies is array)
{
    opBoolean(context, id, { "tools" : qUnion(bodies), "operationType" : BooleanOperationType.UNION });
}

function roundPart(context is Context, id is Id, start is Vector, end is Vector, r is number) returns Query
{
    fCylinder(context, id, { "bottomCenter" : start * millimeter, "topCenter" : end * millimeter,
                            "radius" : r * millimeter });
    return qCreatedBy(id, EntityType.BODY);
}

function extrudeProfile(context is Context, id is Id, profile is Id, direction is Vector, depth is number) returns Query
{
    opExtrude(context, id, { "entities" : qSketchRegion(profile, true), "direction" : direction,
        "endBound" : BoundingType.BLIND, "endDepth" : depth * millimeter });
    opDeleteBodies(context, id + "clean", { "entities" : qCreatedBy(profile, EntityType.BODY) });
    return qCreatedBy(id, EntityType.BODY);
}

// Clip a diagonal opening to the lower or upper edge of its rectangular window.
function clipHeight(points is array, limit is number, keepAbove is boolean) returns array
{
    var result = [];
    for (var i = 0; i < size(points); i += 1)
    {
        const a = points[i];
        const b = points[(i + 1) % size(points)];
        const aInside = keepAbove ? a[1] >= limit : a[1] <= limit;
        const bInside = keepAbove ? b[1] >= limit : b[1] <= limit;
        if (aInside)
            result = append(result, a);
        if (aInside != bInside)
            result = append(result, a + (b - a) * ((limit - a[1]) / (b[1] - a[1])));
    }
    return result;
}

function diagonalWindow(context is Context, id is Id, target is Query, pane is Plane, width is number, height is number)
{
    const sketchId = id + "profile";
    var sk = newSketchOnPlane(context, sketchId, { "sketchPlane" : pane });
    const rise = width * 1.20;
    for (var i = 0; i < 30; i += 1)
    {
        const z = -rise + 29 + i * 178;
        if (z >= height)
            break;
        var p = [vector(0,z), vector(width,z+rise), vector(width,z+rise+114), vector(0,z+114)];
        p = clipHeight(clipHeight(p, 0, true), height, false);
        if (size(p) >= 3)
        {
            var path = [];
            for (var v in p)
                path = append(path, v * millimeter);
            skPolyline(sk, "slot" ~ i, { "points" : append(path, path[0]) });
        }
    }
    skSolve(sk);
    const cuts = extrudeProfile(context, id + "slots", sketchId, -pane.normal, 80);
    subtract(context, id + "cut", target, [cuts]);
}

function printedLegend(context is Context, id is Id, x is number, y is number,
                       z is number, h is number, label is string, ink is Color)
{
    // A recessed carrier holds all glyphs in one part, behind the white fascia.
    const carrier = block(context, id + "carrier", vector(x-8,y+1,z-8), vector(x+560,y+4,z+h+8));
    const profile = id + "text";
    var sk = newSketchOnPlane(context, profile, { "sketchPlane" :
        plane(vector(x,y+2,z) * millimeter, vector(0,-1,0), vector(1,0,0)) });
    skText(sk, "label", { "text" : label, "fontName" : "OpenSans-Bold.ttf",
           "firstCorner" : vector(0,0) * millimeter, "secondCorner" : vector(560,h) * millimeter });
    skSolve(sk);
    const letters = extrudeProfile(context, id + "print", profile, vector(0,-1,0), 4);
    joinBodies(context, id + "join", [carrier, letters]);
    finish(context, carrier, label, ink);
}

annotation { "Feature Type Name" : "CNC-L01 enclosure" }
export const cncEnclosure = defineFeature(function(context is Context, id is Id, definition is map)
    precondition
    {
        annotation { "Name" : "Cabinet width" }
        isLength(definition.cabinetWidth, CABINET_WIDTH);
        annotation { "Name" : "Cabinet depth" }
        isLength(definition.cabinetDepth, CABINET_DEPTH);
        annotation { "Name" : "Front opening width" }
        isLength(definition.portWidth, DOOR_OPENING);
        annotation { "Name" : "Cabinet wall" }
        isLength(definition.wallStock, PANEL_WALL);
    }
    {
        const x = definition.cabinetWidth / millimeter / 2;
        const f = -1610;
        const rear = f + definition.cabinetDepth / millimeter;
        const wall = definition.wallStock / millimeter;
        const port = definition.portWidth / millimeter;
        const l = 165 - port/2;
        const r = 165 + port/2;
        const cabinet = block(context, id + "stock", vector(-x,f,450), vector(x,rear,3280));
        var bottomEdges = [];
        for (var p in [vector(-x,(f+rear)/2,450), vector(x,(f+rear)/2,450), vector(0,f,450), vector(0,rear,450)])
            bottomEdges = append(bottomEdges, qContainsPoint(qCreatedBy(id+"stock",EntityType.EDGE),p*millimeter));
        opChamfer(context, id + "skirt", { "entities" : qUnion(bottomEdges), "chamferType" : ChamferType.EQUAL_OFFSETS,
                   "width" : 220 * millimeter });
        const cavity = block(context, id + "cavity", vector(-x+wall,f+wall,645), vector(x-wall,rear-wall,3280-wall));
        const opening = block(context, id + "opening", vector(l,f-5,810), vector(r,f+wall+5,3100));
        const pocket = block(context, id + "pocket", vector(-x+10,f+14,795), vector(r+20,f+wall+24,3116));
        const sideStart = f + (rear-f)*0.25;
        const sideWidth = (rear-f)*0.32;
        const sideCut = block(context, id+"sideOpening", vector(x-wall-5,sideStart-8,1050),
                              vector(x+5,sideStart+sideWidth+8,2825));
        subtract(context, id + "cutCabinet", cabinet, [cavity, opening, pocket, sideCut]);
        finish(context, cabinet, "Cabinet", IVORY);

        const base = block(context, id+"base", vector(-x+245,f+245,85), vector(x-245,rear-245,455));
        var supports = [base];
        for (var i = 0; i < 4; i += 1)
        {
            const px = (i % 2 == 0 ? -1 : 1) * (x-370);
            const py = i < 2 ? f+400 : rear-400;
            supports = append(supports, roundPart(context,id+("foot"~i),vector(px,py,0),vector(px,py,96),90));
        }
        joinBodies(context,id+"baseFeet",supports);
        finish(context,base,"MachineBase",BLACK);

        const door = block(context,id+"door",vector(l-7,f+30,804),vector(r+7,f+52,3106));
        const paneX = l+140;
        const paneWidth = port-390;
        diagonalWindow(context,id+"frontGrille",door,
            plane(vector(paneX,f+28,1000)*millimeter,vector(0,-1,0),vector(1,0,0)),paneWidth,1660);
        finish(context,door,"DoorPanel",YELLOW);
        finish(context,block(context,id+"doorGlass",vector(paneX-6,f+53,995),vector(paneX+paneWidth+6,f+58,2665)),
               "DoorGlass",GLASS);
        const handle = block(context,id+"handle",vector(r-98,f-68,1550),vector(r-66,f-43,1925));
        const low = block(context,id+"lowerLug",vector(r-98,f-50,1550),vector(r-66,f+30,1585));
        const high = block(context,id+"upperLug",vector(r-98,f-50,1890),vector(r-66,f+30,1925));
        joinBodies(context,id+"handleLugs",[handle,low,high]);
        finish(context,handle,"DoorHandle",BLACK);

        const side = block(context,id+"side",vector(x,f+125,835),vector(x+15,f+0.76*(rear-f),3110));
        diagonalWindow(context,id+"sideGrille",side,
              plane(vector(x+17,sideStart,1058)*millimeter,vector(1,0,0),vector(0,1,0)),sideWidth,1758);
        finish(context,side,"SideGuard",YELLOW);
        finish(context,block(context,id+"sideGlass",vector(x-13,sideStart-3,1052),vector(x-8,sideStart+sideWidth+3,2822)),
               "SideGlass",GLASS);

        finish(context,block(context,id+"serviceCover",vector(x,rear-470,1040),vector(x+70,rear-75,2870)),
               "ServiceCover",IVORY);
        finish(context,block(context,id+"crown",vector(-x,f,3280),vector(x,f+220,3320)),"HeaderCap",IVORY);
        finish(context,block(context,id+"console",vector(r+5,f-15,815),vector(x-6,f,3112)),"Console",GRAPHITE);
        const cx = (r+x)/2;
        finish(context,block(context,id+"bezel",vector(cx-287,f-37,1290),vector(cx+287,f-15,2775)),"Bezel",BLACK);
        finish(context,block(context,id+"screen",vector(cx-240,f-42,2240),vector(cx+240,f-37,2670)),"Display",color(0.08,0.19,0.37));
        for (var j=0; j<4; j+=1)
        {
            const col = [color(0.17,0.36,0.62),color(0.15,0.47,0.54),color(0.33,0.27,0.56),color(0.14,0.26,0.46)][j];
            finish(context,block(context,id+("screenRow"~j),vector(cx-223,f-44,2280+j*82),
                vector(cx+223,f-42,2348+j*82)), "ScreenRow"~j,col);
        }
        const keys = block(context,id+"keyboard",vector(cx-250,f-36,1740),vector(cx+250,f-32,2135));
        var keyBodies = [keys];
        for (var row=0; row<6; row+=1)
            for (var col=0; col<10; col+=1)
            {
                const kx = cx-237+col*49;
                const kz = 1762+row*59;
                keyBodies = append(keyBodies,block(context,id+("key"~row~"x"~col),vector(kx,f-45,kz),vector(kx+33,f-34,kz+32)));
            }
        joinBodies(context,id+"keyArray",keyBodies);
        finish(context,keys,"Keypad",color(0.30,0.31,0.32));
        for (var k=0; k<4; k+=1)
        {
            const kx = cx-186+k*118;
            finish(context,roundPart(context,id+("control"~k),vector(kx,f-36,1592),vector(kx,f-66,1592),35),
                   "Selector"~k,k==3 ? color(0.18,0.46,0.28) : GRAPHITE);
        }
        finish(context,roundPart(context,id+"stopCollar",vector(cx+100,f-36,1400),vector(cx+100,f-52,1400),72),"StopCollar",YELLOW);
        finish(context,roundPart(context,id+"stop",vector(cx+100,f-52,1400),vector(cx+100,f-94,1400),51),"EmergencyStop",RED);
        finish(context,block(context,id+"brandBand",vector(-x+125,f-2,2882),vector(-x+685,f,2988)),"BadgeBand",YELLOW);
        printedLegend(context,id+"brand",-x+124,f,2775,83,"FANUC",RED);
        printedLegend(context,id+"family",-x+125,f,2708,48,"ROBODRILL",BLACK);
        printedLegend(context,id+"model",-x+126,f,2656,31,"D21MiB5 Plus",GRAPHITE);
        finish(context,roundPart(context,id+"lampBase",vector(350,f+0.67*(rear-f),3280),vector(350,f+0.67*(rear-f),3348),100),"BeaconBase",BLACK);
        finish(context,roundPart(context,id+"lens",vector(350,f+0.67*(rear-f),3348),vector(350,f+0.67*(rear-f),3440),92),"BeaconLens",RED);
    }, { "cabinetWidth" : 2920 * millimeter, "cabinetDepth" : 2660 * millimeter,
         "portWidth" : 1110 * millimeter, "wallStock" : 60 * millimeter });

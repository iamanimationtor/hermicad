/**
 * HERMICAD Studio — نویسندهٔ DXF (AC1015 / R2000)
 *
 * چرا بازنویسی شد: نسخهٔ پیشین فقط بخش ENTITIES و TABLE لایه‌ها را می‌نوشت و
 * نشانگرهای زیرکلاس (`AcDbEntity`، `AcDbPolyline`) و دسته (handle) نداشت. اتوکد
 * گاهی آن را باز می‌کرد، اما خواننده‌های سخت‌گیر (ezdxf، Revit، BricsCAD) با خطای
 * «missing subclass» ردش می‌کردند. فایل DXF باید «استاندارد» باشد، نه شبیه آن.
 *
 * این ماژول یک نویسندهٔ کامل است: HEADER، CLASSES، TABLES (LTYPE/LAYER/STYLE/
 * APPID/BLOCK_RECORD)، BLOCKS (مدل‌اسپیس و پیپراسپیس)، ENTITIES و OBJECTS.
 * مختصات بر حسب متر است ($INSUNITS = 6) و متن فارسی با دنبالهٔ `\U+XXXX`
 * نوشته می‌شود که اتوکد/ب‌ریک‌کد/ezdxf آن را به یونیکد برمی‌گردانند.
 */

import { shapeForDisplay } from "./pdf/arabic";

const DXF_UNICODE = String.fromCharCode(92) + "U+";

/** متن فارسی → دنبالهٔ یونیکد DXF با شکل نمایشی درست (RTL). */
export function dxfText(value: string): string {
  const shaped = shapeForDisplay(value, "rtl");
  return shaped.map((code) => DXF_UNICODE + code.toString(16).toUpperCase().padStart(4, "0")).join("");
}

const f = (value: number): string => (Math.round(value * 10000) / 10000).toString();

export interface DxfLayer {
  name: string;
  color: number;
  ltype?: string;
}

type Pair = [number, string | number];

/** نویسندهٔ ساده و قابل‌آزمون DXF R2000. */
export class DxfWriter {
  private readonly out: Pair[] = [];
  private handleCounter = 0x20;
  private readonly handles = { modelSpace: "", paperSpace: "", rootDict: "", groupDict: "", layers: new Map<string, string>() };

  constructor(private readonly layers: DxfLayer[]) {}

  private nextHandle(): string {
    this.handleCounter += 1;
    return this.handleCounter.toString(16).toUpperCase();
  }

  private push(code: number, value: string | number): void {
    this.out.push([code, value]);
  }

  private entityStart(type: string, handle: string, layer: string, subclass: string): void {
    this.push(0, type);
    this.push(5, handle);
    this.push(100, "AcDbEntity");
    this.push(8, layer);
    this.push(100, subclass);
  }

  /* ─────────────────────────── موجودیت‌ها ─────────────────────────── */

  line(x1: number, y1: number, x2: number, y2: number, layer: string): void {
    this.entityStart("LINE", this.nextHandle(), layer, "AcDbLine");
    this.push(10, f(x1));
    this.push(20, f(y1));
    this.push(30, 0);
    this.push(11, f(x2));
    this.push(21, f(y2));
    this.push(31, 0);
  }

  polyline(points: [number, number][], layer: string, closed = true): void {
    if (points.length < 2) return;
    this.entityStart("LWPOLYLINE", this.nextHandle(), layer, "AcDbPolyline");
    this.push(90, points.length);
    this.push(70, closed ? 1 : 0);
    this.push(43, 0);
    for (const [x, y] of points) {
      this.push(10, f(x));
      this.push(20, f(y));
    }
  }

  circle(cx: number, cy: number, r: number, layer: string): void {
    this.entityStart("CIRCLE", this.nextHandle(), layer, "AcDbCircle");
    this.push(10, f(cx));
    this.push(20, f(cy));
    this.push(30, 0);
    this.push(40, f(r));
  }

  text(x: number, y: number, height: number, value: string, layer: string, options: { rotation?: number } = {}): void {
    this.entityStart("TEXT", this.nextHandle(), layer, "AcDbText");
    this.push(10, f(x));
    this.push(20, f(y));
    this.push(30, 0);
    this.push(40, f(height));
    this.push(1, value);
    if (options.rotation) this.push(50, f(options.rotation));
    this.push(7, "Standard");
    this.push(100, "AcDbText"); // زیرکلاس دوم متن (برای پایان تعریف)
  }

  /** پرشدگی ساده (SOLID) — برای پوشش برش و بلوک‌های توپر. */
  solid(points: [number, number][], layer: string): void {
    const [a, b, c, d] = points;
    this.entityStart("SOLID", this.nextHandle(), layer, "AcDbTrace");
    this.push(10, f(a[0]));
    this.push(20, f(a[1]));
    this.push(30, 0);
    this.push(11, f(b[0]));
    this.push(21, f(b[1]));
    this.push(31, 0);
    this.push(12, f((d ?? c)[0]));
    this.push(22, f((d ?? c)[1]));
    this.push(32, 0);
    this.push(13, f(c[0]));
    this.push(23, f(c[1]));
    this.push(33, 0);
  }

  /* ──────────────────────── ساخت فایل کامل ──────────────────────── */

  build(): string {
    const header: Pair[] = [];
    const headerPush = (code: number, value: string | number) => header.push([code, value]);
    headerPush(0, "SECTION");
    headerPush(2, "HEADER");
    headerPush(9, "$ACADVER");
    headerPush(1, "AC1015");
    headerPush(9, "$INSUNITS");
    headerPush(70, 6); // metres
    headerPush(9, "$MEASUREMENT");
    headerPush(70, 1); // metric
    headerPush(9, "$LUPREC");
    headerPush(70, 4);
    headerPush(9, "$EXTMIN");
    headerPush(10, 0);
    headerPush(20, 0);
    headerPush(30, 0);
    headerPush(9, "$EXTMAX");
    headerPush(10, 100);
    headerPush(20, 100);
    headerPush(30, 0);
    headerPush(9, "$HANDSEED");
    headerPush(5, "FFFF");
    headerPush(0, "ENDSEC");

    const classes: Pair[] = [
      [0, "SECTION"],
      [2, "CLASSES"],
      [0, "ENDSEC"],
    ];

    const tables: Pair[] = [];
    const tpush = (code: number, value: string | number) => tables.push([code, value]);
    tpush(0, "SECTION");
    tpush(2, "TABLES");

    // LTYPE
    const ltypes = [
      { name: "BYBLOCK", description: "" },
      { name: "BYLAYER", description: "" },
      { name: "CONTINUOUS", description: "Solid line" },
    ];
    tpush(0, "TABLE");
    tpush(2, "LTYPE");
    tpush(5, this.nextHandle());
    tpush(100, "AcDbSymbolTable");
    tpush(70, ltypes.length);
    for (const ltype of ltypes) {
      tpush(0, "LTYPE");
      tpush(5, this.nextHandle());
      tpush(100, "AcDbSymbolTableRecord");
      tpush(100, "AcDbLinetypeTableRecord");
      tpush(2, ltype.name);
      tpush(70, 0);
      tpush(3, ltype.description);
      tpush(72, 65);
      tpush(73, 0);
      tpush(40, 0);
    }
    tpush(0, "ENDTAB");

    // LAYER
    const allLayers: DxfLayer[] = [{ name: "0", color: 7 }, ...this.layers.filter((layer) => layer.name !== "0")];
    tpush(0, "TABLE");
    tpush(2, "LAYER");
    tpush(5, this.nextHandle());
    tpush(100, "AcDbSymbolTable");
    tpush(70, allLayers.length);
    for (const layer of allLayers) {
      const handle = this.nextHandle();
      this.handles.layers.set(layer.name, handle);
      tpush(0, "LAYER");
      tpush(5, handle);
      tpush(100, "AcDbSymbolTableRecord");
      tpush(100, "AcDbLayerTableRecord");
      tpush(2, layer.name);
      tpush(70, 0);
      tpush(62, layer.color);
      tpush(6, layer.ltype ?? "CONTINUOUS");
    }
    tpush(0, "ENDTAB");

    // STYLE
    tpush(0, "TABLE");
    tpush(2, "STYLE");
    tpush(5, this.nextHandle());
    tpush(100, "AcDbSymbolTable");
    tpush(70, 1);
    tpush(0, "STYLE");
    tpush(5, this.nextHandle());
    tpush(100, "AcDbSymbolTableRecord");
    tpush(100, "AcDbTextStyleTableRecord");
    tpush(2, "Standard");
    tpush(70, 0);
    tpush(40, 0);
    tpush(41, 1);
    tpush(50, 0);
    tpush(71, 0);
    tpush(42, 2.5);
    tpush(3, "txt");
    tpush(4, "");
    tpush(0, "ENDTAB");

    // APPID
    tpush(0, "TABLE");
    tpush(2, "APPID");
    tpush(5, this.nextHandle());
    tpush(100, "AcDbSymbolTable");
    tpush(70, 1);
    tpush(0, "APPID");
    tpush(5, this.nextHandle());
    tpush(100, "AcDbSymbolTableRecord");
    tpush(100, "AcDbRegAppTableRecord");
    tpush(2, "ACAD");
    tpush(70, 0);
    tpush(0, "ENDTAB");

    // BLOCK_RECORD
    this.handles.modelSpace = this.nextHandle();
    this.handles.paperSpace = this.nextHandle();
    tpush(0, "TABLE");
    tpush(2, "BLOCK_RECORD");
    tpush(5, this.nextHandle());
    tpush(100, "AcDbSymbolTable");
    tpush(70, 2);
    for (const name of ["*Model_Space", "*Paper_Space"]) {
      tpush(0, "BLOCK_RECORD");
      tpush(5, name === "*Model_Space" ? this.handles.modelSpace : this.handles.paperSpace);
      tpush(100, "AcDbSymbolTableRecord");
      tpush(100, "AcDbBlockTableRecord");
      tpush(2, name);
      tpush(70, 0);
    }
    tpush(0, "ENDTAB");
    tpush(0, "ENDSEC");

    const blocks: Pair[] = [];
    const bpush = (code: number, value: string | number) => blocks.push([code, value]);
    bpush(0, "SECTION");
    bpush(2, "BLOCKS");
    for (const [name, owner] of [
      ["*Model_Space", this.handles.modelSpace],
      ["*Paper_Space", this.handles.paperSpace],
    ]) {
      bpush(0, "BLOCK");
      bpush(5, this.nextHandle());
      bpush(330, owner);
      bpush(100, "AcDbEntity");
      bpush(8, "0");
      bpush(100, "AcDbBlockBegin");
      bpush(2, name);
      bpush(70, 0);
      bpush(10, 0);
      bpush(20, 0);
      bpush(30, 0);
      bpush(3, name);
      bpush(1, "");
      bpush(0, "ENDBLK");
      bpush(5, this.nextHandle());
      bpush(330, owner);
      bpush(100, "AcDbEntity");
      bpush(8, "0");
      bpush(100, "AcDbBlockEnd");
    }
    bpush(0, "ENDSEC");

    const entities: Pair[] = [
      [0, "SECTION"],
      [2, "ENTITIES"],
      ...this.out,
      [0, "ENDSEC"],
    ];

    this.handles.rootDict = this.nextHandle();
    this.handles.groupDict = this.nextHandle();
    const objects: Pair[] = [
      [0, "SECTION"],
      [2, "OBJECTS"],
      [0, "DICTIONARY"],
      [5, this.handles.rootDict],
      [330, "0"],
      [100, "AcDbDictionary"],
      [281, 1],
      [3, "ACAD_GROUP"],
      [350, this.handles.groupDict],
      [0, "DICTIONARY"],
      [5, this.handles.groupDict],
      [330, this.handles.rootDict],
      [100, "AcDbDictionary"],
      [281, 1],
      [0, "ENDSEC"],
    ];

    const all = [...header, ...classes, ...tables, ...blocks, ...entities, ...objects, [0, "EOF"] as Pair];
    return all.map(([code, value]) => `${code}\n${value}`).join("\n") + "\n";
  }
}

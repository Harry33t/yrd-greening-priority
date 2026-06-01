#!/usr/bin/env python3
"""从 Overpass API 拉四城道路，合并写成一个 WGS84 shapefile（供 GEE 上传）。
纯 Python：urllib + pyshp，无需 GDAL。"""
import json, sys, time, urllib.request, urllib.parse
import shapefile  # pyshp

OUT_DIR = "/Users/harry/coding/URBAN ECOSYSTEMS/osm"
ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
# 道路类型：主干到居住道路（街道树主要沿这些分布）
HW = "motorway|trunk|primary|secondary|tertiary|residential|unclassified"
# 城市 bbox: (south, west, north, east) —— 与四城矩形框一致
CITIES = {
    "Shanghai": (30.70, 121.00, 31.60, 122.00),
    "Suzhou":   (31.00, 120.35, 31.65, 121.00),
    "Nanjing":  (31.78, 118.55, 32.35, 119.05),
    "Hangzhou": (30.10, 119.95, 30.45, 120.45),
}

def fetch(city, bbox, timeout=300):
    s, w, n, e = bbox
    q = (f'[out:json][timeout:{timeout}];'
         f'(way["highway"~"^({HW})$"]({s},{w},{n},{e}););out geom;')
    data = urllib.parse.urlencode({"data": q}).encode()
    last = None
    for ep in ENDPOINTS:
        try:
            print(f"[{city}] querying {ep} ...", flush=True)
            req = urllib.request.Request(ep, data=data,
                headers={"User-Agent": "yrd-greening-research/1.0 (academic)"})
            with urllib.request.urlopen(req, timeout=timeout + 30) as r:
                raw = r.read()
            print(f"[{city}] got {len(raw)/1e6:.1f} MB", flush=True)
            return json.loads(raw)
        except Exception as ex:
            last = ex
            print(f"[{city}] endpoint failed: {ex}", flush=True)
            time.sleep(3)
    raise SystemExit(f"[{city}] all endpoints failed: {last}")

def main(cities):
    w = shapefile.Writer(f"{OUT_DIR}/yrd_roads", shapeType=shapefile.POLYLINE)
    w.field("city", "C", size=20)
    w.field("highway", "C", size=20)
    w.field("osmid", "N", size=18)
    total = 0
    for city in cities:
        js = fetch(city, CITIES[city])
        cnt = 0
        for el in js.get("elements", []):
            if el.get("type") != "way" or "geometry" not in el:
                continue
            pts = [[p["lon"], p["lat"]] for p in el["geometry"]]
            if len(pts) < 2:
                continue
            w.line([pts])
            w.record(city, el.get("tags", {}).get("highway", ""), el.get("id", 0))
            cnt += 1
        total += cnt
        print(f"[{city}] {cnt} road segments", flush=True)
        time.sleep(2)  # 对 Overpass 友好
    w.close()
    # 写 .prj (WGS84)
    with open(f"{OUT_DIR}/yrd_roads.prj", "w") as f:
        f.write('GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],'
                'PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]')
    print(f"TOTAL {total} segments -> {OUT_DIR}/yrd_roads.shp", flush=True)

if __name__ == "__main__":
    cities = sys.argv[1:] or list(CITIES)
    main(cities)

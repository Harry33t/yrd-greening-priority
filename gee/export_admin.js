/**** Administrative-boundary version: export 500 m grid for four cities****
 * 城市边界 = GAUL 行政区(上海直辖市/南京/苏州(江苏)/杭州),核心 = built>0.3 & water<0.5。
 * 导出 4 个 grid_<City>.csv(覆盖旧矩形版),列与原来一致,供 spatial_regression.py / figures.py 直接用。
 ****/
var YEAR_START='2020-01-01', YEAR_END='2025-01-01', SCALE=500;
var P30=ee.Projection('EPSG:3857').atScale(30);
var L1=ee.FeatureCollection('FAO/GAUL/2015/level1').filter(ee.Filter.eq('ADM0_NAME','China'));
var L2=ee.FeatureCollection('FAO/GAUL/2015/level2').filter(ee.Filter.eq('ADM0_NAME','China'));
var JS=L2.filter(ee.Filter.stringContains('ADM1_NAME','Jiangsu'));
var ZJ=L2.filter(ee.Filter.stringContains('ADM1_NAME','Zhejiang'));
var CITIES=[
  {name:'Shanghai', geom:L1.filter(ee.Filter.stringContains('ADM1_NAME','Shanghai')).geometry()},
  {name:'Suzhou',   geom:JS.filter(ee.Filter.stringContains('ADM2_NAME','Suzhou')).geometry()},
  {name:'Nanjing',  geom:JS.filter(ee.Filter.stringContains('ADM2_NAME','Nanjing')).geometry()},
  {name:'Hangzhou', geom:ZJ.filter(ee.Filter.stringContains('ADM2_NAME','Hangzhou')).geometry()}
];
var popImg=ee.ImageCollection('WorldPop/GP/100m/pop')
  .filter(ee.Filter.eq('country','CHN')).filter(ee.Filter.eq('year',2020)).mosaic().rename('pop');
var ROADS=ee.FeatureCollection('projects/ee-butterfly/assets/yrd_roads');  // 用全部道路,不按城市筛
var DEM=ee.Image('USGS/SRTMGL1_003');
function maskLandsat(img){
  var qa=img.select('QA_PIXEL'); var m=qa.bitwiseAnd(parseInt('111110',2)).eq(0);
  return img.select('ST_B10').multiply(0.00341802).add(149.0).subtract(273.15).updateMask(m).rename('LST');
}
CITIES.forEach(function(c){
  var region=c.geom;
  var dw=ee.ImageCollection('GOOGLE/DYNAMICWORLD/V1').filterBounds(region)
    .filterDate(YEAR_START,YEAR_END).filter(ee.Filter.calendarRange(6,8,'month'));
  var tcp=dw.select('trees').mean().rename('tree');
  var built=dw.select('built').mean(), water=dw.select('water').mean();
  var crops=dw.select('crops').mean(), bare=dw.select('bare').mean();
  var lst=ee.ImageCollection('LANDSAT/LC08/C02/T1_L2').merge(ee.ImageCollection('LANDSAT/LC09/C02/T1_L2'))
    .filterBounds(region).filterDate(YEAR_START,YEAR_END).filter(ee.Filter.calendarRange(6,8,'month'))
    .map(maskLandsat).median();
  // 收紧城市核心:排除农田/裸地/水域主导格(近郊非城市)
  var core=built.gt(0.3).and(water.lt(0.5)).and(crops.lt(0.2)).and(bare.lt(0.2)).selfMask().clip(region);
  var lstC=lst.updateMask(core);
  var med=ee.Number(lstC.reduceRegion({reducer:ee.Reducer.median(),geometry:region,scale:SCALE,
    maxPixels:1e10,bestEffort:true,tileScale:16}).get('LST'));
  var lstAnom=lstC.subtract(med).rename('lst_anom');
  var elev=DEM.select('elevation').rename('elev'), slope=ee.Terrain.slope(DEM).rename('slope');
  var roadDens=ee.Image(0).byte().paint(ROADS,1).reproject(P30).focalMean(250,'circle','meters').rename('road_dens');
  var lonlat=ee.Image.pixelLonLat().rename(['lon','lat']);
  var stack=tcp.addBands(lstAnom).addBands(lst.rename('lst')).addBands(built.rename('built'))
    .addBands(water.rename('water')).addBands(elev).addBands(slope).addBands(roadDens)
    .addBands(popImg).addBands(lonlat).updateMask(core);
  var pts=stack.sample({region:region, scale:SCALE, projection:'EPSG:4326',
    dropNulls:true, tileScale:16, geometries:false}).map(function(f){return f.set('city',c.name);});
  Export.table.toDrive({collection:pts, description:'gridS_'+c.name, folder:'GEE_exports',
    fileNamePrefix:'gridS_'+c.name, fileFormat:'CSV'});
});
print('已创建 4 个导出任务 gridS_<City>(收紧核心版)。Tasks 里各点 RUN,完成后下载 4 个 gridS_<City>.csv 放进 csv_file(新名,不会和旧 grid_ 冲突)。');

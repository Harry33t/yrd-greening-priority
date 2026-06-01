/**** Tree-cover proxy cross-validation (batch export) ****
 * 四城各抽 ~2500 个 500m 核心网格点,导出 DW / WC / NDVI 三指标到一个 CSV。
 * 本地再算两两相关。减负:仅 WorldCover(分类)做覆盖比例聚合;DW/NDVI 连续量直接 500m 抽样;NDVI 只用 2022 夏季。
 ****/
var YEAR_START='2020-01-01', YEAR_END='2025-01-01', SCALE=500, NPTS=2500;
var P100=ee.Projection('EPSG:3857').atScale(100), P500=ee.Projection('EPSG:3857').atScale(SCALE);
var CITIES=[
  {name:'Shanghai', geom:ee.Geometry.Rectangle([121.0,30.70,122.00,31.60])},
  {name:'Suzhou',   geom:ee.Geometry.Rectangle([120.35,31.00,121.00,31.65])},
  {name:'Nanjing',  geom:ee.Geometry.Rectangle([118.55,31.78,119.05,32.35])},
  {name:'Hangzhou', geom:ee.Geometry.Rectangle([119.95,30.10,120.45,30.45])}
];
function s2mask(img){
  var scl=img.select('SCL');
  return img.updateMask(scl.neq(3).and(scl.neq(8)).and(scl.neq(9)).and(scl.neq(10)).and(scl.neq(11)));
}
var samples=ee.FeatureCollection([]);
CITIES.forEach(function(c){
  var region=c.geom;
  var dwc=ee.ImageCollection('GOOGLE/DYNAMICWORLD/V1').filterBounds(region)
    .filterDate(YEAR_START,YEAR_END).filter(ee.Filter.calendarRange(6,8,'month'));
  var built=dwc.select('built').mean(), water=dwc.select('water').mean();
  var crops=dwc.select('crops').mean(), bare=dwc.select('bare').mean();
  var core=built.gt(0.3).and(water.lt(0.5)).and(crops.lt(0.2)).and(bare.lt(0.2));
  var dwtree=dwc.select('trees').mean().rename('DW');           // 连续量,500m 抽样=均值
  var wcImg=ee.ImageCollection('ESA/WorldCover/v100').first().select('Map');
  var wctree=wcImg.eq(10).setDefaultProjection(wcImg.projection())  // 10m 二值
    .reduceResolution(ee.Reducer.mean(),true,256).reproject(P100)
    .reduceResolution(ee.Reducer.mean(),true,256).reproject(P500).rename('WC'); // 树覆盖比例
  var s2=ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED').filterBounds(region)
    .filterDate('2022-06-01','2022-09-01').map(s2mask);          // 仅 2022 夏季,减负
  var ndvi=s2.map(function(i){return i.normalizedDifference(['B8','B4']).rename('NDVI');}).median().rename('NDVI');
  var stack=dwtree.addBands(wctree).addBands(ndvi).updateMask(core.selfMask());
  var pts=stack.sample({region:region, scale:SCALE, numPixels:NPTS, seed:1, dropNulls:true, tileScale:16})
    .map(function(f){return f.set('city', c.name);});
  samples=samples.merge(pts);
});
Export.table.toDrive({collection:samples, description:'crossvalS', folder:'GEE_exports',
  fileNamePrefix:'crossvalS', fileFormat:'CSV'});
print('已创建导出任务 crossvalS(收紧核心版)。去 Tasks 点 RUN,完成后下载 crossvalS.csv 放进 csv_file。');

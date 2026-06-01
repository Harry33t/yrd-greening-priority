/**** Administrative-boundary version: per-city summary + road-buffer (H3)****
 * 打印:mean_tree, mean_LST, LST_median, PWHE, PriorityI 面积%/人口%,
 *       road-buffer 树冠(PI/非)、缺口%、cell树冠(PI/非)、road/cell 比值(PI/非)。
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
var ROADS=ee.FeatureCollection('projects/ee-butterfly/assets/yrd_roads');
function maskLandsat(img){
  var qa=img.select('QA_PIXEL'); var m=qa.bitwiseAnd(parseInt('111110',2)).eq(0);
  return img.select('ST_B10').multiply(0.00341802).add(149.0).subtract(273.15).updateMask(m).rename('LST');
}
function analyze(c){
  var region=c.geom;
  var rr=function(red,scale){return {reducer:red,geometry:region,scale:scale||SCALE,
    maxPixels:1e10,bestEffort:true,tileScale:16};};
  var dw=ee.ImageCollection('GOOGLE/DYNAMICWORLD/V1').filterBounds(region)
    .filterDate(YEAR_START,YEAR_END).filter(ee.Filter.calendarRange(6,8,'month'));
  var tcp=dw.select('trees').mean(), built=dw.select('built').mean(), water=dw.select('water').mean();
  var crops=dw.select('crops').mean(), bare=dw.select('bare').mean();
  var lst=ee.ImageCollection('LANDSAT/LC08/C02/T1_L2').merge(ee.ImageCollection('LANDSAT/LC09/C02/T1_L2'))
    .filterBounds(region).filterDate(YEAR_START,YEAR_END).filter(ee.Filter.calendarRange(6,8,'month'))
    .map(maskLandsat).median();
  var core=built.gt(0.3).and(water.lt(0.5)).and(crops.lt(0.2)).and(bare.lt(0.2)).selfMask().clip(region);
  var tcpC=tcp.updateMask(core), lstC=lst.updateMask(core), popC=popImg.updateMask(core);
  var med=ee.Number(lstC.reduceRegion(rr(ee.Reducer.median())).get('LST'));
  var heat=lstC.subtract(med).rename('heat');
  var phe=popC.multiply(heat.max(0)).rename('phe');
  var p=tcpC.rename('tree').addBands(heat).addBands(phe)
        .reduceRegion(rr(ee.Reducer.percentile([25,75])));
  var num=function(k){return ee.Number(p.get(k));};
  var highTCD=tcpC.lt(num('tree_p25')), highHeat=heat.gt(num('heat_p75')), highPHE=phe.gt(num('phe_p75'));
  var pI=highTCD.and(highHeat).and(highPHE);  // Priority I
  var zonesPI=pI.selfMask();
  var nonPI=core.updateMask(pI.not());

  // road buffer
  var roadBuf=ee.Image(0).byte().paint(ROADS,1).reproject(P30).focalMax(2,'circle','pixels').gt(0).selfMask();
  var roadTree=tcp.updateMask(roadBuf);
  var rtPI=ee.Number(roadTree.updateMask(zonesPI).reduceRegion(rr(ee.Reducer.mean(),30)).get('trees'));
  var rtNon=ee.Number(roadTree.updateMask(nonPI).reduceRegion(rr(ee.Reducer.mean(),30)).get('trees'));
  var ctPI=ee.Number(tcp.updateMask(zonesPI).reduceRegion(rr(ee.Reducer.mean())).get('trees'));
  var ctNon=ee.Number(tcp.updateMask(nonPI).reduceRegion(rr(ee.Reducer.mean())).get('trees'));

  // summary stats
  var mn=tcpC.rename('trees').addBands(lstC).reduceRegion(rr(ee.Reducer.mean()));
  var meanTree=ee.Number(mn.get('trees')), meanLST=ee.Number(mn.get('LST'));
  var sums=popC.rename('popSum')
    .addBands(popC.multiply(lstC).rename('popLst'))
    .addBands(popC.updateMask(zonesPI).rename('popPI'))
    .addBands(ee.Image(1).updateMask(core).rename('aCore'))
    .addBands(ee.Image(1).updateMask(zonesPI).rename('aPI'))
    .reduceRegion(rr(ee.Reducer.sum()));
  var popSum=ee.Number(sums.get('popSum'));
  return ee.Feature(null,{
    city:c.name, mean_tree:meanTree, mean_LST:meanLST, LST_median:med,
    PWHE:ee.Number(sums.get('popLst')).divide(popSum),
    pI_area_pct:ee.Number(sums.get('aPI')).divide(sums.get('aCore')).multiply(100),
    pI_pop_pct:ee.Number(sums.get('popPI')).divide(popSum).multiply(100),
    roadbuf_PI:rtPI, roadbuf_non:rtNon,
    roadbuf_deficit_pct:rtNon.subtract(rtPI).divide(rtNon).multiply(100),
    celltree_PI:ctPI, celltree_non:ctNon,
    roadcell_ratio_PI:rtPI.divide(ctPI), roadcell_ratio_non:rtNon.divide(ctNon)
  });
}
// 逐城打印,避免 "Too many concurrent aggregations"
CITIES.forEach(function(c){ print('=== '+c.name+' (收紧核心版) ===', analyze(c)); });

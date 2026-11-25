// Dependency-free 3D viewer integration checks. Geometry validation runs in
// tests/roll-cage-smoke.cjs using the actual calculator render function.
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const html=fs.readFileSync('roll-cage/index.html','utf8');
const ui=fs.readFileSync('roll-cage/ui-workspace.js','utf8');
const viewer=fs.readFileSync('roll-cage/preview-3d.js','utf8');
const css=fs.readFileSync('roll-cage/ui-workspace.css','utf8');
new vm.Script(viewer,{filename:'roll-cage/preview-3d.js'});
assert.match(html,/<script src="\.\/preview-3d\.js" defer><\/script>/,'Page must load WebGL preview after original workspace');
assert(html.indexOf('<script src="./ui-workspace.js" defer>')<html.indexOf('<script src="./preview-3d.js" defer>'),
  'Workspace must create Design mount before 3D preview initialises');
assert.match(html,/function cagePreviewScene\(g\)/,'Geometry adapter must read the original calculated model');
assert.match(html,/window\.dcbCage3DSnapshot=data/,'Initial scene must be cached for the deferred viewer');
assert.match(html,/new CustomEvent\('dcb:cage-3d-update'/,'Geometry changes must publish to WebGL viewer');
assert.match(html,/publishCagePreview\(g\);return;\}/,'Invalid dimensions must clear the old scene');
assert.match(html,/publishCagePreview\(g\);\s*\}/,'Valid changes must refresh the scene');
assert.match(html,/const curve=\(vertices,bends,radius\)=>/,'Actual circular fillets must be sampled');
assert.match(html,/a\.extras\?\.members/,'Reinforcement members must be included');
assert.match(ui,/threeD\.id='cage3DMount'/,'Design preview must have a separate 3D mount');
assert.match(ui,/twoD\.id='cage2DInterface'/,'2D engineering drawings must remain accessible');
assert.match(ui,/twoD\.hidden=false|twoD\.id='cage2DInterface'/);
assert.match(viewer,/getContext\('webgl'/,'Viewer must use hardware depth-buffered 3D, not static illustration');
assert.match(viewer,/gl\.enable\(gl\.DEPTH_TEST\)/);
assert.match(viewer,/gl\.drawArrays\(gl\.TRIANGLES/,'Tube meshes require 3D surfaces, not 2D lines only');
assert.match(viewer,/tube\.od\/2/,'Tube mesh diameter must follow calculated CHS OD');
assert.match(viewer,/window\.addEventListener\('dcb:cage-3d-update'/);
assert.match(viewer,/setMode\('3d'\)/);
assert.match(viewer,/to2D\.addEventListener\('click'/);
assert.match(viewer,/addEventListener\('pointermove'/,'Orbit and pan must work with mouse/touch');
assert.match(viewer,/addEventListener\('wheel'/,'Wheel zoom should work');
assert.match(viewer,/addEventListener\('change'.*?requestDraw/s,'Display-only member filters should repaint');
assert.match(viewer,/canvas\.toBlob/,'3D view should be saveable as PNG');
assert.match(css,/#cage3DCanvas\{width:100%/);
assert.match(css,/@media\(max-width:520px\)/);
assert(!/https?:\/\/.*(three|babylon|cdn)/i.test(viewer),'Preview must not require a runtime CDN');
console.log('Roll-cage 3D viewer integration checks passed');

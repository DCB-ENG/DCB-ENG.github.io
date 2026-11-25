// Desktop/mobile browser smoke for live roll-cage Design, storage and WebGL.
// Run with: node tests/roll-cage-browser-smoke.cjs (after installing Playwright).
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const URL='http://127.0.0.1:8765/roll-cage/';
(async()=>{
  const browser=await chromium.launch({
    headless:true,
    args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']
  });
  try{
    for(const config of [
      {name:'Desktop',viewport:{width:1440,height:900},isMobile:false,hasTouch:false},
      {name:'Mobile',viewport:{width:390,height:844},isMobile:true,hasTouch:true}
    ]){
      const context=await browser.newContext({
        viewport:config.viewport,
        isMobile:config.isMobile,
        hasTouch:config.hasTouch
      });
      const page=await context.newPage();
      const errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.goto(URL,{waitUntil:'load'});
      await page.waitForSelector('#cageInlineMemberEditor');
      assert.equal(await page.locator('#cage-tab-design').getAttribute('aria-selected'),'true');
      assert.equal(await page.locator('#cagePreflightPanel').count(),1);
      assert.match(await page.locator('#cagePreflightSummary').textContent(),/preflight passed/i);
      assert.equal(await page.locator('#sendCageToNesting').isDisabled(),false);

      // Edit an original source input beside the 3D preview.
      await page.getByRole('button',{name:'Edit Front legs dimensions'}).click();
      assert.equal(await page.locator('#cageInlineMemberEditor').isVisible(),true);
      assert.equal(await page.locator('#cage3DMount').count(),1);
      assert.equal(await page.locator('#cage-tab-design').getAttribute('aria-selected'),'true');
      assert.equal(await page.locator('#cageInlineMemberTitle').textContent(),'Front legs');
      await page.locator('#cageBackToHoop').click();

      // An invalid selected tube should block the entire production export chain.
      await page.getByRole('button',{name:'Edit Main hoop diagonal dimensions'}).click();
      await page.locator('#braceWall').fill('30');
      assert.match(await page.locator('#cagePreflightSummary').textContent(),/blocked/i);
      assert.equal(await page.locator('#sendCageToNesting').isDisabled(),true);
      assert.equal(await page.locator('#saveCageCutCSV').isDisabled(),true);
      await page.locator('#braceWall').fill('2.6');
      assert.match(await page.locator('#cagePreflightSummary').textContent(),/passed/i);
      assert.equal(await page.locator('#saveCageCutCSV').isDisabled(),false);

      // Local draft must recover exact dimensions after a real reload.
      await page.locator('#braceOD').fill('33.7');
      await page.waitForFunction(()=>document.getElementById('cageProjectStatus')?.textContent?.includes('Draft saved'));
      await page.reload({waitUntil:'load'});
      assert.equal(await page.locator('#braceOD').inputValue(),'33.7');

      // Save file control and mode switch must stay accessible.
      assert.equal(await page.locator('#cageSaveProject').count(),1);
      assert.equal(await page.locator('#cageLoadProjectFile').count(),1);
      assert.equal(await page.locator('#cageResetProject').count(),1);
      const isWebGL=await page.evaluate(()=>!!document.getElementById('cage3DCanvas')?.getContext('webgl'));
      if(isWebGL){
        await page.locator('#cageShow3D').click();
        assert.equal(await page.locator('#cage3DMount').isVisible(),true);
        assert((await page.locator('#cage3DGroups input').count())>=3,'3D member visibility legend should populate');
      }
      await page.locator('#cageShow2D').click();
      assert.equal(await page.locator('#cage2DInterface').isVisible(),true);
      assert.equal(errors.length,0,config.name+' JS exceptions: '+errors.join(' | '));

      // Measure actual input-to-render time without using a fragile GPU FPS cutoff.
      const metrics=await page.evaluate(async()=>{
        const target=document.getElementById('width');
        const value=Number(target.value)+1;
        const start=performance.now();
        target.value=String(value);
        target.dispatchEvent(new Event('input',{bubbles:true}));
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        return {elapsedMs:Math.round(performance.now()-start),tubes:window.dcbCage3DSnapshot?.tubes.length||0};
      });
      assert(metrics.tubes>0,'A valid 3D scene should remain after changing the width');
      console.log(config.name+': '+metrics.tubes+' tubes, redraw '+metrics.elapsedMs+' ms, WebGL '+isWebGL);
      await context.close();
    }
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
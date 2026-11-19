const e={BlasterNotReady:{message:`the blaster is still cooling down.`,tip:`Tip: check bot.blaster.ready() before you fire.`},OutOfEnergy:{message:`not enough energy for that.`,tip:`Tip: check bot.battery.level(), and bot.wait() a moment to recharge.`},PartNotFitted:{message:`your bot doesn't have that part fitted.`,tip:`Tip: fit it in the Workshop - only fitted parts exist on bot.`}},t=`Your bot was thinking too hard - loops need to do something!`;var n=class extends Error{errorName;constructor(t,n=e[t].message){super(n),this.errorName=t,this.name=t}},r=class extends Error{constructor(){super(`match over`),this.name=`MatchOver`}};function i(e){let t=e%360;return t<0?t+360:t}function a(e){let t=i(e);return t>180?t-360:t}function o(e,t){return i(Math.atan2(t.x-e.x,-(t.y-e.y))*180/Math.PI)}function s(e){let t=e*Math.PI/180;return{x:Math.sin(t),y:-Math.cos(t)}}function c(e,t){return Math.hypot(e.x-t.x,e.y-t.y)}const l={".":`floor`," ":`floor`,"#":`wall`,L:`lava`,W:`water`,P:`pit`,R:`rough`},u=[`front`,`rear`,`left`,`right`,`centre`],d={front:0,right:90,rear:180,left:-90},f={void:`#0B1016`,panel:`#111A23`,panelDark:`#0E151D`,panelActive:`#16222E`,border:`#22303F`,grid:`#152030`,ink:`#E6EDF3`,steel:`#93A4B5`,dim:`#4A5A6B`,cyan:`#3FD0E0`,cyanHover:`#8BE8F2`,amber:`#FFB547`,signal:`#5BE39A`,alert:`#FF6B7A`,core:`#C792EA`,hallFloor:`#0A0E13`,plateDark:`#0C1117`,plateA:`#1A232E`,plateB:`#121920`,hazardStripe:`#E0A23E`,wallLight:`#3A4655`,wallDark:`#232C37`,wallEdge:`#5B6B7C`,lavaHot:`#FFE29A`,lavaMid:`#FF8A3D`,lavaLow:`#C2340F`,lavaEdge:`#6E1607`,water:`#0F2A44`,waterEdge:`#2F7BBF`,rough:`#1A1E14`,roughDot:`#4A5233`,synKeyword:`#C792EA`,synFunction:`#82AAFF`,synNumber:`#F78C6C`,synString:`#C3E88D`,synComment:`#6B7C8D`,errorLine:`#3A1A20`},p=(e=1,t=0)=>({passable:!0,speedFactor:e,damagePerSecond:t,fatal:!1}),m={floor:p(),rough:p(.4),lava:p(.8,25),water:{passable:!1,speedFactor:0,damagePerSecond:0,fatal:!1},pit:{passable:!0,speedFactor:1,damagePerSecond:0,fatal:!0}},h={chassis_s:{id:`chassis_s`,name:`Chassis S`,size:`S`,radius:18,weight:6,maxWeight:30,hp:60,energy:40,recharge:2,slots:[`front`,`rear`,`centre`]},chassis_m:{id:`chassis_m`,name:`Chassis M`,size:`M`,radius:24,weight:10,maxWeight:50,hp:100,energy:50,recharge:2,slots:[`front`,`rear`,`left`,`right`,`centre`]},chassis_l:{id:`chassis_l`,name:`Chassis L`,size:`L`,radius:30,weight:16,maxWeight:80,hp:160,energy:60,recharge:2,slots:[`front`,`rear`,`left`,`right`,`centre`]},turret_base:{id:`turret_base`,name:`Turret base`,size:`turret`,radius:22,weight:40,maxWeight:100,hp:40,energy:100,recharge:10,slots:[`front`,`centre`],enemyOnly:!0}},g={wheels:{id:`wheels`,name:`Wheels`,category:`locomotion`,weight:8,power:0,blurb:`Medium speed, turns on the spot.`,slots:[],unique:!0,drive:{topSpeed:140,turnRate:180,refMass:30,accel:600,drift:0,pushes:!1,energyPerSecond:1,terrain:m}},tracks:{id:`tracks`,name:`Tracks`,category:`locomotion`,weight:14,power:0,blurb:`Slow and heavy. Pushes others aside and ignores rough ground.`,slots:[],unique:!0,drive:{topSpeed:90,turnRate:120,refMass:60,accel:300,drift:0,pushes:!0,energyPerSecond:1.5,terrain:{...m,rough:p(1)}}},hover:{id:`hover`,name:`Hover`,category:`locomotion`,weight:10,power:2,blurb:`Fast but drifts. Floats over water and pits.`,slots:[],unique:!0,drive:{topSpeed:220,turnRate:240,refMass:30,accel:250,drift:.85,pushes:!1,energyPerSecond:2,terrain:{floor:p(),rough:p(.8),lava:p(1,10),water:p(),pit:p()}}},pivot:{id:`pivot`,name:`Turret pivot`,category:`locomotion`,weight:0,power:0,blurb:`Rotates on the spot; cannot move.`,slots:[],unique:!0,enemyOnly:!0,drive:{topSpeed:0,turnRate:90,refMass:1e3,accel:0,drift:0,pushes:!1,energyPerSecond:0,terrain:m}},rangefinder:{id:`rangefinder`,name:`Rangefinder`,category:`sensor`,weight:2,power:1,blurb:`Measures the distance to the nearest solid thing it points at.`,slots:[`front`,`rear`,`left`,`right`],unique:!1,sensor:{range:600,energyPerRead:0}},radar:{id:`radar`,name:`Radar`,category:`sensor`,weight:3,power:2,blurb:`Sweeps all around and lists what it finds.`,slots:[`front`,`rear`,`left`,`right`],unique:!0,sensor:{range:500,energyPerRead:1}},gps:{id:`gps`,name:`Compass/GPS`,category:`sensor`,weight:1,power:1,blurb:`Knows where the bot is and which way it faces.`,slots:[`front`,`rear`,`left`,`right`],unique:!0,sensor:{range:0,energyPerRead:0}},bump:{id:`bump`,name:`Bump sensor`,category:`sensor`,weight:1,power:0,blurb:`Tells you when that side has touched something.`,slots:[`front`,`rear`,`left`,`right`],unique:!1,sensor:{range:0,energyPerRead:0}},blaster:{id:`blaster`,name:`Blaster`,category:`offense`,weight:6,power:4,blurb:`Fires an energy bolt. Needs a moment to cool down between shots.`,slots:[`front`,`rear`],unique:!0,blaster:{damage:20,cooldown:1,energyPerShot:5,projectileSpeed:600,range:700}},ram:{id:`ram`,name:`Ram spike`,category:`offense`,weight:5,power:0,blurb:`Hurts whatever you drive into. Faster hits hurt more.`,slots:[`front`,`rear`],unique:!1,ram:{damage:25}},mine_dropper:{id:`mine_dropper`,name:`Mine dropper`,category:`offense`,weight:5,power:2,blurb:`Leaves surprises behind you.`,slots:[`rear`],unique:!0,comingSoon:!0},armour:{id:`armour`,name:`Armour plate`,category:`defense`,weight:8,power:0,blurb:`Halves damage arriving on that side. Heavy.`,slots:[`front`,`rear`,`left`,`right`],unique:!1,armour:{reduction:.5}},shield:{id:`shield`,name:`Shield gen`,category:`defense`,weight:5,power:3,blurb:`Blocks most damage from every side while on. Drains energy fast.`,slots:[`left`,`right`],unique:!0,shield:{reduction:.8,energyPerSecond:8}},battery:{id:`battery`,name:`Battery`,category:`core`,weight:5,power:0,blurb:`More energy, faster recharge.`,slots:[`centre`],unique:!0,battery:{capacity:50,recharge:1}},battery_plus:{id:`battery_plus`,name:`Battery+`,category:`core`,weight:8,power:0,blurb:`A lot more energy and recharge.`,slots:[`centre`],unique:!0,battery:{capacity:120,recharge:2}}};f.cyan,f.signal,f.alert,f.amber,f.core,Object.values(g).filter(e=>!e.enemyOnly),Object.values(h).filter(e=>!e.enemyOnly);const _={radar:`radar`,gps:`gps`,blaster:`blaster`,shield:`shield`,battery:`battery`,battery_plus:`battery`,mine_dropper:`mines`};function ee(e,t){return t===`drive`?`drive`:e===`rangefinder`?`${t}_sensor`:e===`bump`?`${t}_bumper`:_[e]??null}function v(e){let t=[];e.drive&&t.push({attr:`drive`,part:e.drive,slot:`drive`});for(let n of u){let r=e.slots[n];if(!r)continue;let i=ee(r,n);i&&t.push({attr:i,part:r,slot:n})}return t}const y={name:`wait`,type:`bool`,default:`True`,doc:`True: return when the move is finished. False: start it and carry on straight away.`},b=[{name:`forward`,params:[{name:`distance`,type:`float`,doc:`How far to drive, in cm. Negative drives backwards.`},y],returns:`float | None`,summary:`Drive forward a distance in cm.`,doc:`Drives straight ahead. With wait=True returns how far the bot actually moved (less if something blocked it). With wait=False returns None immediately and the bot keeps going; any new drive command replaces the current one.`,ticks:`action`,example:`bot.drive.forward(100)`},{name:`backward`,params:[{name:`distance`,type:`float`,doc:`How far to reverse, in cm.`},y],returns:`float | None`,summary:`Reverse a distance in cm.`,doc:`Same as forward() but in reverse.`,ticks:`action`,example:`bot.drive.backward(50)`},{name:`turn`,params:[{name:`degrees`,type:`float`,doc:`Positive turns right (clockwise), negative turns left.`},y],returns:`None`,summary:`Turn on the spot by some degrees (+ is right).`,doc:`Turns on the spot. turn(90) is a right angle to the right; turn(-90) to the left. Pass a radar bearing to face a target: bot.drive.turn(t.bearing).`,ticks:`action`,example:`bot.drive.turn(90)`},{name:`stop`,params:[],returns:`None`,summary:`Stop moving.`,doc:`Cancels any move started with wait=False. Hover bots drift to a stop.`,ticks:1,example:`bot.drive.stop()`},{name:`is_moving`,params:[],returns:`bool`,summary:`True while a move or turn is in progress.`,doc:`Useful with wait=False moves: loop until it becomes False.`,ticks:1,example:`while bot.drive.is_moving():
    print(bot.front_sensor.distance())`}],te={part:`core`,summary:`Always available on every bot.`,methods:[{name:`log`,params:[{name:`values`,type:`object`,doc:`Anything to show in the console.`,variadic:!0}],returns:`None`,summary:`Write to the console (like print).`,doc:`Writes the values to the console, tagged as a bot log line. Takes no time.`,ticks:0,example:`bot.log("starting")`},{name:`wait`,params:[{name:`seconds`,type:`float`,doc:`How long to sit still.`}],returns:`None`,summary:`Do nothing for some seconds.`,doc:`Idles while the world carries on (and the battery recharges). Always at least one tick.`,ticks:`seconds`,example:`bot.wait(0.5)`},{name:`health`,params:[],returns:`int`,summary:`Current hull points.`,doc:`Hull points left. When it reaches 0 your bot is destroyed.`,ticks:1,example:`if bot.health() < 30:
    bot.shield.on()`},{name:`time`,params:[],returns:`float`,summary:`Seconds since the match started.`,doc:`Simulated seconds since the start of the run.`,ticks:1,example:`while bot.time() < 60:
    bot.wait(1)`}]},x={wheels:{part:`wheels`,summary:`Drive train.`,methods:b},tracks:{part:`tracks`,summary:`Drive train. Slow, strong, rough-ground proof.`,methods:b},hover:{part:`hover`,summary:`Drive train. Fast, drifts, floats over water and pits.`,methods:b},rangefinder:{part:`rangefinder`,summary:`Distance to the nearest solid thing in the direction of its slot.`,methods:[{name:`distance`,params:[],returns:`float`,summary:`cm to the nearest wall or bot it points at.`,doc:`Measures along the direction of the slot it is fitted to (front_sensor looks ahead, left_sensor looks left). Sees walls, bots and turrets, not floor hazards. Returns 600.0 if nothing is in range.`,ticks:1,example:`if bot.front_sensor.distance() < 50:
    bot.drive.turn(90)`}]},radar:{part:`radar`,summary:`Scans all around the bot.`,methods:[{name:`scan`,params:[],returns:`list[ScanResult]`,summary:`List what is within 500 cm, nearest first.`,doc:'Returns a list of objects, nearest first. Each has .kind ("turret", "bot", "core", "flag" or "waypoint"), .bearing (degrees, + is right), .distance (cm), and .x / .y. Wrecks are not listed. An empty list is falsy, so `while bot.radar.scan():` loops while anything is visible.',ticks:1,energy:1,example:`for t in bot.radar.scan():
    if t.kind == "turret":
        bot.drive.turn(t.bearing)`}]},gps:{part:`gps`,summary:`Position and compass heading.`,methods:[{name:`position`,params:[],returns:`tuple[float, float]`,summary:`(x, y) in cm from the top-left corner.`,doc:`Where the bot is. x grows to the right, y grows downwards (like a screen).`,ticks:1,example:`x, y = bot.gps.position()`},{name:`heading`,params:[],returns:`float`,summary:`Compass heading: 0 up, 90 right, 180 down, 270 left.`,doc:`The direction the bot faces, 0 to 360 degrees, clockwise from up.`,ticks:1,example:`print(bot.gps.heading())`},{name:`bearing_to`,params:[{name:`x`,type:`float`,doc:`Target x in cm.`},{name:`y`,type:`float`,doc:`Target y in cm.`}],returns:`float`,summary:`How far to turn to face a point (+ is right).`,doc:`Relative bearing from the bot to the point, -180 to 180. bot.drive.turn(bot.gps.bearing_to(x, y)) faces it.`,ticks:1,example:`bot.drive.turn(bot.gps.bearing_to(400, 200))`},{name:`distance_to`,params:[{name:`x`,type:`float`,doc:`Target x in cm.`},{name:`y`,type:`float`,doc:`Target y in cm.`}],returns:`float`,summary:`Straight-line cm to a point.`,doc:`Distance from the bot to the point, ignoring walls.`,ticks:1,example:`bot.drive.forward(bot.gps.distance_to(400, 200))`}]},bump:{part:`bump`,summary:`Contact switch on one side.`,methods:[{name:`hit`,params:[],returns:`bool`,summary:`True if this side touched something since you last asked.`,doc:`Latches when that side touches a wall or bot, and resets when you read it.`,ticks:1,example:`if bot.front_bumper.hit():
    bot.drive.backward(20)`}]},blaster:{part:`blaster`,summary:`Fires bolts in the direction of its slot.`,methods:[{name:`fire`,params:[],returns:`None`,summary:`Fire one bolt (5 energy, 1 s cooldown).`,doc:`Fires a bolt straight out of the slot it is fitted to. Raises BlasterNotReady while cooling down and OutOfEnergy if the battery is too low.`,ticks:1,energy:5,raises:[`BlasterNotReady`,`OutOfEnergy`],example:`if bot.blaster.ready():
    bot.blaster.fire()`},{name:`ready`,params:[],returns:`bool`,summary:`True when the blaster can fire.`,doc:`False while cooling down or when there is not enough energy for a shot.`,ticks:1,example:`while not bot.blaster.ready():
    bot.drive.turn(5)`}]},shield:{part:`shield`,summary:`Energy shield around the whole bot.`,methods:[{name:`on`,params:[],returns:`None`,summary:`Raise the shield (drains 8 energy/s).`,doc:`Blocks 80% of incoming damage while on. Drops by itself when energy runs out. Raises OutOfEnergy if the battery is empty.`,ticks:1,raises:[`OutOfEnergy`],example:`bot.shield.on()`},{name:`off`,params:[],returns:`None`,summary:`Lower the shield.`,doc:`Turns the shield off so the battery can recharge.`,ticks:1,example:`bot.shield.off()`},{name:`is_on`,params:[],returns:`bool`,summary:`True while the shield is up.`,doc:`The shield can switch itself off when energy runs out.`,ticks:1,example:`if not bot.shield.is_on():
    bot.shield.on()`}]},battery:{part:`battery`,summary:`Energy store.`,methods:[{name:`level`,params:[],returns:`float`,summary:`Energy left, 0 to 100 percent.`,doc:`How full the battery is, as a percentage of capacity.`,ticks:1,example:`if bot.battery.level() < 20:
    bot.wait(2)`}]}};x.battery_plus={...x.battery,part:`battery_plus`};function ne(e){return g[e].comingSoon?void 0:x[e]}function re(e){let t=[{attr:``,api:te}];for(let n of v(e)){let e=ne(n.part);e&&t.push({attr:n.attr,api:e})}return t}function ie(e){let t=e.params.map(e=>e.variadic?`*${e.name}`:e.default?`${e.name}=${e.default}`:e.name);return`${e.name}(${t.join(`, `)})`}function ae(e,t){return Math.min(1,Math.max(.5,t/e))}function S(e){let t=u.map(t=>e.slots[t]).filter(e=>!!e);return e.drive?[e.drive,...t]:t}function oe(e){let t=h[e.chassis],n=S(e).map(e=>g[e]),r=t.weight+n.reduce((e,t)=>e+t.weight,0),i=n.reduce((e,t)=>e+t.power,0),a=e.drive?g[e.drive].drive:void 0,o=n.find(e=>e.battery)?.battery;return{weight:r,maxWeight:t.maxWeight,power:i,topSpeed:a?a.topSpeed*ae(r,a.refMass):0,turnRate:a?a.turnRate:0,hp:t.hp,energyCapacity:t.energy+(o?.capacity??0),recharge:t.recharge+(o?.recharge??0),radius:t.radius}}function se(e,t,n){let r=Math.max(n.x,Math.min(e.x,n.x+n.w)),i=Math.max(n.y,Math.min(e.y,n.y+n.h)),a=e.x-r,o=e.y-i,s=a*a+o*o;if(s>=t*t)return null;if(s>1e-9){let e=Math.sqrt(s);return{x:a/e*(t-e),y:o/e*(t-e)}}let c=e.x-n.x+t,l=n.x+n.w-e.x+t,u=e.y-n.y+t,d=n.y+n.h-e.y+t,f=Math.min(c,l,u,d);return f===c?{x:-c,y:0}:f===l?{x:l,y:0}:f===u?{x:0,y:-u}:{x:0,y:d}}function C(e,t,n){let r=0,i=1/0;for(let[a,o,s,c]of[[e.x,t.x,n.x,n.x+n.w],[e.y,t.y,n.y,n.y+n.h]])if(Math.abs(o)<1e-12){if(a<s||a>c)return 1/0}else{let e=(s-a)/o,t=(c-a)/o;if(e>t&&([e,t]=[t,e]),r=Math.max(r,e),i=Math.min(i,t),r>i)return 1/0}return r}function w(e,t,n,r){let i=e.x-n.x,a=e.y-n.y,o=i*t.x+a*t.y,s=i*i+a*a-r*r;if(s<=0)return 0;let c=o*o-s;if(c<0)return 1/0;let l=-o-Math.sqrt(c);return l>=0?l:1/0}function T(e,t){return{x:e.x-t,y:e.y-t,w:e.w+2*t,h:e.h+2*t}}function E(e,t){let n=a(t-e);return n>=-45&&n<=45?`front`:n>45&&n<=135?`right`:n<-45&&n>=-135?`left`:`rear`}const D=e=>Math.round(e*10)/10,O=e=>Math.round(e*100)/100;function k(e){let t=e>>>0;return()=>{t=t+1831565813>>>0;let e=t;return e=Math.imul(e^e>>>15,e|1),e^=e+Math.imul(e^e>>>7,e|61),((e^e>>>14)>>>0)/4294967296}}function ce(e,t,n){let r=Array.from({length:t},(e,t)=>t);for(let n=t-1;n>0;n--){let t=Math.floor(e()*(n+1));[r[n],r[t]]=[r[t],r[n]]}return r.slice(0,Math.min(n,t))}var le=class{cols;rows;width;height;terrain;walls;solids;water;groundSolids;markers;navCache=/* @__PURE__ */ new Map;constructor(e,t){this.rows=e.map.length,this.cols=Math.max(0,...e.map.map(e=>e.length)),this.width=this.cols*40,this.height=this.rows*40,this.terrain=[];for(let t=0;t<this.rows;t++)for(let n=0;n<this.cols;n++){let r=e.map[t][n]??`.`;this.terrain.push(l[r]??`floor`)}let n=[];if(e.randomWalls){let{options:r,count:i}=e.randomWalls;for(let e of ce(t,r.length,i))n.push(...r[e])}this.walls=[...this.mergeTiles(`wall`),...e.walls??[],...n],this.water=this.mergeTiles(`water`);let{width:r,height:i}=this;this.solids=[...this.walls,{x:-200,y:-200,w:r+400,h:200},{x:-200,y:i,w:r+400,h:200},{x:-200,y:0,w:200,h:i},{x:r,y:0,w:200,h:i}],this.groundSolids=[...this.solids,...this.water],this.markers=A(e)}tileAt(e,t){let n=Math.floor(e/40),r=Math.floor(t/40);return n<0||r<0||n>=this.cols||r>=this.rows?`wall`:this.terrain[r*this.cols+n]}mergeTiles(e){let t=[],n=[];for(let r=0;r<this.rows;r++){let i=[],a=-1;for(let t=0;t<=this.cols;t++){let n=t<this.cols&&this.terrain[r*this.cols+t]===e;n&&a<0&&(a=t),!n&&a>=0&&(i.push({x:a*40,y:r*40,w:(t-a)*40,h:40}),a=-1)}for(let e of t.splice(0)){let r=i.findIndex(t=>t.x===e.x&&t.w===e.w);r>=0?(i.splice(r,1),e.h+=40,t.push(e)):n.push(e)}t.push(...i)}return[...n,...t].sort((e,t)=>e.y-t.y||e.x-t.x)}nav(e){let t=this.navCache.get(e);if(t)return t;t=this.terrain.map(t=>t===`wall`||!e&&(t===`water`||t===`pit`||t===`lava`));for(let e of this.walls){let n=T(e,-1);for(let e=Math.floor(n.y/40);e<=Math.floor((n.y+n.h)/40);e++)for(let r=Math.floor(n.x/40);r<=Math.floor((n.x+n.w)/40);r++)e>=0&&r>=0&&e<this.rows&&r<this.cols&&(t[e*this.cols+r]=!0)}return this.navCache.set(e,t),t}findPath(e,t,n){let r=this.nav(n),{cols:i,rows:a}=this,o=e=>{let t=Math.min(i-1,Math.max(0,Math.floor(e.x/40)));return Math.min(a-1,Math.max(0,Math.floor(e.y/40)))*i+t},s=o(e),c=o(t);if(s===c)return[];let l=new Int32Array(i*a).fill(-1);l[s]=s;let u=[s];for(let e=0;e<u.length;e++){let t=u[e];if(t===c)break;let n=Math.floor(t/i),o=t%i;for(let e=-1;e<=1;e++)for(let s=-1;s<=1;s++){if(!e&&!s)continue;let d=n+e,f=o+s;if(d<0||f<0||d>=a||f>=i)continue;let p=d*i+f;l[p]!==-1||r[p]&&p!==c||e&&s&&(r[n*i+f]||r[d*i+o])||(l[p]=t,u.push(p))}}if(l[c]===-1)return[];let d=[];for(let e=c;e!==s;e=l[e])d.push({x:(e%i+.5)*40,y:(Math.floor(e/i)+.5)*40});return d.reverse()}};function A(e){let t=[];for(let n of e.objectives)n.type===`reach`&&t.push({id:n.id,kind:`flag`,x:n.target.x,y:n.target.y}),n.type===`waypoints`&&n.points.forEach((e,r)=>t.push({id:`${n.id}.${r+1}`,kind:`waypoint`,x:e.x,y:e.y,index:r+1})),n.type===`collect`&&n.items.forEach((e,r)=>t.push({id:`${n.id}.${r+1}`,kind:`core`,x:e.x,y:e.y,index:r+1}));return t}const ue={static:0,turret:450,patrol:250,chase:5e3,kamikaze:400,coward:5e3};var de=class{bot;def;sight;fireRange;fleeBelow;fireDelayTicks;delay;route;blasterSlot;routeIndex=0;engaged=!1;nextShot=0;path=[];pathTarget=null;pathAge=0;escape=[];constructor(e,t){this.bot=e,this.def=t;let n=t.params??{},r=g.blaster.blaster.range;this.fireRange=Math.min(n.fireRange??400,r),this.sight=n.sightRange??Math.max(ue[t.behaviour],t.behaviour===`turret`?this.fireRange:0),this.fleeBelow=n.fleeBelow??.3,this.fireDelayTicks=Math.round(((n.fireDelay??0)+g.blaster.blaster.cooldown)*30),this.delay=n.delay??0,this.route=n.route??[];let i=e.slotOf(`blaster`);this.blasterSlot=i&&i!==`centre`?i:void 0}think(e){let{bot:t}=this;if(!t.alive||e.tick<this.delay)return;let n=e.player;if(!n.alive){t.command=null;return}let r=c(t,n),i=r<=this.sight&&e.lineOfSight(t,n);switch(this.def.behaviour){case`static`:return;case`turret`:i?this.aim(e,n):t.command=null;return;case`patrol`:i?this.engaged=!0:r>this.sight*1.5&&(this.engaged=!1),this.engaged?this.fight(e,i):this.patrol(e);return;case`chase`:i||r<=this.sight?this.fight(e,i):this.patrol(e);return;case`coward`:t.hp<t.maxHp*this.fleeBelow?this.flee(e):r<=this.sight?this.fight(e,i):this.patrol(e);return;case`kamikaze`:if(r<=t.radius+n.radius+8){e.explode(t);return}i&&(this.engaged=!0),this.engaged?this.driveTo(e,n,0):this.patrol(e);return}}fight(e,t){let{bot:n}=this,r=e.player,i=c(n,r),a=this.blasterSlot?Math.min(this.fireRange*.6,220):0;!t||i>a+20?this.driveTo(e,r,a):this.aim(e,r),t&&this.blasterSlot&&this.tryFire(e,r)}aim(e,t){let n=this.aimBearing(t);this.bot.command=Math.abs(n)>1?{kind:`turn`,remaining:n}:null,this.tryFire(e,t)}aimBearing(e){let t=this.blasterSlot?d[this.blasterSlot]:0;return a(o(this.bot,e)-this.bot.heading-t)}tryFire(e,t){!this.blasterSlot||e.tick<this.nextShot||c(this.bot,t)>this.fireRange||Math.abs(this.aimBearing(t))>5||e.fire(this.bot)&&(this.nextShot=e.tick+this.fireDelayTicks)}patrol(e){if(this.route.length===0){this.bot.command=null;return}let t=this.route[this.routeIndex%this.route.length];c(this.bot,t)<15&&(this.routeIndex=(this.routeIndex+1)%this.route.length),this.driveTo(e,this.route[this.routeIndex],0)}flee(e){let{bot:t}=this,n=o(e.player,t)*Math.PI/180,r=t.radius+10,i={x:Math.min(e.arena.width-r,Math.max(r,t.x+Math.sin(n)*200)),y:Math.min(e.arena.height-r,Math.max(r,t.y-Math.cos(n)*200))};this.driveTo(e,i,0)}driveTo(e,t,n){let{bot:r}=this;if(r.immovable)return;if(this.escape.length>0){r.command===null&&this.escape.shift()();return}let i=r.command;if(i?.kind===`goto`&&i.stalled>=20){let t=e.rng()<.5?-90:90;this.escape=[()=>r.command={kind:`turn`,remaining:t}],r.command={kind:`move`,dir:-1,distance:30,moved:0,along:fe(r.heading),stalled:0},this.path=[];return}let a=t,o=n;if(!e.clearPath(r,t,r.radius)){this.pathAge++;let n=!this.pathTarget||c(this.pathTarget,t)>40;for((this.path.length===0||n||this.pathAge>15)&&(this.path=e.arena.findPath(r,t,r.hover),this.pathTarget={x:t.x,y:t.y},this.pathAge=0);this.path.length>1&&c(r,this.path[0])<20;)this.path.shift();this.path.length>0&&(a=this.path[0],o=0)}i?.kind===`goto`?(i.target=a,i.stopWithin=o):r.command={kind:`goto`,target:a,stopWithin:o,stalled:0}}};function fe(e){let t=e*Math.PI/180;return{x:-Math.sin(t),y:Math.cos(t)}}var j=class{id;team;design;behaviour;speedFactor;stats;driveStats;maxHp;x;y;heading;hp;energy;shield=!1;alive=!0;speed=0;vx=0;vy=0;command=null;cooldown=0;bumped={front:!1,right:!1,rear:!1,left:!1};impactSpeed=0;ramCooldown=0;damageTaken=0;lowEnergy=!1;lastTerrain=`floor`;lastMove={x:0,y:0};constructor(e,t,n,r,i,a=1){this.id=e,this.team=t,this.design=n,this.behaviour=i,this.speedFactor=a,this.stats=oe(n),this.driveStats=n.drive?g[n.drive].drive:void 0,this.maxHp=this.stats.hp,this.hp=this.maxHp,this.energy=this.stats.energyCapacity,this.x=r.x,this.y=r.y,this.heading=r.heading}get radius(){return this.stats.radius}get hover(){return this.design.drive===`hover`}get immovable(){return!this.driveStats||this.driveStats.topSpeed===0}get topSpeed(){return this.stats.topSpeed*this.speedFactor}get currentSpeed(){return this.hover?Math.hypot(this.vx,this.vy):this.speed}get moving(){return this.command!==null||this.currentSpeed>2}slotOf(e){for(let[t,n]of Object.entries(this.design.slots))if(n===e)return t}partIn(e){return this.design.slots[e]}},pe=class{list;enemyIds;constructor(e){let t=e.enemies.map(e=>e.id);this.enemyIds=t,this.list=e.objectives.map(e=>{let n=1;return e.type===`waypoints`&&(n=e.points.length),e.type===`collect`&&(n=e.items.length),e.type===`destroy`&&(n=(e.enemies??t).length),e.type===`survive`&&(n=e.seconds),{def:e,progress:0,total:n,done:!1,hits:Array(n).fill(!1)}})}initialEvents(){return this.list.map(e=>this.event(e))}get allDone(){return this.list.every(e=>e.done)}pending(){let e=[];for(let t of this.list){let n=t.def;n.type===`reach`&&!t.done&&e.push({kind:`flag`,...n.target}),n.type===`waypoints`&&n.points.forEach((n,r)=>!t.hits[r]&&e.push({kind:`waypoint`,...n})),n.type===`collect`&&n.items.forEach((n,r)=>!t.hits[r]&&e.push({kind:`core`,...n}))}return e}update(e){let t=[];for(let n of this.list){if(n.done)continue;let r=n.progress,i=n.def;switch(i.type){case`reach`:c(e.player,i.target)<=i.radius&&(n.progress=1,t.push({type:`marker`,markerId:i.id,state:`reached`}));break;case`waypoints`:{let r=i.points[n.progress];r&&c(e.player,r)<=i.radius&&(n.hits[n.progress]=!0,n.progress++,t.push({type:`marker`,markerId:`${i.id}.${n.progress}`,state:`reached`}));break}case`collect`:i.items.forEach((r,a)=>{!n.hits[a]&&c(e.player,r)<=i.radius&&(n.hits[a]=!0,n.progress++,t.push({type:`marker`,markerId:`${i.id}.${a+1}`,state:`collected`}))});break;case`destroy`:n.progress=(i.enemies??this.enemyIds).filter(t=>e.destroyed.has(t)).length;break;case`survive`:n.progress=Math.min(i.seconds,Math.floor(e.tick/30))}n.done=n.progress>=n.total,(n.progress!==r||n.done)&&t.push(this.event(n))}return t}progress(){return this.list.map(e=>({id:e.def.id,label:e.def.label,progress:e.progress,total:e.total,done:e.done}))}event(e){return{type:`objective`,objectiveId:e.def.id,progress:e.progress,total:e.total,done:e.done}}};function M(e,t){switch(e.type){case`time`:return t.seconds<=e.seconds;case`damage`:return t.damageTaken<=e.max;case`lines`:return t.scriptLines<=e.max;case`energy`:return t.energyPercent>=e.min}}const N=.03333333333333333,P={damage:40,radius:100},F=.1;var I=class{world;arena;rng;player;bots;level;controllers;objectives;fitted;scriptLines;limitTicks;destroyed=/* @__PURE__ */ new Set;projectiles=[];nextProjectileId=1;events=[];printsThisTick=0;frames=[];_tick=0;endReason=null;constructor(e){let{level:t,design:n,seed:r}=e;this.level=t,this.scriptLines=e.scriptLines,this.arena=new le(t,k(r)),this.rng=k((r^2654435769)>>>0),this.player=new j(`player`,`player`,n,t.spawn),this.bots=[this.player],this.controllers=[];for(let e of t.enemies){let t=new j(e.id,`enemy`,e.design,e.spawn,e.behaviour,e.params?.speedFactor??1);this.bots.push(t),this.controllers.push(new de(t,e))}this.fitted=v(n),this.objectives=new pe(t);let i=Math.min(t.timeLimit??180,180);this.limitTicks=Math.round(i*30),this.world={walls:this.arena.walls.map(e=>({...e})),width:this.arena.width,height:this.arena.height,bots:this.bots.map(e=>({id:e.id,team:e.team,design:e.design,...e.behaviour?{behaviour:e.behaviour}:{},start:{x:e.x,y:e.y,heading:e.heading},maxHp:e.maxHp,maxEnergy:e.stats.energyCapacity})),markers:this.arena.markers,seed:r},this.events.push(...this.objectives.initialEvents()),this.pushFrame()}get tick(){return this._tick}get finished(){return this.endReason!==null}call(e,t,i){if(this.finished)throw new r;if(e===``)return this.callCore(t,i);let s=this.fitted.find(t=>t.attr===e);if(!s)throw new n(`PartNotFitted`);let l=this.player,u=s.slot===`drive`||s.slot===`centre`?null:s.slot;switch(`${s.part===`battery_plus`?`battery`:s.part}.${t}`){case`wheels.forward`:case`tracks.forward`:case`hover.forward`:return this.move(L(i[0]),i[1]!==!1);case`wheels.backward`:case`tracks.backward`:case`hover.backward`:return this.move(-L(i[0]),i[1]!==!1);case`wheels.turn`:case`tracks.turn`:case`hover.turn`:return this.drive({kind:`turn`,remaining:L(i[0])},i[1]!==!1,()=>null);case`wheels.stop`:case`tracks.stop`:case`hover.stop`:return l.command=null,this.after(1,null);case`wheels.is_moving`:case`tracks.is_moving`:case`hover.is_moving`:return this.after(1,l.command!==null);case`rangefinder.distance`:{let e=this.rangefind(l,u??`front`);return this.events.push({type:`range`,botId:l.id,slot:u??`front`,distance:e}),this.after(1,e)}case`radar.scan`:{l.energy=Math.max(0,l.energy-g.radar.sensor.energyPerRead);let e=g.radar.sensor.range;return this.events.push({type:`scan`,botId:l.id,range:e}),this.after(1,this.scan(l,e))}case`gps.position`:return this.after(1,[D(l.x),D(l.y)]);case`gps.heading`:return this.after(1,D(l.heading)%360);case`gps.bearing_to`:return this.after(1,D(a(o(l,R(i))-l.heading)));case`gps.distance_to`:return this.after(1,D(c(l,R(i))));case`bump.hit`:{let e=u??`front`,t=l.bumped[e];return l.bumped[e]=!1,this.after(1,t)}case`blaster.fire`:return l.cooldown>0?this.fail(`BlasterNotReady`):l.energy<g.blaster.blaster.energyPerShot?this.fail(`OutOfEnergy`):(this.fire(l),this.after(1,null));case`blaster.ready`:return this.after(1,this.blasterReady(l));case`shield.on`:return l.energy<1?this.fail(`OutOfEnergy`):(this.setShield(l,!0),this.after(1,null));case`shield.off`:return this.setShield(l,!1),this.after(1,null);case`shield.is_on`:return this.after(1,l.shield);case`battery.level`:return this.after(1,D(100*l.energy/l.stats.energyCapacity))}throw Error(`${e}.${t}() is not part of the bot API`)}print(e,t){this.printsThisTick>200||(this.printsThisTick++,this.events.push(this.printsThisTick>200?{type:`print`,text:`... (too much output this tick, some was skipped)`,stream:`stderr`}:{type:`print`,text:e,stream:t}))}finish(){let e=this.bots.some(e=>e.team===`enemy`&&e.alive)||this.level.objectives.some(e=>e.type===`survive`);for(!this.finished&&e&&this.print(`Your script has finished - your bot will sit still until the match ends.`,`stderr`);!this.finished;){if(!e&&!this.player.moving&&this.projectiles.length===0){this.end(`script_ended`);return}this.step()}}abort(e){this.finished||this.end(e)}end(e){this.endReason=e,this.events.length>0&&(this._tick++,this.pushFrame())}takeFrames(){let e=this.frames;return this.frames=[],e}result(){let e=this.endReason===`objectives_complete`,t=this.player,n=D(this._tick/30),r=100*t.energy/t.stats.energyCapacity,i={seconds:n,damageTaken:t.damageTaken,scriptLines:this.scriptLines,energyPercent:r},a=[e,e&&M(this.level.stars[0],i),e&&M(this.level.stars[1],i)];return{won:e,reason:this.endReason??`aborted`,stars:e?a.filter(Boolean).length:0,starFlags:a,ticks:this._tick,seconds:n,damageTaken:D(t.damageTaken),energyLeft:D(r),objectives:this.objectives.progress()}}callCore(e,t){switch(e){case`log`:return this.print(t.map(String).join(` `),`log`),null;case`wait`:return this.after(Math.max(1,Math.round(L(t[0])*30)),null);case`health`:return this.after(1,Math.ceil(this.player.hp));case`time`:return this.after(1,D(this._tick/30))}throw Error(`bot.${e}() is not part of the bot API`)}fail(e){throw this.after(1,null),new n(e)}after(e,t){for(let t=0;t<e;t++)if(this.step(),this.finished)throw new r;return t}move(e,t){let n=e<0?-1:1,r=s(this.player.heading),i={kind:`move`,dir:n,distance:Math.abs(e),moved:0,along:{x:r.x*n,y:r.y*n},stalled:0};return this.drive(i,t,()=>D(i.kind===`move`?i.moved:0))}drive(e,t,n){let r=this.player;if(r.command=e,!t)return this.after(1,null);do this.after(1,null);while(r.command===e);return n()}blasterReady(e){return e.cooldown<=0&&e.energy>=g.blaster.blaster.energyPerShot}fire(e){let t=e.slotOf(`blaster`),n=g.blaster.blaster;if(!t||t===`centre`||!this.blasterReady(e))return!1;e.energy-=n.energyPerShot,e.cooldown=Math.round(n.cooldown*30);let r=i(e.heading+d[t]),a=s(r),o=e.x+a.x*(e.radius+2),c=e.y+a.y*(e.radius+2);return this.projectiles.push({id:this.nextProjectileId++,x:o,y:c,heading:r,owner:e,travelled:0,damage:n.damage,speed:n.projectileSpeed,range:n.range}),this.events.push({type:`muzzle_flash`,botId:e.id,slot:t,x:D(o),y:D(c),heading:r}),!0}setShield(e,t){e.shield!==t&&(e.shield=t,this.events.push({type:`shield`,botId:e.id,on:t}))}rangefind(e,t){let n=g.rangefinder.sensor.range,r=s(e.heading+d[t]),i=1/0;for(let t of this.arena.solids)i=Math.min(i,C(e,r,t));for(let t of this.bots)t!==e&&t.alive&&(i=Math.min(i,w(e,r,t,t.radius)));return D(Math.min(n,Math.max(0,i-e.radius)))}scan(e,t){let n=[];for(let t of this.bots)t!==e&&t.alive&&n.push({kind:t.design.chassis===`turret_base`?`turret`:`bot`,x:t.x,y:t.y});return n.push(...this.objectives.pending()),n.map(t=>({t,d:c(e,t)})).filter(({d:e})=>e<=t).sort((e,t)=>e.d-t.d).map(({t,d:n})=>({kind:t.kind,bearing:D(a(o(e,t)-e.heading)),distance:D(n),x:D(t.x),y:D(t.y)}))}lineOfSight(e,t){return this.segmentClear(e,t,this.arena.walls)}clearPath(e,t,n){return this.segmentClear(e,t,[...this.arena.walls,...this.arena.water].map(e=>T(e,n-1)))}segmentClear(e,t,n){let r=c(e,t);if(r<1e-6)return!0;let i={x:(t.x-e.x)/r,y:(t.y-e.y)/r};return n.every(t=>C(e,i,t)>=r)}explode(e){if(e.alive){this.destroy(e,`damage`);for(let t of this.bots){if(!t.alive||t.team===e.team)continue;let n=c(t,e)-t.radius;n>P.radius||this.damage(t,P.damage*(1-.5*Math.max(0,n)/P.radius),e)}}}step(){this._tick++;for(let e of this.controllers)e.think(this);for(let e of this.bots)e.alive&&this.updateEnergy(e);let e=this.bots.map(e=>({x:e.x,y:e.y}));for(let e of this.bots)e.alive&&this.updateDrive(e);this.collideBots(),this.bots.forEach((t,n)=>t.lastMove={x:t.x-e[n].x,y:t.y-e[n].y});for(let e of this.bots)e.alive&&this.updateProgress(e);for(let e of this.bots)e.alive&&this.updateTerrain(e);this.updateProjectiles();for(let e of this.bots)e.cooldown>0&&e.cooldown--,e.ramCooldown>0&&e.ramCooldown--;this.player.alive&&this.events.push(...this.objectives.update({tick:this._tick,player:this.player,destroyed:this.destroyed})),this.player.alive?this.objectives.allDone?this.endReason=`objectives_complete`:this._tick>=this.limitTicks&&(this.endReason=`time_up`):this.endReason=`bot_destroyed`,this.pushFrame()}updateEnergy(e){let t=e.stats.energyCapacity;if(e.energy=Math.min(t,e.energy+e.stats.recharge*N),e.shield){let t=g.shield.shield.energyPerSecond*N;e.energy>=t?e.energy-=t:this.setShield(e,!1)}!e.lowEnergy&&e.energy<t*.2?(e.lowEnergy=!0,this.events.push({type:`low_energy`,botId:e.id})):e.lowEnergy&&e.energy>t*.3&&(e.lowEnergy=!1)}updateDrive(e){let t=e.driveStats,n=e.command;if(!t)return;let r=1;if(n){let n=t.energyPerSecond*N;e.energy>=n?e.energy-=n:r=.25}let l=this.arena.tileAt(e.x,e.y),u=(l===`wall`?1:t.terrain[l].speedFactor)*r,d=e.topSpeed*u,f=t.turnRate*N*r,p=0,m=s(e.heading),h=1/0;if(n?.kind===`turn`){let t=Math.sign(n.remaining)*Math.min(f,Math.abs(n.remaining));e.heading=i(e.heading+t),n.remaining-=t,Math.abs(n.remaining)<1e-6&&(e.command=null)}else if(n?.kind===`move`)m=n.along,h=n.distance-n.moved,p=d;else if(n?.kind===`goto`){let t=a(o(e,n.target)-e.heading);e.heading=i(e.heading+Math.sign(t)*Math.min(f,Math.abs(t))),h=c(e,n.target)-n.stopWithin,h<=.5?e.command=null:Math.abs(t)<30&&(p=d),m=s(e.heading)}let g,_;if(e.hover){if(e.command&&p>0){let n=Math.min(p,Math.sqrt(2*t.accel*Math.max(0,h))),r=m.x*n-e.vx,i=m.y*n-e.vy,a=Math.hypot(r,i),o=a>t.accel*N?t.accel*N/a:1;e.vx+=r*o,e.vy+=i*o}else e.vx*=t.drift,e.vy*=t.drift,Math.hypot(e.vx,e.vy)<.5&&(e.vx=e.vy=0);g=e.vx*N,_=e.vy*N}else{e.speed=p>0?Math.min(p,e.speed+t.accel*N):0;let n=Math.min(e.speed*N,Math.max(0,h));g=m.x*n,_=m.y*n}e.impactSpeed=e.currentSpeed,(g!==0||_!==0)&&this.moveBot(e,g,_)}moveBot(e,t,n){let r=Math.max(1,Math.ceil(Math.hypot(t,n)/(e.radius*.5)));for(let i=0;i<r;i++)e.x+=t/r,e.y+=n/r,this.resolveWalls(e)}resolveWalls(e){let t=e.hover?this.arena.solids:this.arena.groundSolids;for(let n of t){let t=se(e,e.radius,n);t&&(e.x+=t.x,e.y+=t.y,this.touched(e,t))}}touched(e,t){let n=E(e.heading,o({x:0,y:0},{x:-t.x,y:-t.y}));if(e.bumped[n]||(e.bumped[n]=!0,e.partIn(n)===`bump`&&this.events.push({type:`bump`,botId:e.id,side:n})),e.hover){let n=Math.hypot(t.x,t.y)||1,r=t.x/n,i=t.y/n,a=e.vx*r+e.vy*i;a<0&&(e.vx-=a*r,e.vy-=a*i)}}collideBots(){let e=this.bots.filter(e=>e.alive);for(let t=0;t<e.length;t++)for(let n=t+1;n<e.length;n++){let r=e[t],i=e[n],a=i.x-r.x,o=i.y-r.y,s=Math.hypot(a,o),c=r.radius+i.radius-s;if(c<=0)continue;s<1e-6&&(a=1,o=0,s=1);let l=a/s,u=o/s,d=.5;r.immovable&&i.immovable||r.immovable?d=0:i.immovable?d=1:r.driveStats?.pushes&&!i.driveStats?.pushes?d=0:i.driveStats?.pushes&&!r.driveStats?.pushes?d=1:r.moving!==i.moving&&(d=+!!r.moving);let f=r.immovable&&i.immovable?0:1-d;r.x-=l*c*d,r.y-=u*c*d,i.x+=l*c*f,i.y+=u*c*f,this.touched(r,{x:-l,y:-u}),this.touched(i,{x:l,y:u}),d>0&&this.resolveWalls(r),f>0&&this.resolveWalls(i),this.ram(r,i),this.ram(i,r)}}ram(e,t){if(e.ramCooldown>0||!e.alive||!t.alive)return;let n=E(e.heading,o(e,t));if(e.partIn(n)!==`ram`)return;let r=e.topSpeed>0?Math.min(1,e.impactSpeed/e.topSpeed):0;r<.2||(e.ramCooldown=15,this.damage(t,g.ram.ram.damage*r,e))}updateProgress(e){let t=e.command;if(t?.kind===`move`){let n=e.lastMove.x*t.along.x+e.lastMove.y*t.along.y;t.moved=Math.min(t.distance,t.moved+Math.max(0,n)),t.stalled=n<F?t.stalled+1:0,(t.distance-t.moved<(e.hover?.5:.01)||t.stalled>=10)&&(e.command=null),e.command===null&&!e.hover&&(e.speed=0)}else t?.kind===`goto`&&(t.stalled=(e.speed>0||Math.hypot(e.vx,e.vy)>0)&&Math.hypot(e.lastMove.x,e.lastMove.y)<F?t.stalled+1:0);e.hover||(e.speed=Math.min(e.speed,Math.hypot(e.lastMove.x,e.lastMove.y)/N))}updateTerrain(e){let t=this.arena.tileAt(e.x,e.y);if(t!==e.lastTerrain&&t!==`floor`&&t!==`wall`&&this.events.push({type:`hazard`,botId:e.id,terrain:t,at:{x:D(e.x),y:D(e.y)}}),e.lastTerrain=t,!e.driveStats||t===`wall`||t===`floor`)return;let n=e.driveStats.terrain[t];if(n.fatal)this.destroy(e,`pit`);else if(n.damagePerSecond>0){let t=n.damagePerSecond*N;e.hp-=t,e.damageTaken+=t,e.hp<=0&&this.destroy(e,`lava`)}}updateProjectiles(){let e=[];for(let t of this.projectiles){let n=s(t.heading),r=Math.min(t.speed*N,t.range-t.travelled),i=null,a=!1;for(let e of this.arena.solids){let i=C(t,n,e);i<=r&&(r=i,a=!0)}for(let e of this.bots){if(!e.alive||e===t.owner||e.team===t.owner.team)continue;let a=w(t,n,e,e.radius);a<=r&&(r=a,i=e)}t.x+=n.x*r,t.y+=n.y*r,t.travelled+=r,i?this.damage(i,t.damage,{x:t.x-n.x*10,y:t.y-n.y*10},{x:t.x,y:t.y}):a?this.events.push({type:`hit`,targetId:`wall`,x:D(t.x),y:D(t.y),damage:0}):t.travelled<t.range-1e-6&&e.push(t)}this.projectiles=e}damage(e,t,n,r=e){let i=E(e.heading,o(e,n)),a=t*(1-(e.partIn(i)===`armour`?g.armour.armour.reduction:0));e.shield&&(a*=1-g.shield.shield.reduction),e.hp-=a,e.damageTaken+=a,this.events.push({type:`hit`,targetId:e.id,x:D(r.x),y:D(r.y),damage:D(a),side:i,shielded:e.shield}),e.hp<=0&&this.destroy(e,`damage`)}destroy(e,t){e.alive&&(e.alive=!1,e.hp=0,e.command=null,e.speed=e.vx=e.vy=0,e.shield&&this.setShield(e,!1),e.team===`enemy`&&this.destroyed.add(e.id),this.events.push({type:`destroyed`,botId:e.id,x:D(e.x),y:D(e.y),cause:t}),t!==`pit`&&this.events.push({type:`explosion`,x:D(e.x),y:D(e.y),size:`large`}))}pushFrame(){let e=this.bots.map(e=>({id:e.id,x:O(e.x),y:O(e.y),heading:O(e.heading)%360,hp:D(Math.max(0,e.hp)),energy:D(e.energy),shield:e.shield,alive:e.alive,moving:e.alive&&e.moving})),t=this.projectiles.map(e=>({id:e.id,x:O(e.x),y:O(e.y),heading:e.heading,owner:e.owner.id}));this.frames.push({tick:this._tick,bots:e,projectiles:t,events:this.events}),this.events=[],this.printsThisTick=0}};function L(e){let t=typeof e==`number`?e:typeof e==`boolean`?Number(e):NaN;return Number.isNaN(t)?0:t}function R(e){return{x:L(e[0]),y:L(e[1])}}const z=e=>new I(e),B=[`fetch`,`XMLHttpRequest`,`WebSocket`,`WebSocketStream`,`WebTransport`,`EventSource`,`indexedDB`,`caches`,`importScripts`,`BroadcastChannel`,`Worker`,`SharedWorker`,`postMessage`,`eval`];function V(e,t,n,r=!0){try{Object.defineProperty(e,t,{value:n,configurable:!r,writable:!r})}catch{}}function H(e=globalThis){for(let t=e;t&&t!==Object.prototype;t=Object.getPrototypeOf(t))for(let e of B)Object.hasOwn(t,e)&&V(t,e,void 0);let t=e;for(let n of[`setTimeout`,`setInterval`]){let r=t[n];typeof r==`function`&&V(e,n,(t,...n)=>typeof t==`function`?r.call(e,t,...n):0,!1)}let n=[function(){},async function(){},function*(){},async function*(){}];for(let t of n.map(e=>Object.getPrototypeOf(e))){let n=t.constructor.name,r={[n]:function(){throw EvalError(`Compiling code is disabled in the Bot Arena worker`)}}[n];V(r,`prototype`,t),V(t,`constructor`,r),n===`Function`&&V(e,`Function`,r)}}function me(e){return e.split(`
`).filter(e=>{let t=e.trim();return t!==``&&!t.startsWith(`#`)}).length}var he=`"""Bot Arena's Python side of the bridge.

Run once per interpreter, in a private namespace (never the player's). It locks down imports and
defines \`run_player\`, which runtime.ts calls for every run. Talks to JavaScript only through the
\`bridge(op, json)\` function passed in per run, using JSON strings both ways.
"""

import builtins
import difflib
import io
import json
import random
import sys
import time
import traceback

# ---- sandbox ----------------------------------------------------------------------------------
# Modules that reach JavaScript, the network or the host (a name blocks its submodules too).
# Removed from the module cache and refused by an import hook, so \`import js\` fails even via
# another module's __builtins__. Python code can't be sealed off completely in Pyodide, so the
# worker (lockdown.ts) also removes every way out on the JavaScript side.
BLOCKED_MODULES = frozenset({
    'js', 'pyodide', 'pyodide_js', '_pyodide', '_pyodide_core', 'micropip',
    'socket', 'ssl', 'urllib.request', 'http', 'subprocess', 'webbrowser', 'ctypes',
})


def _is_blocked(name):
    parts = name.split('.')
    return any('.'.join(parts[:i]) in BLOCKED_MODULES for i in range(1, len(parts) + 1))


for _name in list(sys.modules):
    if _is_blocked(_name):
        del sys.modules[_name]

# Pyodide's own finder serves \`js\` from a registry, which would bypass a removed meta_path hook.
for _finder in sys.meta_path:
    for _name in ('js', 'pyodide_js'):
        getattr(_finder, 'jsproxies', {}).pop(_name, None)


def _blocked_error(name):
    return ModuleNotFoundError(f"No module named '{name}' (it is not available in Bot Arena)", name=name)


class _BlockedFinder:
    def find_spec(self, name, path=None, target=None):
        if _is_blocked(name):
            raise _blocked_error(name)
        return None


sys.meta_path.insert(0, _BlockedFinder())

_real_import = builtins.__import__


def _guarded_import(name, globals=None, locals=None, fromlist=(), level=0):
    if _is_blocked(name):
        raise _blocked_error(name)
    return _real_import(name, globals, locals, fromlist, level)


def _no_input(prompt=''):
    raise RuntimeError("input() can't be used in Bot Arena - your bot can't stop to ask questions mid-match")


# ---- game exceptions ----------------------------------------------------------------------------
class BotError(Exception):
    """Base class for Bot Arena's own errors. \`except BotError:\` catches all of them."""


class BlasterNotReady(BotError):
    """The blaster is still cooling down. Check bot.blaster.ready() first."""


class OutOfEnergy(BotError):
    """Not enough energy in the battery for that."""


class PartNotFitted(BotError, AttributeError):
    """The bot doesn't have that part. Fit it in the Workshop. (An AttributeError too, so hasattr works.)"""


# Private references, so a script that replaces json.dumps can't break the bridge.
_dumps, _loads = json.dumps, json.loads

BOT_ERRORS = {'BlasterNotReady': BlasterNotReady, 'OutOfEnergy': OutOfEnergy, 'PartNotFitted': PartNotFitted}


class _MatchOver(BaseException):
    """The match ended (won, destroyed, time up). Not an Exception, so \`except Exception\` won't stop it."""


class _Watchdog(BaseException):
    """Raised by the headless watchdog when the script runs too long without calling the bot."""


class _InternalError(BaseException):
    """Something broke on the JavaScript side (not the player's fault)."""


# ---- values returned by the API --------------------------------------------------------------------
class ScanResult:
    """Something the radar saw: .kind, .bearing (degrees, + is right), .distance (cm), .x, .y"""

    __slots__ = ('kind', 'bearing', 'distance', 'x', 'y')

    def __init__(self, kind, bearing, distance, x, y):
        self.kind = kind
        self.bearing = bearing
        self.distance = distance
        self.x = x
        self.y = y

    def __repr__(self):
        return (f'ScanResult(kind={self.kind!r}, bearing={self.bearing}, distance={self.distance}, '
                f'x={self.x}, y={self.y})')


def _float(v):
    return float(v) if isinstance(v, int) and not isinstance(v, bool) else v


def _convert(value, returns):
    """Shape a JSON value as the spec's return type. JSON drops the '.0' of whole floats."""
    if value is None:
        return None
    if returns.startswith('tuple') and isinstance(value, list):
        return tuple(_float(v) for v in value)
    if returns == 'list[ScanResult]':
        return [ScanResult(d.get('kind'), _float(d.get('bearing')), _float(d.get('distance')),
                           _float(d.get('x')), _float(d.get('y')))
                for d in value]
    if returns.startswith('float'):
        return _float(value)
    return value


def _num(value, name, where):
    """Check a numeric argument, so mistakes get a clear message instead of a JavaScript error."""
    if isinstance(value, (int, float)):
        if value != value or value in (float('inf'), float('-inf')):
            raise ValueError(f'{where}() needs a normal number for {name}, not {value!r}')
        return value
    raise TypeError(f'{where}() needs a number for {name}, not {type(value).__name__} ({value!r})')


# ---- descriptions for missing parts ---------------------------------------------------------------
_UNIQUE_PARTS = {
    'drive': 'drive train', 'radar': 'radar', 'gps': 'Compass/GPS', 'blaster': 'blaster',
    'shield': 'shield generator', 'battery': 'battery', 'mines': 'mine dropper',
}
_SLOTS = ('front', 'rear', 'left', 'right', 'centre')


def _missing_part(name):
    """Describe a part the bot could have but doesn't, or None if \`name\` isn't a part name."""
    if name in _UNIQUE_PARTS:
        return _UNIQUE_PARTS[name]
    slot, _, kind = name.partition('_')
    if slot in _SLOTS and kind == 'sensor':
        return f'rangefinder in the {slot} slot'
    if slot in _SLOTS and kind == 'bumper':
        return f'bump sensor in the {slot} slot'
    return None


def _ours(exc):
    """Mark an exception whose message is already written for players (no Python suggestions)."""
    exc.bot_arena_message = True
    return exc


def _did_you_mean(name, options):
    close = difflib.get_close_matches(name, list(options), n=1)
    return f" Did you mean '{close[0]}'?" if close else ''


class _Part:
    """Base class for generated part classes (attributes of \`bot\`)."""

    _attr = ''
    _part = ''

    def __getattr__(self, name):
        methods = [n for n in dir(type(self)) if not n.startswith('_')]
        raise _ours(AttributeError(f"bot.{self._attr} has no '{name}'.{_did_you_mean(name, methods)}"))

    def __repr__(self):
        return f'<bot.{self._attr}: {self._part}>'


class _BotBase:
    """Base class for the generated Bot class."""

    _fitted = {}  # attr -> part id

    def __getattr__(self, name):
        if name.startswith('__'):
            raise AttributeError(name)
        missing = _missing_part(name)
        if missing:
            same_kind = [a for a in self._fitted if a.endswith(name.partition('_')[2]) and '_' in name]
            also = f" (you have: {', '.join('bot.' + a for a in same_kind)})" if same_kind else ''
            raise _ours(PartNotFitted(f'your bot has no {missing} fitted{also} - add one in the Workshop.'))
        options = list(self._fitted) + [n for n in dir(type(self)) if not n.startswith('_')]
        raise _ours(AttributeError(f"bot has no '{name}'.{_did_you_mean(name, options)}"))

    def __repr__(self):
        return f"<bot with {', '.join(self._fitted) or 'no parts'}>"


# ---- a run ---------------------------------------------------------------------------------------
class _Session:
    """One run: forwards calls to the sim via the bridge and tracks when time last passed."""

    def __init__(self, bridge):
        self.bridge = bridge
        self.over = False
        self.last_call = time.monotonic()

    def _send(self, op, payload):
        reply = _loads(self.bridge(op, _dumps(payload)))
        if 'internal' in reply:
            raise _InternalError(reply['internal'])
        return reply

    def call(self, attr, method, args, returns):
        if self.over:
            raise _MatchOver()
        reply = self._send('call', [attr, method, args])
        if 'over' in reply:
            self.over = True
            _stop_player_code()
            raise _MatchOver()
        self.last_call = time.monotonic()
        if 'error' in reply:
            raise BOT_ERRORS[reply['error']](reply['message'])
        return _convert(reply.get('value'), returns)

    def write(self, text, stream):
        self._send('print', [text, stream])

    def log(self, values):
        self.write(' '.join(str(v) for v in values), 'log')



class _Console(io.TextIOBase):
    """sys.stdout / sys.stderr during a run: sends each complete line to the game console."""

    def __init__(self, session, stream):
        self._session = session
        self._stream = stream
        self._pending = ''

    def writable(self):
        return True

    def write(self, text):
        *lines, self._pending = (self._pending + str(text)).split('\\n')
        for line in lines:
            self._session.write(line, self._stream)
        return len(text)

    def close_line(self):
        if self._pending:
            self._session.write(self._pending, self._stream)
            self._pending = ''


def _stop_player_code():
    """The match is over: make every further line of main.py raise _MatchOver, so a bare
    \`except:\` that swallowed the first one can't keep the script spinning."""
    def local(frame, event, arg):
        if event == 'line':
            raise _MatchOver()
        return local

    sys.settrace(lambda frame, event, arg: local if frame.f_code.co_filename == 'main.py' else None)
    frame = sys._getframe()
    while frame is not None:
        if frame.f_code.co_filename == 'main.py':
            frame.f_trace = local
            frame.f_trace_lines = True
        frame = frame.f_back


def _snapshot_modules():
    return {name: (mod, dict(mod.__dict__)) for name, mod in list(sys.modules.items())}, list(sys.meta_path)


def _restore_modules(saved):
    """Undo what a script did to shared modules (json.dumps = ..., new imports), so every run
    starts from the same interpreter state."""
    modules, meta_path = saved
    for name in list(sys.modules):
        if name not in modules:
            del sys.modules[name]
    for name, (mod, contents) in modules.items():
        sys.modules[name] = mod
        current = mod.__dict__
        for key in current.keys() - contents.keys():
            del current[key]
        for key, value in contents.items():
            if current.get(key) is not value:
                current[key] = value
    sys.meta_path[:] = meta_path


def _install_watchdog(session, seconds):
    """Headless only: raise _Watchdog if the player's code runs \`seconds\` without a bot call."""
    count = 0

    def local(frame, event, arg):
        nonlocal count
        count += 1
        if count % 2000 == 0 and not session.over and time.monotonic() - session.last_call > seconds:
            raise _Watchdog()
        return local

    def tracer(frame, event, arg):
        return local if frame.f_code.co_filename == 'main.py' else None

    sys.settrace(tracer)


def _error_line(exc):
    if isinstance(exc, SyntaxError) and exc.filename == 'main.py':
        return exc.lineno
    line = None
    for entry in traceback.extract_tb(exc.__traceback__):
        if entry.filename == 'main.py':
            line = entry.lineno
    return line


def _error_message(exc, renames):
    if isinstance(exc, SyntaxError):
        message = exc.msg
    elif isinstance(exc, BotError) or getattr(exc, 'bot_arena_message', False):
        message = str(exc)
    else:
        # format_exception_only adds Python's own "Did you mean ...?" suggestions.
        last = traceback.format_exception_only(exc)[-1].strip()
        prefix = type(exc).__name__ + ': '
        message = last[len(prefix):] if last.startswith(prefix) else str(exc)
    for old, new in renames:
        message = message.replace(old, new)
    return message


def run_player(bridge, bot_source, script, seed, watchdog_seconds):
    """Build \`bot\`, run the player's script as main.py, and report how it ended (JSON)."""
    session = _Session(bridge)
    gen = {
        '__name__': 'bot', '_Part': _Part, '_BotBase': _BotBase, '_num': _num,
        '_call': session.call, '_log': session.log,
    }
    exec(compile(bot_source, '<bot>', 'exec'), gen)
    bot = gen['Bot']()
    # "Drive.forward() missing 1 required argument" reads better as "bot.drive.forward() ...".
    renames = [(f'{cls.__name__}.', f'bot.{cls._attr}.') for cls in gen.values()
               if isinstance(cls, type) and issubclass(cls, _Part)] + [('Bot.', 'bot.')]

    player_builtins = dict(builtins.__dict__)
    player_builtins.update(input=_no_input, __import__=_guarded_import)
    namespace = {
        '__name__': '__main__', '__builtins__': player_builtins, 'bot': bot,
        'BotError': BotError, 'BlasterNotReady': BlasterNotReady,
        'OutOfEnergy': OutOfEnergy, 'PartNotFitted': PartNotFitted,
    }
    random.seed(seed)
    consoles = _Console(session, 'stdout'), _Console(session, 'stderr')
    sys.stdout, sys.stderr = consoles

    try:
        code = compile(script, 'main.py', 'exec')
        if watchdog_seconds:
            _install_watchdog(session, watchdog_seconds)
        exec(code, namespace)
    except _MatchOver:
        return _dumps({'status': 'over'})
    except SystemExit:
        pass
    except _Watchdog as exc:
        if session.over:
            return _dumps({'status': 'over'})
        return _dumps({'status': 'watchdog', 'line': _error_line(exc)})
    except _InternalError as exc:
        return _dumps({'status': 'internal', 'message': str(exc)})
    except BaseException as exc:
        return _dumps({
            'status': 'error',
            'type': type(exc).__name__,
            'message': _error_message(exc, renames),
            'line': _error_line(exc),
            'game': isinstance(exc, BotError),
        })
    finally:
        sys.settrace(None)
        for console in consoles:
            console.close_line()
        _restore_modules(_PRISTINE)
    return _dumps({'status': 'over' if session.over else 'ok'})


_PRISTINE = _snapshot_modules()
`;const U=e=>JSON.stringify(e),W=e=>e.split(`_`).map(e=>e[0].toUpperCase()+e.slice(1)).join(``);function ge(e){let t=[e.summary,``,e.doc];for(let n of e.params)t.push(`  ${n.name}: ${n.doc}`);return e.raises?.length&&t.push(`Raises ${e.raises.join(`, `)}.`),e.example&&t.push(``,`Example:`,...e.example.split(`
`).map(e=>`    ${e}`)),U(t.join(`
`))}function G(e,t){let n=e?`bot.${e}.${t.name}`:`bot.${t.name}`,r=ie(t).slice(t.name.length+1,-1),i=`    def ${t.name}(self${r?`, `+r:``}):\n        ${ge(t)}\n`;if(e===``&&t.name===`log`)return`${i}        _log(${t.params[0].name})\n`;let a=t.params.map(e=>e.type===`float`||e.type===`int`?`_num(${e.name}, ${U(e.name)}, ${U(n)})`:e.type===`bool`?`bool(${e.name})`:e.name);return`${i}        return _call(${U(e)}, ${U(t.name)}, [${a.join(`, `)}], ${U(t.returns)})\n`}function _e(e,t,n){let r=n.methods.map(t=>G(e,t)).join(`
`);return`class ${W(e)}(_Part):\n    ${U(n.summary)}\n    _attr = ${U(e)}\n    _part = ${U(t)}\n\n${r}`}function ve(e){let t=re(e),n=t.filter(e=>e.attr!==``),r=[];for(let{attr:e,api:t}of n)r.push(_e(e,String(t.part),t));let i=t.find(e=>e.attr===``).api,a=n.map(({attr:e})=>`        self.${e} = ${W(e)}()`),o=n.map(({attr:e,api:t})=>`${U(e)}: ${U(String(t.part))}`).join(`, `);return r.push(`class Bot(_BotBase):\n    "Your robot. Only the parts fitted in the Workshop exist on bot."\n    _fitted = {${o}}\n\n    def __init__(self):\n${a.length?a.join(`
`):`        pass`}\n\n`+i.methods.map(e=>G(``,e)).join(`
`)),r.join(`

`)}const ye=[[/expected ':'/,()=>({friendly:`A line that starts a block (if, while, for, def, else) must end with a colon :`,tip:"Tip: write `while True:` - the colon is easy to forget."})],[/unterminated string|EOL while scanning/,()=>({friendly:`A piece of text is missing its closing quote mark.`,tip:`Tip: strings need a quote at both ends, like "hello".`})],[/unterminated triple-quoted string/,()=>({friendly:`A """triple-quoted""" string is never closed.`})],[/'(.)' was never closed/,e=>({friendly:`A bracket ${e[1]} was opened but never closed.`,tip:`Tip: every ( needs a matching ), every [ a ].`})],[/unmatched '(.)'|closing parenthesis '(.)' does not match/,e=>({friendly:`There is a closing bracket ${e[1]??e[2]} without a matching opening one.`})],[/Maybe you meant '==' or ':=' instead of '='|cannot assign to/,()=>({friendly:`You used = where Python expected a comparison or a name.`,tip:"Tip: = stores a value, == compares two values: `if x == 3:`"})],[/Perhaps you forgot a comma/,()=>({friendly:`Python found two values next to each other with nothing between them.`,tip:`Tip: separate arguments with commas: bot.gps.bearing_to(400, 200)`})],[/invalid decimal literal/,()=>({friendly:`A name or number is malformed - names cannot start with a digit.`})],[/'return' outside function/,()=>({friendly:"`return` only works inside a function (def)."})],[/'break' outside loop|'continue' not properly in loop/,()=>({friendly:"`break` and `continue` only work inside a loop (while or for)."})]],be=[[/expected an indented block/,()=>({friendly:`The line after a colon : needs to be indented.`,tip:`Tip: indent the body of if / while / for / def by 4 spaces.`})],[/unexpected indent/,()=>({friendly:`This line is indented more than Python expected.`,tip:`Tip: only indent lines that belong to a block (after a line ending in :).`})],[/unindent does not match/,()=>({friendly:`This line's indentation doesn't line up with the lines above it.`,tip:`Tip: lines in the same block must start at exactly the same column.`})]],K={true:`True`,false:`False`,none:`None`};function xe(e){let t=/name '(\w+)' is not defined/.exec(e)?.[1];if(!t)return{friendly:`Python met a name it does not know.`};if(K[t.toLowerCase()]&&t!==K[t.toLowerCase()])return{friendly:`Python doesn't know '${t}'. It is spelled ${K[t.toLowerCase()]}, with a capital letter.`};let n=/Did you mean: '(\w+)'/.exec(e)?.[1];return{friendly:`Python doesn't know the name '${t}'.`+(n?` Did you mean '${n}'?`:``),tip:`Tip: check the spelling (Python cares about capitals), and set a variable before you use it. Parts live on bot, e.g. bot.drive.`}}function Se(e){let t;if(t=/^(\S+)\(\) missing \d+ required positional arguments?: (.+)$/.exec(e))return{friendly:`${t[1]}() needs more information: you left out ${t[2]}.`,tip:`Tip: put the value inside the brackets, e.g. bot.drive.forward(100).`};if(t=/^(\S+)\(\) takes (\d+) positional arguments? but (\d+) (?:was|were) given$/.exec(e)){let e=t[1].startsWith(`bot.`),n=Number(t[2])-+!!e,r=Number(t[3])-+!!e;return{friendly:`${t[1]}() takes ${n===0?`no values`:n===1?`1 value`:`${n} values`} but you gave it ${r}.`}}if(t=/^(\S+)\(\) needs a number for (\w+), not (\w+)/.exec(e)){let e=t[3]===`str`?` Numbers go without quotes: 100, not "100".`:``;return{friendly:`${t[1]}() needs a number for ${t[2]}, but got a ${t[3]}.${e}`}}return/'(method|builtin_function_or_method|function)' object/.test(e)||/instances of 'method'/.test(e)?{friendly:`You used a method without calling it.`,tip:`Tip: add brackets to call it: bot.front_sensor.distance(), not bot.front_sensor.distance`}:/'NoneType' object/.test(e)?{friendly:`You used a value that is None (nothing).`,tip:`Tip: some calls return None, e.g. bot.drive.forward(100, wait=False) - don't use their result.`}:/can only concatenate str|unsupported operand type\(s\)/.test(e)?{friendly:`You mixed two types that cannot be combined, like text and a number.`,tip:`Tip: use str(x) to turn a number into text, or print("x is", x).`}:/object is not callable/.test(e)?{friendly:`You put brackets () after something that is not a function or method.`}:{friendly:`A value of the wrong type was used.`}}function Ce(t,n){if(t in e){let r=e[t],i=n||r.message;return{friendly:i[0].toUpperCase()+i.slice(1),tip:r.tip}}let r=e=>{for(let[t,r]of e){let e=n.match(t);if(e)return r(e)}};switch(t){case`SyntaxError`:return r(ye)??{friendly:`Python couldn't understand this line.`,tip:`Tip: look for a missing colon, bracket or quote here or on the line above.`};case`IndentationError`:case`TabError`:return r(be)??{friendly:`The indentation (spaces at the start of the line) is wrong here.`};case`NameError`:case`UnboundLocalError`:return xe(n);case`TypeError`:return Se(n);case`AttributeError`:return{friendly:n.startsWith(`bot`)?n:`That value doesn't have what you asked for: ${n}`,tip:`Tip: the API panel lists everything your bot can do.`};case`ZeroDivisionError`:return{friendly:`You divided by zero, which has no answer.`,tip:`Tip: check the number is not 0 before dividing.`};case`IndexError`:return{friendly:`You asked for an item past the end of a list.`,tip:"Tip: lists start at 0; check len(x) first, or loop with `for item in x:`."};case`KeyError`:return{friendly:`That key is not in the dictionary: ${n}`};case`ValueError`:return{friendly:`A value had the right type but a bad value: ${n}`};case`ModuleNotFoundError`:case`ImportError`:return{friendly:`That module is not available in Bot Arena.`,tip:`Tip: math and random are available; anything that talks to the internet is not.`};case`RecursionError`:return{friendly:`A function kept calling itself and never stopped.`};case`RuntimeError`:return n.startsWith(`input()`)?{friendly:`input() cannot be used here: your bot cannot stop and ask questions.`}:{friendly:`Something went wrong: ${n}`};case`InternalError`:return{friendly:`Something went wrong inside Bot Arena itself - not your code. Try running again.`};default:return{friendly:`Python stopped with a ${t}: ${n}`}}}const q=/* @__PURE__ */ new WeakMap;function J(e){if(q.has(e))return;let t=e.globals.get(`dict`)();e.runPython(he,{globals:t,filename:`<bot-arena>`}),q.set(e,t.get(`run_player`)),t.destroy()}function Y(e,t,n,r){let{friendly:i,tip:a}=Ce(e,t),o={type:e,message:t,tick:n,friendly:i};return r!=null&&(o.line=r),a&&(o.tip=a),o}function we(e,n,r,i){J(e);let a=q.get(e),o=n({level:r.level,design:r.design,seed:r.seed,scriptLines:me(r.script)});i.onStarted?.(o.world);let s=i.flushMs??50,c=performance.now(),l=()=>{c=performance.now();let e=o.takeFrames();e.length&&i.onFrames(e)};l();let u=a(Te(o,()=>{performance.now()-c>=s&&l()}),ve(r.design),r.script,r.seed,(i.watchdogMs??0)/1e3),d=JSON.parse(u),f;if(!o.finished)switch(d.status){case`ok`:case`over`:o.finish();break;case`error`:f=Y(d.type,d.message,o.tick,d.line??void 0);break;case`watchdog`:f={type:`Watchdog`,message:t,friendly:t,tip:`Tip: every loop should call the bot (move, scan, wait...) so time passes.`,tick:o.tick},d.line!=null&&(f.line=d.line);break;case`internal`:f=Y(`InternalError`,d.message,o.tick)}f&&(l(),i.onError?.(f),o.abort(f.type===`Watchdog`?`watchdog`:f.type===`InternalError`?`aborted`:`script_error`)),l();let p={world:o.world,result:o.result()};return f&&(p.error=f),p}function Te(e,t){let i=-1,a=0,o=(t,n)=>{e.tick!==i&&(i=e.tick,a=0),a++,a<=200?e.print(t,n):a===201&&e.print(`... (too much output - some lines hidden)`,`stderr`)},s=(i,a,o)=>{if(e.finished)return`{"over":true}`;try{let t=e.call(i,a,o);return JSON.stringify({value:t??null})}catch(e){if(e instanceof r||e?.name===`MatchOver`)return`{"over":true}`;if(e instanceof n)return JSON.stringify({error:e.errorName,message:e.message});throw e}finally{t()}};return(e,t)=>{try{let n=JSON.parse(t);return e===`call`?s(n[0],n[1],n[2]):e===`print`?(o(n[0],n[1]),`{}`):JSON.stringify({internal:`unknown bridge op ${e}`})}catch(e){return JSON.stringify({internal:e instanceof Error?e.message:String(e)})}}}const X=`https://cdn.jsdelivr.net/pyodide/v314.0.7/full/`,Z=self,Ee=Z.postMessage.bind(Z),Q=e=>Ee(e);async function De(){let{loadPyodide:e}=await import(
/* @vite-ignore */
`${X}pyodide.mjs`),t=await e({indexURL:X,env:{PYTHONHASHSEED:`0`}});return J(t),H(),t}const $=De();$.then(e=>Q({type:`ready`,pyodideVersion:e.version}),e=>Q({type:`fatal`,message:`Python failed to load: ${e instanceof Error?e.message:String(e)}`})),Z.onmessage=async e=>{let t=e.data;if(t.type!==`run`)return;let n=await $,{runId:r}=t,i=0;try{let{result:e}=we(n,z,t,{onStarted:e=>Q({type:`started`,runId:r,world:e}),onFrames:e=>{i=e.at(-1).tick,Q({type:`frames`,runId:r,frames:e})},onError:e=>Q({type:`error`,runId:r,error:e})});Q({type:`done`,runId:r,result:e})}catch(e){let t=e instanceof Error?e.message:String(e);Q({type:`error`,runId:r,error:Y(`InternalError`,t,i)}),Q({type:`fatal`,message:t})}};
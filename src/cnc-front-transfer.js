// RobotRoot +X points along the tool, +Y is up. At this dock +X faces the CNC's -Z.
export const frontStation = 'CNC-L01';
export const gripOffset = {forward: 1.155, height: -.165};
export const fixtureHeight = 1.205;
const fixtures = {CNC:{height:fixtureHeight, depth:.87}, GRIND:{height:1.35, depth:.78},
  WIRE:{height:1.35, depth:.67}, EDM:{height:1.455, depth:.70}};
export const frontFixture = station => fixtures[station?.type];
const homeReach = 1.78, homeHeight = 1.70;
const lerp = (a,b,f) => a + (b-a)*f;
const smooth = f => f*f*(3-2*f);

export function frontTransferPose(station, action, mode, fraction) {
  const f = smooth(fraction);
  const {height:fixtureHeight, depth} = frontFixture(station);
  const approachHeight = fixtureHeight + .027;
  const full = station.dock[1] - (station.z + depth);
  let reach = homeReach, height = homeHeight, jaw = mode === 'place' ? 0 : 1;
  let onFixture = mode === 'pick', door = 0;
  switch (action) {
    case '開護罩':
    case '開門': door = f; break;
    case '鬆開治具':
    case '治具鬆開': door = 1; break;
    case '手臂伸入':
      door = 1; reach = lerp(homeReach,full,smooth(Math.max(0,(fraction-.25)/.75)));
      height = lerp(homeHeight,mode === 'place' ? approachHeight : fixtureHeight,smooth(Math.min(1,fraction/.25)));
      break;
    case '精定位': door = 1; reach = full; height = approachHeight; break;
    case '放妥工件':
    case '放置工件':
      door = 1; reach = full; height = lerp(approachHeight,fixtureHeight,f); break;
    case '夾爪張開':
      door = 1; reach = full; height = fixtureHeight; onFixture = true; jaw = f; break;
    case '夾爪夾緊':
      door = 1; reach = full; height = fixtureHeight; jaw = 1-f; break;
    case '抽出工件':
      door = 1; reach = full; height = lerp(fixtureHeight,approachHeight,f);
      onFixture = false; jaw = 0; break;
    case '手臂退出':
      door = 1; reach = lerp(full,homeReach,f);
      // Clear the workpiece end-on before raising the empty jaws.
      height = lerp(mode === 'place' ? fixtureHeight : approachHeight,homeHeight,
        smooth(Math.max(0,(fraction-.45)/.55)));
      onFixture = mode === 'place'; jaw = onFixture ? 1 : 0; break;
    case '夾緊治具':
    case '治具夾緊': door = 1; onFixture = true; jaw = 1; break;
    case '關護罩':
    case '關門':
    case '原路倒退退出':
      door = action === '原路倒退退出' ? 0 : 1-f; onFixture = mode === 'place'; jaw = onFixture ? 1 : 0; break;
  }
  return {reach,height,jaw,door,onFixture};
}

export function railSample(path, fraction) {
  const lengths = path.slice(1).map((p,i) => Math.hypot(p[0]-path[i][0],p[1]-path[i][1]));
  let remaining = fraction*lengths.reduce((a,b)=>a+b,0);
  for (let i=0;i<lengths.length;i++) {
    if (remaining<=lengths[i] || i===lengths.length-1) {
      const a=path[i], b=path[i+1], f=lengths[i] ? Math.min(1,remaining/lengths[i]) : 0;
      return {point:[lerp(a[0],b[0],f),lerp(a[1],b[1],f)], yaw:-Math.atan2(b[1]-a[1],b[0]-a[0])};
    }
    remaining-=lengths[i];
  }
}

// Planar two-link IK with a level wrist. Link lengths and rest angles come from the loaded robot.
export function poseFrontRobot(robot, railYaw, pose) {
  const {group,shoulder,elbow,wrist} = robot;
  group.rotation.y = railYaw;
  const upper = elbow.position, lower = wrist.position;
  const a = Math.hypot(upper.x,upper.y), b = Math.hypot(lower.x,lower.y);
  const dx = pose.reach - gripOffset.forward;
  const dy = pose.height - gripOffset.height - shoulder.position.y - shoulder.parent.position.y;
  const d = Math.hypot(dx,dy);
  const elbowUp = Math.atan2(dy,dx) + Math.acos(Math.max(-1, Math.min(1,(a*a+d*d-b*b)/(2*a*d))));
  const forearm = Math.atan2(dy-a*Math.sin(elbowUp),dx-a*Math.cos(elbowUp));
  const pitch = elbowUp-Math.atan2(upper.y,upper.x);
  const bend = forearm-Math.atan2(lower.y,lower.x)-pitch;
  shoulder.rotation.set(0,Math.PI/2-railYaw,pitch,'YXZ');
  elbow.rotation.set(0,0,bend);
  wrist.rotation.set(0,0,-pitch-bend);
  for (const jaw of robot.jaws) {
    const halfWidth = jaw.name.startsWith('rough') ? .055 : .060;
    jaw.position.z = Math.sign(jaw.position.z)*(.25+halfWidth+.04*pose.jaw);
  }
}

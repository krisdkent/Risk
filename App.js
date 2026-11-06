import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, SafeAreaView, Alert, StyleSheet, StatusBar } from 'react-native';
import Svg, { Polygon, Text as SvgText, Line, Circle, G } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';

// FRONTLINE LEGACY: an original, offline, local strategy prototype.
// Game logic is kept in pure functions so online multiplayer can later use a server authority.
const SAVE = '@frontline-legacy/v1';
const COLORS = ['#36c8e9', '#e78954', '#9ae06c', '#b28bf0', '#f0cd62'];
const FACTIONS = ['Azure Command', 'Ember Union', 'Verdant Pact', 'Violet Directorate', 'Golden Guard'];
const ROWS = [
  ['Frost Bay','Iron Coast','Northwatch','Gale Reach','Stormport','Aurora Point'],
  ['Greyford','Ash Plains','Cinder Ridge','Granite Gate','Warden Vale','Dawnfall'],
  ['Westhaven','Red Mesa','Central Bastion','Black Marsh','Eastward','Sunspire'],
  ['Dusk Harbor','Salt Flats','Southern Reach','Obsidian','Sable Ridge','Lastlight'],
];
const STARTS = [0,5,18,23,10];
const rand = n => Math.floor(Math.random()*n);
const roll = () => 1+rand(6);
const clamp = (v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const territories = ROWS.flat().map((name,id)=>({ id,name,r:Math.floor(id/6),c:id%6,continent:Math.floor((id%6)/2),
  neighbors:[...(id%6>0?[id-1]:[]),...(id%6<5?[id+1]:[]),...(id>=6?[id-6]:[]),...(id<18?[id+6]:[])],
}));
const worldPoints = (t) => {
  const x=t.c*144+8, y=t.r*135+8;
  const dx=((t.id*17)%15), dy=((t.id*11)%13);
  return `${x+10},${y+4+dy} ${x+122+dx/2},${y+2} ${x+136},${y+41} ${x+126},${y+117-dy/2} ${x+32},${y+125} ${x+2},${y+89}`;
};
const emptyWorld = () => territories.map(t=>({id:t.id,owner:-1,army:0,hq:-1,scar:0,city:0}));
const freshCampaign = (count=3, mode='ai') => ({
  version:1, games:0, victors:[], scars:{}, cities:{}, history:[], count, mode,
});
function beginGame(campaign){
  const board=emptyWorld();
  const players=Array.from({length:campaign.count},(_,id)=>({id,name:FACTIONS[id],stars: campaign.victors.includes(id)?0:1, cards:0, wonBefore: campaign.victors.includes(id), alive:true}));
  for(let id=0;id<campaign.count;id++){
    const cell=board[STARTS[id]]; cell.owner=id;cell.army=8;cell.hq=id;
  }
  board.forEach(t=>{t.scar=campaign.scars[t.id]||0;t.city=campaign.cities[t.id]||0;});
  return {board,players,turn:0,phase:'recruit',pool:0,selected:null,round:1,winner:null,log:['Campaign operation started. Capture headquarters to earn stars.'], campaign, maneuverUsed:false, conquered:false};
}
const own=(s,id)=>s.board.filter(t=>t.owner===id);
const stars=(s,id)=>s.players[id].stars+s.board.filter(t=>t.owner===id&&t.hq!==-1).length;
const income=(s,id)=>{
  const cells=own(s,id);if(!cells.length)return 3;
  let amount=Math.max(3,Math.floor((cells.length+cells.reduce((v,t)=>v+t.city,0))/3));
  for(let c=0;c<3;c++)if(s.board.filter(t=>territories[t.id].continent===c).every(t=>t.owner===id)) amount+=2;
  return amount;
};
function next(s){return {...s,board:s.board.map(t=>({...t})),players:s.players.map(p=>({...p})),log:[...s.log],campaign:{...s.campaign}};}
function log(s,text){s.log=[text,...s.log].slice(0,12);}
function victor(s,id){
  if(stars(s,id)<4 && s.players.some(p=>p.id!==id&&own(s,p.id).length))return;
  s.winner=id;s.phase='won';
  const prev=s.campaign;
  const victories=[...prev.victors]; if(!victories.includes(id))victories.push(id);
  const scars={...prev.scars}; const cities={...prev.cities};
  // A winning commander permanently fortifies one captured territory for the next game.
  const captured=own(s,id).find(t=>t.hq===-1&&t.city===0);
  if(captured) cities[captured.id]=1;
  s.campaign={...prev,games:prev.games+1,victors:victories,scars,cities,
    history:[{game:prev.games+1,winner:FACTIONS[id],round:s.round},...prev.history].slice(0,15)};
  log(s,`${FACTIONS[id]} wins Operation ${prev.games+1}! The world remembers.`);
}
function recruit(s,id,tId,amount){
  if(s.phase!=='recruit'||s.turn!==id||s.pool<amount||s.board[tId].owner!==id)return s;
  const n=next(s);n.board[tId].army+=amount;n.pool-=amount;
  log(n,`+${amount} troops deployed to ${territories[tId].name}.`);
  if(n.pool===0)n.phase='attack';return n;
}
function battle(s,id,from,to){
  if(s.turn!==id||s.phase!=='attack'||from===to)return s;
  const a=s.board[from],d=s.board[to];
  if(a.owner!==id||a.army<2||d.owner===id||!territories[from].neighbors.includes(to))return s;
  const n=next(s),att=n.board[from],def=n.board[to];
  const attacking=Array.from({length:Math.min(3,att.army-1)},roll).sort((a,b)=>b-a);
  const defending=Array.from({length:Math.min(2,Math.max(1,def.army))},roll).sort((a,b)=>b-a);
  let la=0,ld=0;
  for(let k=0;k<Math.min(attacking.length,defending.length);k++) attacking[k]>defending[k]?ld++:la++;
  att.army-=la;def.army-=ld;
  let desc=`${territories[from].name} → ${territories[to].name} • ${attacking.join('/')} vs ${defending.join('/')} • losses ${la}:${ld}`;
  if(def.army<=0){
    const defender=def.owner;
    def.owner=id;def.army=Math.min(attacking.length,att.army-1);att.army-=def.army;
    n.conquered=true;
    if(def.hq!==-1)desc+=' • HQ captured ★';
    if(defender>=0 && !own(n,defender).length)n.players[defender].alive=false;
    desc+=' • CAPTURED';
    victor(n,id);
  }else if(def.scar===0 && (la+ld)>=2 && Math.random()<0.13){
    // A small persistent battle scar illustrates the legacy mechanic.
    def.scar=1;n.campaign.scars[to]=1;desc+=' • permanent scar';
  }
  log(n,desc);return n;
}
function maneuver(s,from,to){
  if(s.phase!=='maneuver'||s.maneuverUsed||from===to)return s;
  const a=s.board[from],b=s.board[to];
  if(a.owner!==s.turn||b.owner!==s.turn||a.army<2)return s;
  // Only permit connected friendly paths.
  let visited=new Set([from]),queue=[from];
  while(queue.length){const at=queue.shift();for(const neighbor of territories[at].neighbors)
    if(s.board[neighbor].owner===s.turn&&!visited.has(neighbor)){visited.add(neighbor);queue.push(neighbor);}}
  if(!visited.has(to))return s;
  const n=next(s);const moved=Math.max(1,Math.floor((n.board[from].army-1)/2));
  n.board[from].army-=moved;n.board[to].army+=moved;n.maneuverUsed=true;
  log(n,`${moved} troops maneuvered to ${territories[to].name}.`);return n;
}
function advance(s){
  if(s.winner!==null)return s;
  const n=next(s);n.selected=null;
  if(n.phase==='recruit')return n;
  if(n.phase==='attack'){n.phase='maneuver';return n;}
  if(n.phase==='maneuver'){
    if(n.conquered)n.players[n.turn].cards++;
    n.conquered=false;n.maneuverUsed=false;
    let p=n.turn;
    do {p=(p+1)%n.players.length;}while(!own(n,p).length&&p!==n.turn);
    if(p<=n.turn)n.round++;
    n.turn=p;n.phase='recruit';n.pool=income(n,p);
    log(n,`${FACTIONS[p]} turn • ${n.pool} reinforcements.`);
  }
  return n;
}
function playAi(s){
  let n=next(s);const id=n.turn;
  if(n.winner!==null||id===0||n.campaign.mode!=='ai')return n;
  if(n.phase==='recruit'){
    const poss=own(n,id);if(!poss.length){n.phase='attack';return n;}
    const border=poss.filter(t=>territories[t.id].neighbors.some(j=>n.board[j].owner!==id));
    const target=(border.length?border:poss).sort((a,b)=>b.army-a.army)[0];
    n=recruit(n,id,target.id,n.pool);
  }
  if(n.phase==='attack'){
    for(let attempt=0;attempt<8 && n.winner===null;attempt++){
      const options=own(n,id).flatMap(t=>territories[t.id].neighbors
        .filter(j=>n.board[j].owner!==id&&t.army>=2)
        .map(j=>({from:t.id,to:j,adv:t.army-n.board[j].army, hq:n.board[j].hq!==-1})))
        .sort((a,b)=>(b.hq?4:0)+b.adv-((a.hq?4:0)+a.adv));
      if(!options.length||options[0].adv<0)break;
      const picked=options[0];n=battle(n,id,picked.from,picked.to);
    }
    if(n.winner===null)n=advance(n);
  }
  if(n.phase==='maneuver')n=advance(n);
  return n;
}
function Btn({label,onPress,disabled,kind}){
  return <TouchableOpacity onPress={onPress} disabled={disabled} style={[styles.btn,kind==='secondary'&&styles.btnSecondary,disabled&&{opacity:.38}]}><Text style={styles.btnTxt}>{label}</Text></TouchableOpacity>;
}
export default function App(){
  const [game,setGame]=useState(null);
  const [ready,setReady]=useState(false);
  const [screen,setScreen]=useState('menu');
  const [count,setCount]=useState(3);
  const [mode,setMode]=useState('ai');
  const [zoom,setZoom]=useState(1);
  const [showLog,setShowLog]=useState(false);
  useEffect(()=>{(async()=>{try{const json=await AsyncStorage.getItem(SAVE);if(json){const g=JSON.parse(json);if(g?.board?.length===24){setGame(g);setCount(g.campaign.count);setMode(g.campaign.mode);}}}catch(e){}setReady(true);})();},[]);
  useEffect(()=>{if(ready&&game)AsyncStorage.setItem(SAVE,JSON.stringify(game)).catch(()=>{});},[game,ready]);
  useEffect(()=>{if(!game||screen!=='game'||game.winner!==null||game.campaign.mode!=='ai'||game.turn===0)return;
    const timer=setTimeout(()=>setGame(g=>g&&g.turn!==0?playAi(g):g),420);
    return()=>clearTimeout(timer);
  },[game,screen]);
  const selected=game?.selected;
  const selectedTerritory=selected==null?null:game.board[selected];
  const current=game?.players[game.turn];
  const start=()=>{const g=beginGame(freshCampaign(count,mode));g.pool=income(g,0);setGame(g);setScreen('game');};
  const replay=()=>{const g=beginGame(game.campaign);g.pool=income(g,0);setGame(g);setScreen('game');};
  const clickTerritory=(id)=>{
    setGame(old=>{
      if(!old||old.winner!==null||old.campaign.mode==='ai'&&old.turn!==0)return old;
      const s=old, t=s.board[id],from=s.selected;
      if(s.phase==='recruit'){
        if(t.owner!==s.turn)return {...s,selected:id};
        const n=recruit(s,s.turn,id,1);return {...n,selected:id};
      }
      if(from!==null && from!==id){
        if(s.phase==='attack'&&s.board[from].owner===s.turn&&t.owner!==s.turn)return {...battle(s,s.turn,from,id),selected:from};
        if(s.phase==='maneuver'&&s.board[from].owner===s.turn&&t.owner===s.turn)return {...maneuver(s,from,id),selected:id};
      }
      return {...s,selected:id};
    });
  };
  if(!ready)return <SafeAreaView style={styles.root}><Text style={styles.title}>Loading Frontline Legacy…</Text></SafeAreaView>;
  if(screen==='menu')return <SafeAreaView style={styles.root}><StatusBar barStyle="light-content"/>
    <ScrollView contentContainerStyle={styles.menu}>
      <Text style={styles.kicker}>STRATEGY COMMAND / MOBILE</Text>
      <Text style={styles.logo}>FRONTLINE{'\n'}LEGACY</Text><Text style={styles.sub}>Every war leaves a mark.</Text>
      <View style={styles.panel}><Text style={styles.heading}>NEW CAMPAIGN</Text><Text style={styles.label}>PLAY MODE</Text>
        <View style={styles.buttons}><Btn label="VS COMPUTER" kind={mode==='ai'?null:'secondary'} onPress={()=>setMode('ai')}/><Btn label="PASS & PLAY" kind={mode==='local'?null:'secondary'} onPress={()=>setMode('local')}/></View>
        <Text style={styles.label}>FACTIONS: {count}</Text><View style={styles.buttons}>{[2,3,4,5].map(n=><Btn key={n} label={String(n)} kind={count===n?null:'secondary'} onPress={()=>setCount(n)}/>)}</View>
        <Text style={styles.note}>Single-player: you command Azure, the others are computer controlled. Multiplayer: share this phone, passing it after each turn.</Text>
        <Btn label="START NEW CAMPAIGN" onPress={()=>{if(game)Alert.alert('Replace saved campaign?','A new campaign erases the existing world and its history.',[{text:'Cancel',style:'cancel'},{text:'Start',style:'destructive',onPress:start}]);else start();}}/>
      </View>
      {game&&<View style={styles.panel}><Text style={styles.heading}>SAVED CAMPAIGN</Text><Text style={styles.note}>Operations completed: {game.campaign.games} • Current round: {game.round}</Text><Btn label={game.winner===null?'RESUME OPERATION':'VIEW VICTORY'} onPress={()=>setScreen('game')}/>{game.winner!==null&&<Btn label="NEXT OPERATION" kind="secondary" onPress={replay}/>}</View>}
      <Text style={styles.footer}>Original prototype • Offline • Saves automatically on this device</Text>
    </ScrollView></SafeAreaView>;
  const mapHeight=550*zoom,mapWidth=880*zoom;
  return <SafeAreaView style={styles.root}><StatusBar barStyle="light-content"/>
    <View style={styles.top}><TouchableOpacity onPress={()=>setScreen('menu')}><Text style={styles.back}>‹ MENU</Text></TouchableOpacity><Text style={styles.topTitle}>OPERATION {game.campaign.games+1}</Text><Text style={styles.round}>R{game.round}</Text></View>
    <View style={styles.status}><View><Text style={[styles.heading,{color:COLORS[game.turn]}]}>{current.name}</Text><Text style={styles.note}>{game.winner!==null?'VICTORY':game.phase.toUpperCase()} • {game.campaign.mode==='ai'&&game.turn!==0?'AI COMMAND':'CURRENT COMMAND'}</Text></View><View style={{alignItems:'flex-end'}}><Text style={styles.stars}>★ {stars(game,game.turn)} / 4</Text><Text style={styles.note}>{own(game,game.turn).length} territories</Text></View></View>
    <View style={styles.mapBar}><Text style={styles.label}>TACTICAL WORLD MAP • TAP A TERRITORY</Text><View style={styles.buttons}><Btn label="−" kind="secondary" onPress={()=>setZoom(v=>clamp(v-.25,.75,2))}/><Text style={styles.zoom}>{Math.round(zoom*100)}%</Text><Btn label="+" kind="secondary" onPress={()=>setZoom(v=>clamp(v+.25,.75,2))}/></View></View>
    <View style={{flex:1,backgroundColor:'#081423'}}><ScrollView horizontal contentContainerStyle={{minWidth:'100%'}}><ScrollView contentContainerStyle={{minHeight:'100%'}}><Svg width={mapWidth} height={mapHeight} viewBox="0 0 880 550">
      {territories.map(t=>t.neighbors.filter(id=>id>t.id).map(id=><Line key={`line${t.id}-${id}`} x1={t.c*144+78} y1={t.r*135+70} x2={territories[id].c*144+78} y2={territories[id].r*135+70} stroke="#526477" strokeWidth="2" strokeDasharray="4,4"/>))}
      {territories.map(t=>{const cell=game.board[t.id], active=selected===t.id,owned=cell.owner>=0;
        return <G key={t.id} onPress={()=>clickTerritory(t.id)}>
          <Polygon points={worldPoints(t)} fill={owned?COLORS[cell.owner]:'#253449'} fillOpacity={owned?.42:1} stroke={active?'#fff':owned?COLORS[cell.owner]:'#526377'} strokeWidth={active?4:1.7}/>
          <SvgText x={t.c*144+73} y={t.r*135+45} fontSize="12" textAnchor="middle" fill="#e8f3ff" fontWeight="bold">{t.name}</SvgText>
          <Circle cx={t.c*144+72} cy={t.r*135+76} r="20" fill="#101b2c" stroke={owned?COLORS[cell.owner]:'#65768a'} strokeWidth="2"/>
          <SvgText x={t.c*144+72} y={t.r*135+82} fontSize="17" textAnchor="middle" fontWeight="bold" fill="#fff">{cell.army||'·'}</SvgText>
          {cell.hq!==-1&&<SvgText x={t.c*144+123} y={t.r*135+110} fontSize="19" textAnchor="middle" fill="#ffd86a">★</SvgText>}
          {cell.scar>0&&<SvgText x={t.c*144+26} y={t.r*135+105} fontSize="17" textAnchor="middle" fill="#ff7777">✕</SvgText>}
          {cell.city>0&&<SvgText x={t.c*144+23} y={t.r*135+39} fontSize="18" textAnchor="middle" fill="#a1e6ff">◆</SvgText>}
        </G>})}</Svg></ScrollView></ScrollView></View>
    <View style={styles.bottom}>
      <View style={styles.selected}><View style={{flex:1}}><Text style={styles.heading}>{selectedTerritory?territories[selected].name:'SELECT TERRITORY'}</Text><Text style={styles.note}>{selectedTerritory?`${selectedTerritory.owner===-1?'Unclaimed':FACTIONS[selectedTerritory.owner]} • ${selectedTerritory.army} troops${selectedTerritory.hq!==-1?' • HQ':''}${selectedTerritory.scar?' • Scar':''}`:'Tap any region on the map'}</Text></View><TouchableOpacity onPress={()=>setShowLog(!showLog)}><Text style={styles.logBtn}>{showLog?'MAP':'LOG'}</Text></TouchableOpacity></View>
      {showLog?<ScrollView style={{height:94}}>{game.log.map((x,i)=><Text key={i} style={styles.logText}>• {x}</Text>)}</ScrollView>:<>
        <Text style={styles.guide}>{game.winner!==null?'Operation completed. Your changes will carry into the next game.':game.campaign.mode==='ai'&&game.turn!==0?'Computer is making its moves…':game.phase==='recruit'?`Deploy ${game.pool} reinforcements: tap one of your territories.`:game.phase==='attack'?'Tap your army, then an adjacent enemy to roll dice. Tap repeatedly to continue attacking.':'Optional: tap your army, then a connected friendly territory to transfer half; or end turn.'}</Text>
        {game.winner!==null?<Btn label="BEGIN NEXT OPERATION" onPress={replay}/>:
        <View style={styles.buttons}>{game.phase==='recruit'&&selectedTerritory?.owner===game.turn&&game.pool>0&&<Btn label={`DEPLOY ALL (${game.pool})`} onPress={()=>setGame(g=>recruit(g,g.turn,selected,g.pool))}/>}
          <Btn label={game.phase==='attack'?'TO MANEUVER':game.phase==='maneuver'?'END TURN':game.phase==='recruit'?'DEPLOY FIRST':'CONTINUE'} disabled={game.phase==='recruit'||game.campaign.mode==='ai'&&game.turn!==0} kind="secondary" onPress={()=>setGame(g=>advance(g))}/></View>}
      </>}
      <View style={styles.legend}>{game.players.map(p=><View key={p.id} style={styles.legendItem}><View style={{width:7,height:7,borderRadius:4,backgroundColor:COLORS[p.id]}}/><Text style={styles.legendText}>{p.name.split(' ')[0]} {stars(game,p.id)}★</Text></View>)}</View>
    </View>
  </SafeAreaView>;
}
const styles=StyleSheet.create({root:{flex:1,backgroundColor:'#08111f'},menu:{padding:22,paddingBottom:80},kicker:{color:'#61cfea',fontSize:11,fontWeight:'bold',letterSpacing:3,marginTop:30},logo:{fontSize:47,lineHeight:50,fontWeight:'900',color:'#e9f5ff',letterSpacing:1,marginTop:14},sub:{color:'#96aebe',fontSize:16,marginTop:10,marginBottom:30},panel:{backgroundColor:'#132237',padding:17,borderRadius:15,marginBottom:16,borderColor:'#2c4764',borderWidth:1,gap:12},heading:{fontSize:15,color:'#f3f7ff',fontWeight:'800'},label:{color:'#93b6cb',fontWeight:'700',fontSize:10,letterSpacing:1},note:{color:'#a5b8ca',fontSize:12,lineHeight:18},buttons:{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:7},btn:{paddingVertical:10,paddingHorizontal:14,borderRadius:8,backgroundColor:'#147d9b',alignItems:'center',justifyContent:'center',minHeight:37},btnSecondary:{backgroundColor:'#233951'},btnTxt:{color:'#fff',fontWeight:'800',fontSize:11,letterSpacing:.3},footer:{color:'#577487',fontSize:11,textAlign:'center',marginTop:10},top:{height:43,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:14,borderBottomWidth:1,borderBottomColor:'#273a52'},back:{color:'#65d5ee',fontSize:12,fontWeight:'bold'},topTitle:{color:'#e5f2fd',fontSize:13,fontWeight:'900'},round:{color:'#a2b9c9',fontSize:12},status:{padding:12,flexDirection:'row',justifyContent:'space-between',backgroundColor:'#132237'},stars:{color:'#ffda74',fontWeight:'900',fontSize:18},mapBar:{paddingHorizontal:10,paddingVertical:5,backgroundColor:'#101e30',flexDirection:'row',alignItems:'center',justifyContent:'space-between'},zoom:{color:'#e4f8ff',fontSize:11},bottom:{paddingHorizontal:12,paddingTop:10,paddingBottom:8,backgroundColor:'#132237',borderTopWidth:1,borderTopColor:'#37506b'},selected:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingBottom:7},guide:{color:'#a5c3d7',fontSize:12,lineHeight:17,minHeight:38,marginBottom:7},logBtn:{color:'#54d8ef',fontWeight:'900',fontSize:11,padding:10},logText:{color:'#c7d7e6',fontSize:11,marginBottom:5},legend:{flexDirection:'row',flexWrap:'wrap',gap:9,marginTop:10},legendItem:{flexDirection:'row',alignItems:'center',gap:3},legendText:{color:'#91a9bc',fontSize:10}});

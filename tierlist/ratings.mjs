// Higher is better. Unranked and excluded tiers are abstentions, not last-place votes.
export function groupRatings(images,players) {
  const voters=players.filter(player=>player.phase==='ready' || (player.phase==='offline' && player.progress===100));
  const values=new Map(images.map(image=>[image.id,{id:image.id,votes:0,tiers:0,ordered:0}]));
  for(const player of voters){
    const tiers=player.board.tiers.filter(tier=>!tier.excludeFromRatings),count=tiers.length;
    tiers.forEach((tier,index)=>tier.items.forEach((id,position)=>{
      const value=values.get(id);if(!value)return;
      value.votes++;value.tiers+=count===1?.5:1-index/(count-1);
      value.ordered+=1-(index+(position+.5)/tier.items.length)/count;
    }));
  }
  const ranked=[...values.values()].filter(value=>value.votes).map(value=>({...value,tiers:value.tiers/value.votes,ordered:value.ordered/value.votes}));
  const extrema=mode=>{
    if(!ranked.length)return {highest:[],lowest:[]};
    const high=Math.max(...ranked.map(value=>value[mode])),low=Math.min(...ranked.map(value=>value[mode]));
    return {highest:ranked.filter(value=>Math.abs(value[mode]-high)<1e-9),lowest:ranked.filter(value=>Math.abs(value[mode]-low)<1e-9)};
  };
  return {voters:voters.length,tiers:extrema('tiers'),ordered:extrema('ordered')};
}

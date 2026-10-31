export function tierlistFilename(name,date=new Date()) {
  let stem=String(name).normalize('NFC').replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g,'-').replace(/\.tierlist$/i,'').trim().replace(/[. ]+$/g,'') || 'tierlist';
  if(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(stem))stem='tierlist-'+stem;
  const encoder=new TextEncoder();let safe='';
  for(const char of stem){if(encoder.encode(safe+char).length>180)break;safe+=char;}
  return `${safe.replace(/[. ]+$/g,'') || 'tierlist'}-${date.toISOString().replace(/[:.]/g,'-')}.tierlist`;
}

// Local Python preview bridge. Production uses the restricted read Worker instead.
import{loadMediaManifest,loadMediaImage}from'./media-reader.mjs';
try{
 const chunks=[];let size=0;for await(const chunk of process.stdin){size+=chunk.length;if(size>16384)throw new Error('Import request is too large.');chunks.push(chunk);}const input=JSON.parse(Buffer.concat(chunks).toString('utf8')),signal=AbortSignal.timeout(45000);let data,type;
 if(input.route==='/media-import'){type='application/json';data=Buffer.from(JSON.stringify(await loadMediaManifest(input.url,signal,{cursor:input.cursor,version:input.version})));}
 else if(input.route==='/media-image'){const blob=await loadMediaImage(input.url,signal);type=blob.type;data=Buffer.from(await blob.arrayBuffer());}else throw new Error('Invalid public import route.');
 process.stdout.write(type+'\n');process.stdout.write(data);
}catch(error){process.stderr.write((error?.message||'Public import failed.').slice(0,300));process.exitCode=1;}

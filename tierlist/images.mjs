import {imageDimensions,MAX_THUMB_EDGE} from './model.mjs';
// Native image elements only receive validated embedded raster data.
export function setImageSource(node,image){
  const data=image.thumb || image.data;imageDimensions(data,image.thumb?MAX_THUMB_EDGE:undefined);
  node.referrerPolicy='no-referrer';node.loading='lazy';node.src=data;
}
